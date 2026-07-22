import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverFile = path.join(__dirname, 'server.js');

if (!fs.existsSync(serverFile)) {
  throw new Error(`Arquivo não encontrado: ${serverFile}`);
}

let source = fs.readFileSync(serverFile, 'utf8');
let changed = false;

const groupsMarker = 'ACHOU_LEVOU_GRUPOS_DIRETO_V1';

if (!source.includes(groupsMarker)) {
  const groupsRoutePattern = /app\.get\('\/groups', async \(req, res\) => \{[\s\S]*?\n\}\);\n\napp\.post\('\/send-controlado'/;

  const groupsRoute = `app.get('/groups', async (req, res) => {
  // ${groupsMarker}: evita que um chat incompatível derrube a lista inteira.
  try {
    if (status !== 'conectado') {
      return res.status(400).json({
        ok: false,
        error: 'WhatsApp ainda não conectado.',
        status
      });
    }

    const settings = getSettings();

    const groups = await client.pupPage.evaluate(() => {
      const collections = window.require('WAWebCollections');
      const chatCollection = collections?.Chat;

      if (!chatCollection) {
        throw new Error('Coleção de chats do WhatsApp indisponível.');
      }

      const chats = typeof chatCollection.getModelsArray === 'function'
        ? chatCollection.getModelsArray()
        : Array.from(chatCollection.models || []);

      return chats
        .filter(chat => {
          const id = chat?.id?._serialized || chat?.id?.toString?.() || '';
          return chat?.id?.isGroup?.() || id.endsWith('@g.us');
        })
        .map(chat => {
          const id = chat?.id?._serialized || chat?.id?.toString?.() || '';
          const name =
            chat?.name ||
            chat?.formattedTitle ||
            chat?.groupMetadata?.subject ||
            chat?.contact?.pushname ||
            'Grupo sem nome';

          return { id, name: String(name) };
        })
        .filter(group => group.id);
    });

    const uniqueGroups = Array.from(
      new Map(groups.map(group => [group.id, group])).values()
    )
      .map(group => ({
        ...group,
        category: settings.groupCategories?.[group.id] || 'geral'
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    res.json({
      ok: true,
      total: uniqueGroups.length,
      groups: uniqueGroups
    });
  } catch (error) {
    console.error('Erro ao carregar grupos:', error);
    res.status(500).json({
      ok: false,
      error: String(error?.message || error)
    });
  }
});

app.post('/send-controlado'`;

  if (!groupsRoutePattern.test(source)) {
    throw new Error('Não foi possível localizar a rota /groups em server.js.');
  }

  source = source.replace(groupsRoutePattern, groupsRoute);
  changed = true;
  console.log('✅ Rota /groups protegida contra falhas de conversão do WhatsApp Web.');
}

const panelStart = source.indexOf("app.get('/painel'");
const scriptStart = panelStart >= 0 ? source.indexOf('<script>', panelStart) : -1;
const scriptEnd = scriptStart >= 0 ? source.indexOf('</script>', scriptStart) : -1;

if (scriptStart >= 0 && scriptEnd > scriptStart) {
  const before = source.slice(0, scriptStart);
  const panelScript = source.slice(scriptStart, scriptEnd);
  const after = source.slice(scriptEnd);

  // server.js devolve HTML por template literal. Um \n simples vira quebra real
  // e pode invalidar strings do JavaScript executado pelo navegador.
  const safePanelScript = panelScript.replace(/(?<!\\)\\n/g, '\\\\n');

  if (safePanelScript !== panelScript) {
    source = before + safePanelScript + after;
    changed = true;
    console.log('✅ Quebras de linha do JavaScript interno do painel foram protegidas.');
  }
} else {
  console.warn('⚠️ Script interno do painel não foi localizado para verificação.');
}

if (changed) {
  const backupFile = path.join(__dirname, 'server.js.before-runtime-fixes');
  if (!fs.existsSync(backupFile)) {
    fs.copyFileSync(serverFile, backupFile);
  }
  fs.writeFileSync(serverFile, source, 'utf8');
  console.log('✅ Correções automáticas aplicadas em server.js.');
} else {
  console.log('✅ server.js já contém todas as correções necessárias.');
}
