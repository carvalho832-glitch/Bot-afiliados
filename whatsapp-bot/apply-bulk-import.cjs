const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, 'server.js');
let source = fs.readFileSync(serverPath, 'utf8');
let changed = false;

function insertAfter(anchor, block) {
  if (source.includes(block.trim())) return;
  if (!source.includes(anchor)) throw new Error(`Âncora não encontrada: ${anchor}`);
  source = source.replace(anchor, `${anchor}\n${block}`);
  changed = true;
}

function insertBefore(anchor, block) {
  if (source.includes(block.trim())) return;
  if (!source.includes(anchor)) throw new Error(`Âncora não encontrada: ${anchor}`);
  source = source.replace(anchor, `${block}\n${anchor}`);
  changed = true;
}

insertAfter(
  "import { buildWhatsAppSentAudit } from './whatsapp-history-audit.mjs';",
  "import { parseBulkImportPayload, secureTokenEqual } from './bulk-import.mjs';"
);

insertBefore(
  'app.use(cors());',
  `function requireBulkImportToken(req, res, next) {
  const expected = String(process.env.BULK_IMPORT_TOKEN || '').trim();
  if (!expected) {
    return res.status(503).json({
      ok: false,
      error: 'Importação em lote desativada. Configure BULK_IMPORT_TOKEN no ambiente do robô.'
    });
  }

  const provided = String(req.get('x-import-token') || '').trim();
  if (!secureTokenEqual(expected, provided)) {
    return res.status(401).json({ ok: false, error: 'Token de importação inválido.' });
  }

  next();
}
`
);

insertBefore(
  "app.post('/queue/start', async (req, res) => {",
  `app.post('/queue/import-batch', requireBulkImportToken, async (req, res) => {
  let parsed;
  try {
    parsed = parseBulkImportPayload(req.body || {});
  } catch (error) {
    return res.status(Number(error?.statusCode) || 400).json({
      ok: false,
      error: String(error?.message || error)
    });
  }

  const previousSettings = getSettings();
  const previousQueue = getQueue();
  let imported = 0;

  try {
    const settingsPatch = {
      ...parsed.settings,
      ...(parsed.start ? { enabled: true } : {})
    };
    const settings = Object.keys(settingsPatch).length
      ? saveSettings(settingsPatch)
      : previousSettings;

    const newItems = parsed.messages.map(message => {
      const item = createQueueItem(message);
      item.targets = escolherGruposPorCategoria(settings, item.category);
      item.error = item.targets.length ? null : 'Nenhum grupo ativo compatível com esta oferta.';
      return item;
    });

    saveQueue([...previousQueue, ...newItems]);
    imported = newItems.length;
    preencherGruposNasOfertasPendentes();
  } catch (error) {
    try { saveQueue(previousQueue); } catch {}
    try { saveSettings(previousSettings); } catch {}
    return res.status(500).json({
      ok: false,
      error: 'A importação falhou e as alterações foram revertidas.',
      detail: String(error?.message || error)
    });
  }

  if (parsed.start) {
    try {
      preencherGruposNasOfertasPendentes();
      const result = await startQueue();
      return res.json({
        ok: true,
        added: imported,
        started: true,
        settings: getSettings(),
        queue: result.queue
      });
    } catch (error) {
      return res.status(202).json({
        ok: true,
        added: imported,
        started: false,
        warning: 'As ofertas foram importadas, mas a fila não pôde ser iniciada agora.',
        detail: String(error?.message || error),
        settings: getSettings(),
        queue: getQueueSummary()
      });
    }
  }

  return res.json({
    ok: true,
    added: imported,
    started: false,
    settings: getSettings(),
    queue: getQueueSummary()
  });
});
`
);

const oldRoutes = "routes: ['/painel', '/status', '/diagnostics', '/groups', '/settings', '/queue', '/queue/review-source', '/audit/offers', '/audit/whatsapp-sent', '/qr-page']";
const newRoutes = "routes: ['/painel', '/status', '/diagnostics', '/groups', '/settings', '/queue', '/queue/import-batch', '/queue/review-source', '/audit/offers', '/audit/whatsapp-sent', '/qr-page']";
if (source.includes(oldRoutes)) {
  source = source.replace(oldRoutes, newRoutes);
  changed = true;
}

if (changed) {
  fs.writeFileSync(serverPath, source, 'utf8');
  console.log('✅ Importação em lote instalada no server.js.');
} else {
  console.log('ℹ️ Importação em lote já estava instalada.');
}
