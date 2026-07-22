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

const batchMarker = 'ACHOU_LEVOU_LOTE_OFERTAS_V1';

if (!source.includes(batchMarker)) {
  const requiredReplacements = [
    {
      name: 'configuração padrão',
      find: "  intervalMinutes: 10,\n  dailyLimit: 12,",
      replace: "  intervalMinutes: 10,\n  offersPerBatch: 2,\n  dailyLimit: 12,"
    },
    {
      name: 'persistência da configuração',
      find: "    intervalMinutes: Number(partial.intervalMinutes ?? current.intervalMinutes),\n    dailyLimit: Number(partial.dailyLimit ?? current.dailyLimit),",
      replace: "    intervalMinutes: Math.max(1, Number(partial.intervalMinutes ?? current.intervalMinutes ?? 10)),\n    offersPerBatch: Math.max(1, Math.min(10, Number(partial.offersPerBatch ?? current.offersPerBatch ?? 2))),\n    dailyLimit: Math.max(1, Number(partial.dailyLimit ?? current.dailyLimit ?? 12)),"
    },
    {
      name: 'checagem de intervalo por lote',
      find: "function podeEnviarAgora(settings) {",
      replace: "function podeEnviarAgora(settings, ignoreInterval = false) {"
    },
    {
      name: 'bloqueio de intervalo por lote',
      find: "  if (settings.lastSendAt && passouIntervalo < intervaloMs) {",
      replace: "  if (!ignoreInterval && settings.lastSendAt && passouIntervalo < intervaloMs) {"
    },
    {
      name: 'envio interno com liberação do lote',
      find: "async function sendMessageToGroup(message, target) {\n  const settings = getSettings();\n  const bloqueio = podeEnviarAgora(settings);",
      replace: "async function sendMessageToGroup(message, target, options = {}) {\n  const settings = getSettings();\n  const bloqueio = podeEnviarAgora(settings, Boolean(options.ignoreInterval));"
    },
    {
      name: 'campo no painel',
      find: '        <div class="field"><label for="intervalMinutes">Intervalo entre envios em minutos:</label><input type="number" id="intervalMinutes" min="1" max="180"></div>\n        <div class="field"><label for="dailyLimit">Limite diário de envios:</label><input type="number" id="dailyLimit" min="1" max="500"></div>',
      replace: '        <div class="field"><label for="intervalMinutes">Intervalo entre os lotes em minutos:</label><input type="number" id="intervalMinutes" min="1" max="180"></div>\n        <div class="field"><label for="offersPerBatch">Quantas ofertas por envio:</label><input type="number" id="offersPerBatch" min="1" max="10" value="2"></div>\n        <div class="field"><label for="dailyLimit">Limite diário de envios:</label><input type="number" id="dailyLimit" min="1" max="500"></div>'
    },
    {
      name: 'carregamento do campo',
      find: "    document.getElementById('intervalMinutes').value = settingsAtual.intervalMinutes || 10;\n    document.getElementById('dailyLimit').value = settingsAtual.dailyLimit || 12;",
      replace: "    document.getElementById('intervalMinutes').value = settingsAtual.intervalMinutes || 10;\n    document.getElementById('offersPerBatch').value = settingsAtual.offersPerBatch || 2;\n    document.getElementById('dailyLimit').value = settingsAtual.dailyLimit || 12;"
    },
    {
      name: 'salvamento pelo painel',
      find: "    intervalMinutes: Number(document.getElementById('intervalMinutes').value || 10),\n    dailyLimit: Number(document.getElementById('dailyLimit').value || 12)",
      replace: "    intervalMinutes: Number(document.getElementById('intervalMinutes').value || 10),\n    offersPerBatch: Number(document.getElementById('offersPerBatch').value || 2),\n    dailyLimit: Number(document.getElementById('dailyLimit').value || 12)"
    },
    {
      name: 'permissão da API',
      find: "'windowEnd', 'intervalMinutes', 'dailyLimit'",
      replace: "'windowEnd', 'intervalMinutes', 'offersPerBatch', 'dailyLimit'"
    }
  ];

  for (const item of requiredReplacements) {
    if (!source.includes(item.find)) {
      throw new Error(`Não foi possível aplicar a correção de lote em: ${item.name}.`);
    }
    source = source.replace(item.find, item.replace);
  }

  const summaryPatterns = [
    {
      find: "'\\nIntervalo: ' + settingsAtual.intervalMinutes + ' min\\nLimite diário: ' + settingsAtual.dailyLimit",
      replace: "'\\nIntervalo: ' + settingsAtual.intervalMinutes + ' min\\nOfertas por envio: ' + (settingsAtual.offersPerBatch || 2) + '\\nLimite diário: ' + settingsAtual.dailyLimit"
    },
    {
      find: "'\\\\nIntervalo: ' + settingsAtual.intervalMinutes + ' min\\\\nLimite diário: ' + settingsAtual.dailyLimit",
      replace: "'\\\\nIntervalo: ' + settingsAtual.intervalMinutes + ' min\\\\nOfertas por envio: ' + (settingsAtual.offersPerBatch || 2) + '\\\\nLimite diário: ' + settingsAtual.dailyLimit"
    }
  ];

  const summaryPattern = summaryPatterns.find(item => source.includes(item.find));
  if (summaryPattern) {
    source = source.replace(summaryPattern.find, summaryPattern.replace);
  } else {
    console.warn('⚠️ Resumo visual não localizado; o campo continuará funcionando normalmente.');
  }

  const processQueuePattern = /async function processQueue\(\) \{[\s\S]*?\n\}\n\nconst client = new Client\(\{/;

  const processQueueReplacement = `async function processQueue() {
  // ${batchMarker}: envia várias ofertas para o mesmo grupo antes de aguardar o intervalo.
  if (!queueRunning || queueProcessing) return;
  queueProcessing = true;

  try {
    const settings = getSettings();
    const queue = getQueue();
    const offersPerBatch = Math.max(1, Math.min(10, Number(settings.offersPerBatch || 2)));
    let target = null;

    for (let i = 0; i < queue.length; i += 1) {
      const item = queue[i];
      if (item.status !== 'pending') continue;

      const targets = ensureQueueTargets(item, settings);
      const nextTarget = targets.find(group => !item.sentTargets.includes(group.id));

      if (!nextTarget) {
        item.status = 'sent';
        item.sentAt = item.sentAt || new Date().toISOString();
        continue;
      }

      target = nextTarget;
      break;
    }

    saveQueue(queue);

    if (!target) {
      queueRunning = false;
      clearQueueTimer();
      return;
    }

    const bloqueio = podeEnviarAgora(settings);
    if (bloqueio) {
      if (bloqueio.includes('Aguarde mais')) scheduleNextQueueRun(30000);
      else if (bloqueio.includes('Fora do horário')) scheduleNextQueueRun(60000);
      else {
        queueRunning = false;
        clearQueueTimer();
      }
      return;
    }

    const batchItems = [];

    for (const item of queue) {
      if (item.status !== 'pending') continue;

      const targets = ensureQueueTargets(item, settings);
      const matchingTarget = targets.find(group =>
        group.id === target.id && !item.sentTargets.includes(group.id)
      );

      if (matchingTarget) {
        batchItems.push({ itemId: item.id, target: matchingTarget });
      }

      if (batchItems.length >= offersPerBatch) break;
    }

    let sentInBatch = 0;

    for (const batchItem of batchItems) {
      const currentQueue = getQueue();
      const currentItem = currentQueue.find(item => item.id === batchItem.itemId);

      if (!currentItem || currentItem.status !== 'pending') continue;

      const result = await sendMessageToGroup(
        currentItem.message,
        batchItem.target,
        { ignoreInterval: sentInBatch > 0 }
      );

      const updatedQueue = getQueue();
      const itemIndex = updatedQueue.findIndex(item => item.id === batchItem.itemId);

      if (itemIndex >= 0) {
        const item = updatedQueue[itemIndex];
        ensureQueueTargets(item, getSettings());

        if (result.ok) {
          item.sentTargets = Array.isArray(item.sentTargets) ? item.sentTargets : [];
          if (!item.sentTargets.includes(batchItem.target.id)) {
            item.sentTargets.push(batchItem.target.id);
          }
          item.lastSentAt = new Date().toISOString();
          item.error = null;
          item.status = item.targets.every(group => item.sentTargets.includes(group.id)) ? 'sent' : 'pending';
          if (item.status === 'sent') item.sentAt = new Date().toISOString();
          sentInBatch += 1;
        } else {
          item.status = 'error';
          item.error = result.error;
        }

        saveQueue(updatedQueue);
      }

      if (!result.ok) {
        if (String(result.error || '').includes('Limite diário')) {
          queueRunning = false;
          clearQueueTimer();
          return;
        }
        break;
      }

      if (sentInBatch < batchItems.length) {
        await new Promise(resolve => setTimeout(resolve, 1200));
      }
    }

    if (!sentInBatch) {
      queueRunning = false;
      clearQueueTimer();
      return;
    }

    const updatedSettings = getSettings();
    const intervaloMs = Math.max(1, Number(updatedSettings.intervalMinutes || 10)) * 60 * 1000;
    scheduleNextQueueRun(intervaloMs);
  } finally {
    queueProcessing = false;
  }
}

const client = new Client({`;

  if (!processQueuePattern.test(source)) {
    throw new Error('Não foi possível localizar processQueue() para ativar os lotes.');
  }

  source = source.replace(processQueuePattern, processQueueReplacement);
  changed = true;
  console.log('✅ Campo e envio em lote restaurados. Padrão: 2 ofertas por envio.');
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
