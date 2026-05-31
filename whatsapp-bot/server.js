import express from 'express';
import cors from 'cors';
import qrcode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import pkg from 'whatsapp-web.js';

const { Client, LocalAuth } = pkg;
const app = express();
const PORT = process.env.PORT || 3010;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const QUEUE_FILE = path.join(DATA_DIR, 'queue.json');

fs.mkdirSync(DATA_DIR, { recursive: true });

const GRUPO_TESTE_ID = '120363426800905804@g.us';
const GRUPO_TESTE_NOME = 'Grupo teste';

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

let status = 'iniciando';
let qrDataUrl = null;
let qrRaw = null;
let readyAt = null;
let lastError = null;
let queueRunning = false;
let queueTimer = null;
let queueProcessing = false;

function hojeKey() {
  return new Date().toISOString().slice(0, 10);
}

const defaultSelectedGroups = [
  { id: GRUPO_TESTE_ID, name: GRUPO_TESTE_NOME }
];

const defaultSettings = {
  enabled: false,
  selectedGroupId: GRUPO_TESTE_ID,
  selectedGroupName: GRUPO_TESTE_NOME,
  selectedGroups: defaultSelectedGroups,
  windowStart: '09:00',
  windowEnd: '21:00',
  intervalMinutes: 10,
  dailyLimit: 12,
  sentToday: 0,
  sentDate: hojeKey(),
  lastSendAt: 0
};

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function normalizeGroups(groups, fallback = defaultSelectedGroups) {
  const source = Array.isArray(groups) ? groups : [];
  const map = new Map();

  source.forEach(group => {
    if (!group) return;

    if (typeof group === 'string') {
      const value = group.trim();
      if (value && !map.has(value)) map.set(value, { id: value, name: value });
      return;
    }

    const id = String(group.id || group.chatId || group.value || group._serialized || '').trim();
    const name = String(group.name || group.nome || group.title || group.label || id).trim();

    if (id && !map.has(id)) {
      map.set(id, { id, name: name || id });
    }
  });

  const normalized = Array.from(map.values());
  return normalized.length ? normalized : fallback;
}

function migrateSelectedGroups(settings) {
  if (Array.isArray(settings.selectedGroups) && settings.selectedGroups.length) {
    return normalizeGroups(settings.selectedGroups);
  }

  if (Array.isArray(settings.selectedGroupIds) && settings.selectedGroupIds.length) {
    return normalizeGroups(settings.selectedGroupIds.map((id, index) => ({
      id,
      name: settings.selectedGroupNames?.[index] || id
    })));
  }

  if (settings.selectedGroupId) {
    return normalizeGroups([
      {
        id: settings.selectedGroupId,
        name: settings.selectedGroupName || settings.selectedGroupId
      }
    ]);
  }

  return defaultSelectedGroups;
}

function getSettings() {
  const saved = readJson(SETTINGS_FILE, {});
  const groups = migrateSelectedGroups(saved);
  const firstGroup = groups[0] || defaultSelectedGroups[0];

  const settings = {
    ...defaultSettings,
    ...saved,
    selectedGroups: groups,
    selectedGroupId: firstGroup.id,
    selectedGroupName: firstGroup.name
  };

  if (settings.sentDate !== hojeKey()) {
    settings.sentToday = 0;
    settings.sentDate = hojeKey();
    settings.lastSendAt = 0;
    writeJson(SETTINGS_FILE, settings);
  }

  return settings;
}

function saveSettings(partial) {
  const current = getSettings();
  const selectedGroups = normalizeGroups(
    partial.selectedGroups ?? partial.groups ?? current.selectedGroups,
    current.selectedGroups
  );
  const firstGroup = selectedGroups[0] || defaultSelectedGroups[0];

  const next = {
    ...current,
    ...partial,
    selectedGroups,
    selectedGroupId: firstGroup.id,
    selectedGroupName: firstGroup.name,
    intervalMinutes: Number(partial.intervalMinutes ?? current.intervalMinutes),
    dailyLimit: Number(partial.dailyLimit ?? current.dailyLimit),
    enabled: Boolean(partial.enabled ?? current.enabled)
  };

  writeJson(SETTINGS_FILE, next);
  return next;
}

function getQueue() {
  const queue = readJson(QUEUE_FILE, []);
  return Array.isArray(queue) ? queue : [];
}

function saveQueue(queue) {
  writeJson(QUEUE_FILE, queue);
  return queue;
}

function createQueueItem(message) {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    message: String(message || '').trim(),
    status: 'pending',
    targets: null,
    sentTargets: [],
    createdAt: new Date().toISOString(),
    sentAt: null,
    lastSentAt: null,
    error: null
  };
}

function parseTimeToMinutes(value = '00:00') {
  const [h, m] = String(value).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minutesNow() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function dentroDoHorario(settings) {
  const now = minutesNow();
  const start = parseTimeToMinutes(settings.windowStart);
  const end = parseTimeToMinutes(settings.windowEnd);

  if (start <= end) return now >= start && now <= end;
  return now >= start || now <= end;
}

function podeEnviarAgora(settings) {
  const groups = normalizeGroups(settings.selectedGroups, []);

  if (!settings.enabled) return 'Bot desativado. Ative no painel antes de enviar.';
  if (status !== 'conectado') return 'WhatsApp ainda não conectado.';
  if (!groups.length) return 'Nenhum grupo selecionado.';
  if (!dentroDoHorario(settings)) return `Fora do horário permitido: ${settings.windowStart} até ${settings.windowEnd}.`;
  if (settings.sentToday >= settings.dailyLimit) return `Limite diário atingido: ${settings.dailyLimit} envio(s).`;

  const intervaloMs = Math.max(1, Number(settings.intervalMinutes || 10)) * 60 * 1000;
  const passouIntervalo = Date.now() - Number(settings.lastSendAt || 0);

  if (settings.lastSendAt && passouIntervalo < intervaloMs) {
    const restanteMs = intervaloMs - passouIntervalo;
    const restanteMin = Math.ceil(restanteMs / 60000);
    return `Aguarde mais ${restanteMin} minuto(s) para respeitar o intervalo configurado.`;
  }

  return null;
}

function ensureQueueTargets(item, settings) {
  const currentTargets = normalizeGroups(item.targets, []);
  const targets = currentTargets.length ? currentTargets : normalizeGroups(settings.selectedGroups, []);
  item.targets = targets;
  item.sentTargets = Array.isArray(item.sentTargets) ? item.sentTargets : [];
  return targets;
}

function getQueueSummary() {
  const queue = getQueue();

  return {
    total: queue.length,
    pending: queue.filter(item => item.status === 'pending').length,
    sent: queue.filter(item => item.status === 'sent').length,
    error: queue.filter(item => item.status === 'error').length,
    running: queueRunning,
    processing: queueProcessing,
    items: queue
  };
}

async function sendMessageToGroup(message, target) {
  const settings = getSettings();
  const bloqueio = podeEnviarAgora(settings);

  if (bloqueio) {
    return { ok: false, error: bloqueio, settings };
  }

  const chat = await client.getChatById(target.id);

  if (!chat || !chat.isGroup) {
    return { ok: false, error: `Grupo inválido: ${target.name || target.id}`, settings };
  }

  await chat.sendMessage(String(message).trim());

  const updated = saveSettings({
    sentToday: settings.sentToday + 1,
    sentDate: hojeKey(),
    lastSendAt: Date.now()
  });

  return {
    ok: true,
    groupId: target.id,
    groupName: target.name || chat.name,
    sentToday: updated.sentToday,
    dailyLimit: updated.dailyLimit,
    sentAt: new Date().toISOString()
  };
}

async function sendMessageToConfiguredGroups(message) {
  const settings = getSettings();
  const groups = normalizeGroups(settings.selectedGroups, []);

  if (!groups.length) {
    return { ok: false, error: 'Nenhum grupo selecionado.', settings };
  }

  const results = [];

  for (const group of groups) {
    const currentSettings = getSettings();

    if (currentSettings.sentToday >= currentSettings.dailyLimit) {
      return {
        ok: results.length > 0,
        partial: true,
        error: `Limite diário atingido: ${currentSettings.dailyLimit} envio(s).`,
        results,
        sentToday: currentSettings.sentToday,
        dailyLimit: currentSettings.dailyLimit
      };
    }

    if (!currentSettings.enabled) return { ok: false, error: 'Bot desativado.', results };
    if (status !== 'conectado') return { ok: false, error: 'WhatsApp ainda não conectado.', results };
    if (!dentroDoHorario(currentSettings)) {
      return { ok: false, error: `Fora do horário permitido: ${currentSettings.windowStart} até ${currentSettings.windowEnd}.`, results };
    }

    const chat = await client.getChatById(group.id);

    if (!chat || !chat.isGroup) {
      results.push({ ok: false, groupId: group.id, groupName: group.name, error: 'Grupo inválido.' });
      continue;
    }

    await chat.sendMessage(String(message).trim());

    const updated = saveSettings({
      sentToday: currentSettings.sentToday + 1,
      sentDate: hojeKey(),
      lastSendAt: Date.now()
    });

    results.push({
      ok: true,
      groupId: group.id,
      groupName: group.name || chat.name,
      sentToday: updated.sentToday,
      dailyLimit: updated.dailyLimit
    });

    await new Promise(resolve => setTimeout(resolve, 1200));
  }

  const updatedSettings = getSettings();

  return {
    ok: results.some(item => item.ok),
    results,
    sentToday: updatedSettings.sentToday,
    dailyLimit: updatedSettings.dailyLimit,
    groupName: results.filter(item => item.ok).map(item => item.groupName).join(', ')
  };
}

function clearQueueTimer() {
  if (queueTimer) {
    clearTimeout(queueTimer);
    queueTimer = null;
  }
}

function scheduleNextQueueRun(delayMs = 1000) {
  clearQueueTimer();
  if (!queueRunning) return;

  queueTimer = setTimeout(() => {
    processQueue().catch(error => {
      console.log('Erro na fila:', error.message);
      scheduleNextQueueRun(30000);
    });
  }, delayMs);
}

async function processQueue() {
  if (!queueRunning || queueProcessing) return;

  queueProcessing = true;

  try {
    const settings = getSettings();
    const queue = getQueue();
    let nextIndex = -1;
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

      nextIndex = i;
      target = nextTarget;
      break;
    }

    saveQueue(queue);

    if (nextIndex === -1 || !target) {
      queueRunning = false;
      clearQueueTimer();
      return;
    }

    const bloqueio = podeEnviarAgora(settings);

    if (bloqueio) {
      if (bloqueio.includes('Aguarde mais')) {
        scheduleNextQueueRun(30000);
      } else if (bloqueio.includes('Fora do horário')) {
        scheduleNextQueueRun(60000);
      } else {
        queueRunning = false;
        clearQueueTimer();
      }

      return;
    }

    const nextItem = queue[nextIndex];
    const result = await sendMessageToGroup(nextItem.message, target);
    const updatedQueue = getQueue();
    const itemIndex = updatedQueue.findIndex(item => item.id === nextItem.id);

    if (itemIndex >= 0) {
      const item = updatedQueue[itemIndex];
      ensureQueueTargets(item, settings);

      if (result.ok) {
        item.sentTargets = Array.isArray(item.sentTargets) ? item.sentTargets : [];
        if (!item.sentTargets.includes(target.id)) item.sentTargets.push(target.id);
        item.lastSentAt = new Date().toISOString();
        item.error = null;

        if (item.targets.every(group => item.sentTargets.includes(group.id))) {
          item.status = 'sent';
          item.sentAt = new Date().toISOString();
        } else {
          item.status = 'pending';
        }
      } else {
        item.status = 'error';
        item.error = result.error;
      }

      saveQueue(updatedQueue);
    }

    const updatedSettings = getSettings();
    const intervaloMs = Math.max(1, Number(updatedSettings.intervalMinutes || 10)) * 60 * 1000;
    scheduleNextQueueRun(intervaloMs);
  } finally {
    queueProcessing = false;
  }
}

const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'achou-levou-julio' }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

client.on('qr', async qr => {
  status = 'aguardando_qr';
  qrRaw = qr;
  qrDataUrl = await qrcode.toDataURL(qr);
  console.log('QR Code gerado. Abra http://localhost:3010/qr-page');
});

client.on('authenticated', () => {
  status = 'autenticado';
  console.log('WhatsApp autenticado...');
});

client.on('ready', () => {
  status = 'conectado';
  readyAt = new Date().toISOString();
  qrRaw = null;
  qrDataUrl = null;
  lastError = null;
  console.log('WhatsApp conectado ✅');
});

client.on('auth_failure', msg => {
  status = 'falha_autenticacao';
  lastError = String(msg || 'Falha de autenticação');
  console.log('Falha:', msg);
});

client.on('disconnected', reason => {
  status = 'desconectado';
  lastError = String(reason || 'Desconectado');
  queueRunning = false;
  clearQueueTimer();
  console.log('Desconectado:', reason);
});

app.get('/', (req, res) => {
  res.json({
    ok: true,
    service: 'Achou Levou WhatsApp Bot',
    status,
    rotas: [
      '/painel',
      '/status',
      '/qr-page',
      '/qr',
      '/groups',
      '/settings',
      '/queue',
      'POST /settings',
      'POST /send-controlado',
      'POST /queue/add',
      'POST /queue/start',
      'POST /queue/stop',
      'POST /queue/clear',
      'POST /panic'
    ]
  });
});

app.get('/painel', (req, res) => {
  const conectado = status === 'conectado';

  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Painel Bot Achou Levou</title>
      <style>
        * { box-sizing: border-box; }
        body { margin: 0; font-family: Arial, sans-serif; background: #0d1117; color: #ffffff; padding: 20px; }
        .container { width: 100%; max-width: 900px; margin: 0 auto; }
        .card { background: #161b22; border: 1px solid #30363d; border-radius: 18px; padding: 18px; margin-bottom: 16px; box-shadow: 0 10px 30px rgba(0,0,0,.25); }
        h1 { margin: 0 0 6px; font-size: 1.7rem; }
        h2 { margin: 0 0 14px; font-size: 1.15rem; }
        .sub { color: #8b949e; margin-bottom: 18px; }
        .status { display: inline-block; padding: 8px 12px; border-radius: 999px; font-weight: 800; background: ${conectado ? '#15803d' : '#92400e'}; }
        .muted { color: #9ca3af; font-size: .95rem; line-height: 1.45; }
        label { display: block; font-weight: 800; margin-bottom: 8px; }
        input, select, textarea { width: 100%; border-radius: 14px; border: 1px solid #30363d; background: #0d1117; color: #ffffff; padding: 13px; font-size: 16px; outline: none; }
        textarea { min-height: 220px; resize: vertical; line-height: 1.45; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .field { margin-bottom: 14px; }
        button { width: 100%; margin-top: 12px; border: 0; border-radius: 14px; padding: 16px; font-weight: 900; font-size: 16px; color: #ffffff; cursor: pointer; }
        .send { background: linear-gradient(135deg, #16a34a, #10b981); }
        .save { background: linear-gradient(135deg, #2563eb, #6d39ff); }
        .clear { background: #374151; }
        .danger { background: linear-gradient(135deg, #991b1b, #ef4444); }
        .warn { background: linear-gradient(135deg, #d97706, #f97316); }
        .result { white-space: pre-wrap; background: #0d1117; border: 1px solid #30363d; border-radius: 14px; padding: 12px; margin-top: 12px; color: #c9d1d9; min-height: 48px; line-height: 1.4; max-height: 260px; overflow: auto; }
        a { color: #58a6ff; }
        .badge { display: inline-block; padding: 6px 10px; border-radius: 999px; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.12); margin-top: 8px; font-weight: 700; }
        .switch-row { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
        .switch-row input { width: auto; transform: scale(1.2); }
        .group-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 8px; max-height: 280px; overflow: auto; padding-right: 4px; }
        .group-option { display: flex; gap: 10px; align-items: center; padding: 11px 12px; border-radius: 14px; background: #0d1117; border: 1px solid #30363d; cursor: pointer; font-weight: 800; line-height: 1.25; }
        .group-option input { width: auto; transform: scale(1.2); }
        .group-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .group-actions button { margin-top: 0; padding: 12px; background: #374151; }
        #gruposResumo { margin-top: 8px; display: block; color: #9ca3af; font-weight: 700; line-height: 1.35; }
        @media (max-width: 700px) { .grid, .group-list, .group-actions { grid-template-columns: 1fr; } }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="card">
          <h1>🤖 Bot Achou Levou</h1>
          <div class="sub">Painel com fila automática controlada</div>
          <p>Status: <span class="status">${status}</span></p>
          ${conectado ? '<p class="muted">Bot conectado e pronto para envio controlado.</p>' : '<p class="muted">Se não estiver conectado, abra <a href="/qr-page">/qr-page</a> para escanear o QR Code.</p>'}
          <p class="muted">Rota local: <span class="badge">http://localhost:3010/painel</span></p>
        </div>

        <div class="card">
          <h2>⚙️ Configuração do Bot</h2>
          <div class="switch-row">
            <input type="checkbox" id="enabled">
            <label for="enabled" style="margin:0;">Ativar envio controlado</label>
          </div>

          <div class="field">
            <label>Grupos autorizados:</label>
            <div class="group-actions">
              <button type="button" onclick="marcarTodosGrupos()">✅ Selecionar todos</button>
              <button type="button" onclick="limparSelecaoGrupos()">🧹 Limpar seleção</button>
            </div>
            <div id="gruposLista" class="group-list">Carregando grupos...</div>
            <small id="gruposResumo">Nenhum grupo carregado.</small>
          </div>

          <div class="grid">
            <div class="field"><label for="windowStart">Enviar das:</label><input type="time" id="windowStart"></div>
            <div class="field"><label for="windowEnd">Até:</label><input type="time" id="windowEnd"></div>
          </div>

          <div class="grid">
            <div class="field"><label for="intervalMinutes">Intervalo entre envios em minutos:</label><input type="number" id="intervalMinutes" min="1" max="180"></div>
            <div class="field"><label for="dailyLimit">Limite diário de envios:</label><input type="number" id="dailyLimit" min="1" max="500"></div>
          </div>

          <button class="save" onclick="salvarConfiguracao()">💾 Salvar configuração</button>
          <button class="danger" onclick="pararTudo()">🛑 Parar tudo</button>
          <div id="configResultado" class="result">Carregando configurações...</div>
        </div>

        <div class="card">
          <h2>💬 Enviar mensagem única</h2>
          <label for="mensagem">Mensagem para enviar:</label>
          <textarea id="mensagem" placeholder="Cole aqui a mensagem gerada pelo Achou Levou...">🚀 Teste do bot Achou Levou funcionando com painel controlado!</textarea>
          <button class="send" onclick="enviarMensagem()">💬 Enviar para os grupos selecionados</button>
          <button class="clear" onclick="limparCampo('mensagem', 'resultado')">🧹 Limpar campo</button>
          <div id="resultado" class="result">Aguardando envio...</div>
        </div>

        <div class="card">
          <h2>🚦 Fila automática controlada</h2>
          <p class="muted">Cole uma mensagem por bloco. Separe cada oferta com uma linha contendo apenas três traços: <b>---</b></p>
          <textarea id="filaTexto" placeholder="Oferta 1...\n---\nOferta 2...\n---\nOferta 3..."></textarea>
          <button class="save" onclick="adicionarFila()">➕ Adicionar à fila</button>
          <button class="send" onclick="iniciarFila()">▶️ Iniciar fila</button>
          <button class="warn" onclick="pararFila()">⏸️ Pausar fila</button>
          <button class="danger" onclick="limparFila()">🗑️ Limpar fila</button>
          <div id="filaResultado" class="result">Fila aguardando...</div>
        </div>

        <div class="card">
          <p class="muted">
            Segurança desta etapa:
            <br>✅ Envia somente para os grupos escolhidos no painel
            <br>✅ Respeita horário permitido
            <br>✅ Respeita intervalo entre envios da fila
            <br>✅ Respeita limite diário
            <br>✅ Botão Parar tudo desativa o envio e pausa a fila
            <br>✅ A fila só começa quando você clicar em Iniciar fila
          </p>
        </div>
      </div>

      <script>
        let settingsAtual = null;
        let gruposDisponiveis = [];

        async function carregarTudo() {
          await carregarSettings();
          await carregarGrupos();
          await carregarFila();
          setInterval(carregarFila, 10000);
        }

        function gruposSelecionadosSettings() {
          const grupos = Array.isArray(settingsAtual?.selectedGroups) ? settingsAtual.selectedGroups : [];
          if (grupos.length) return grupos.map(g => String(g.id));
          return settingsAtual?.selectedGroupId ? [String(settingsAtual.selectedGroupId)] : [];
        }

        function gruposSelecionadosTela() {
          return Array.from(document.querySelectorAll('.grupo-check:checked')).map(input => ({
            id: input.value,
            name: input.dataset.name || input.value
          }));
        }

        function atualizarResumoGrupos() {
          const resumo = document.getElementById('gruposResumo');
          const selecionados = gruposSelecionadosTela();
          resumo.textContent = selecionados.length
            ? 'Selecionado(s): ' + selecionados.map(g => g.name).join(', ')
            : 'Nenhum grupo selecionado.';
        }

        function renderizarGrupos() {
          const box = document.getElementById('gruposLista');
          const selecionados = gruposSelecionadosSettings();

          if (!gruposDisponiveis.length) {
            box.textContent = 'Nenhum grupo encontrado.';
            atualizarResumoGrupos();
            return;
          }

          box.innerHTML = '';

          gruposDisponiveis.forEach(grupo => {
            const label = document.createElement('label');
            label.className = 'group-option';

            const input = document.createElement('input');
            input.type = 'checkbox';
            input.className = 'grupo-check';
            input.value = grupo.id;
            input.dataset.name = grupo.name;
            input.checked = selecionados.includes(grupo.id);
            input.addEventListener('change', atualizarResumoGrupos);

            const span = document.createElement('span');
            span.textContent = grupo.name;

            label.appendChild(input);
            label.appendChild(span);
            box.appendChild(label);
          });

          atualizarResumoGrupos();
        }

        function marcarTodosGrupos() {
          document.querySelectorAll('.grupo-check').forEach(input => input.checked = true);
          atualizarResumoGrupos();
        }

        function limparSelecaoGrupos() {
          document.querySelectorAll('.grupo-check').forEach(input => input.checked = false);
          atualizarResumoGrupos();
        }

        async function carregarSettings() {
          const box = document.getElementById('configResultado');
          try {
            const resposta = await fetch('/settings');
            const json = await resposta.json();
            if (!json.ok) { box.textContent = 'Erro ao carregar configurações.'; return; }

            settingsAtual = json.settings;
            document.getElementById('enabled').checked = Boolean(settingsAtual.enabled);
            document.getElementById('windowStart').value = settingsAtual.windowStart || '09:00';
            document.getElementById('windowEnd').value = settingsAtual.windowEnd || '21:00';
            document.getElementById('intervalMinutes').value = settingsAtual.intervalMinutes || 10;
            document.getElementById('dailyLimit').value = settingsAtual.dailyLimit || 12;

            const nomes = Array.isArray(settingsAtual.selectedGroups)
              ? settingsAtual.selectedGroups.map(g => g.name || g.id).join(', ')
              : (settingsAtual.selectedGroupName || 'não selecionado');

            box.textContent =
              'Config atual:\n' +
              'Grupos: ' + (nomes || 'não selecionado') + '\n' +
              'Ativo: ' + (settingsAtual.enabled ? 'sim' : 'não') + '\n' +
              'Horário: ' + settingsAtual.windowStart + ' até ' + settingsAtual.windowEnd + '\n' +
              'Intervalo: ' + settingsAtual.intervalMinutes + ' min\n' +
              'Limite diário: ' + settingsAtual.dailyLimit + '\n' +
              'Enviados hoje: ' + settingsAtual.sentToday;
          } catch (erro) {
            box.textContent = 'Erro ao carregar config: ' + erro.message;
          }
        }

        async function carregarGrupos() {
          try {
            const resposta = await fetch('/groups');
            const json = await resposta.json();
            if (!json.ok) throw new Error(json.error || 'Falha ao carregar grupos');
            gruposDisponiveis = json.groups || [];
          } catch (erro) {
            gruposDisponiveis = Array.isArray(settingsAtual?.selectedGroups) && settingsAtual.selectedGroups.length
              ? settingsAtual.selectedGroups
              : [{ id: settingsAtual?.selectedGroupId || '', name: settingsAtual?.selectedGroupName || 'Grupo teste' }].filter(g => g.id);
          }

          renderizarGrupos();
        }

        async function salvarConfiguracao() {
          const box = document.getElementById('configResultado');
          const selectedGroups = gruposSelecionadosTela();

          if (!selectedGroups.length) {
            box.textContent = 'Selecione pelo menos um grupo.';
            return;
          }

          const payload = {
            enabled: document.getElementById('enabled').checked,
            selectedGroups,
            windowStart: document.getElementById('windowStart').value || '09:00',
            windowEnd: document.getElementById('windowEnd').value || '21:00',
            intervalMinutes: Number(document.getElementById('intervalMinutes').value || 10),
            dailyLimit: Number(document.getElementById('dailyLimit').value || 12)
          };

          box.textContent = 'Salvando configuração...';

          try {
            const resposta = await fetch('/settings', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
            const json = await resposta.json();
            if (!json.ok) { box.textContent = 'Erro: ' + (json.error || 'falha ao salvar'); return; }
            settingsAtual = json.settings;
            box.textContent = '✅ Configuração salva com sucesso!';
            await carregarSettings();
            renderizarGrupos();
          } catch (erro) {
            box.textContent = 'Erro ao salvar: ' + erro.message;
          }
        }

        async function enviarMensagem() {
          const resultado = document.getElementById('resultado');
          const mensagem = document.getElementById('mensagem').value.trim();
          if (!mensagem) { resultado.textContent = 'Digite ou cole uma mensagem primeiro.'; return; }
          resultado.textContent = 'Enviando para os grupos selecionados...';

          try {
            const resposta = await fetch('/send-controlado', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message: mensagem })
            });
            const json = await resposta.json();
            if (!json.ok) { resultado.textContent = 'Envio bloqueado: ' + (json.error || 'falha ao enviar'); await carregarSettings(); return; }

            const nomes = Array.isArray(json.results)
              ? json.results.filter(r => r.ok).map(r => r.groupName).join(', ')
              : json.groupName;

            resultado.textContent =
              '✅ Mensagem enviada!\n' +
              'Grupos: ' + nomes + '\n' +
              'Enviados hoje: ' + json.sentToday + '/' + json.dailyLimit;
            await carregarSettings();
          } catch (erro) {
            resultado.textContent = 'Erro ao chamar o bot: ' + erro.message;
          }
        }

        async function adicionarFila() {
          const box = document.getElementById('filaResultado');
          const text = document.getElementById('filaTexto').value.trim();
          if (!text) { box.textContent = 'Cole pelo menos uma mensagem para adicionar à fila.'; return; }
          box.textContent = 'Adicionando à fila...';
          try {
            const resposta = await fetch('/queue/add', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
            const json = await resposta.json();
            box.textContent = json.ok ? '✅ Mensagens adicionadas: ' + json.added : 'Erro: ' + (json.error || 'falha ao adicionar');
            if (json.ok) document.getElementById('filaTexto').value = '';
            await carregarFila();
          } catch (erro) { box.textContent = 'Erro: ' + erro.message; }
        }

        async function iniciarFila() {
          const box = document.getElementById('filaResultado');
          box.textContent = 'Iniciando fila...';
          try {
            const resposta = await fetch('/queue/start', { method: 'POST' });
            const json = await resposta.json();
            box.textContent = json.ok ? '▶️ Fila iniciada.' : 'Erro: ' + json.error;
            await carregarFila();
          } catch (erro) { box.textContent = 'Erro: ' + erro.message; }
        }

        async function pararFila() {
          const box = document.getElementById('filaResultado');
          try {
            const resposta = await fetch('/queue/stop', { method: 'POST' });
            const json = await resposta.json();
            box.textContent = json.ok ? '⏸️ Fila pausada.' : 'Erro ao pausar fila.';
            await carregarFila();
          } catch (erro) { box.textContent = 'Erro: ' + erro.message; }
        }

        async function limparFila() {
          const box = document.getElementById('filaResultado');
          if (!confirm('Deseja apagar toda a fila?')) return;
          try {
            const resposta = await fetch('/queue/clear', { method: 'POST' });
            const json = await resposta.json();
            box.textContent = json.ok ? '🗑️ Fila limpa.' : 'Erro ao limpar fila.';
            await carregarFila();
          } catch (erro) { box.textContent = 'Erro: ' + erro.message; }
        }

        async function carregarFila() {
          const box = document.getElementById('filaResultado');
          try {
            const resposta = await fetch('/queue');
            const json = await resposta.json();
            if (!json.ok) { box.textContent = 'Erro ao carregar fila.'; return; }
            const q = json.queue;
            const linhas = [];
            linhas.push('Rodando: ' + (q.running ? 'sim' : 'não'));
            linhas.push('Total: ' + q.total);
            linhas.push('Pendentes: ' + q.pending);
            linhas.push('Enviadas: ' + q.sent);
            linhas.push('Erro: ' + q.error);
            linhas.push('');
            q.items.slice(0, 10).forEach((item, index) => {
              const totalGrupos = Array.isArray(item.targets) ? item.targets.length : 0;
              const enviados = Array.isArray(item.sentTargets) ? item.sentTargets.length : 0;
              linhas.push((index + 1) + '. [' + item.status + '] ' + item.message.slice(0, 80));
              if (totalGrupos) linhas.push('   Grupos: ' + enviados + '/' + totalGrupos);
              if (item.error) linhas.push('   Erro: ' + item.error);
            });
            box.textContent = linhas.join('\n');
          } catch (erro) { box.textContent = 'Erro ao carregar fila: ' + erro.message; }
        }

        async function pararTudo() {
          const box = document.getElementById('configResultado');
          if (!confirm('Deseja desativar o envio controlado e pausar a fila agora?')) return;
          try {
            const resposta = await fetch('/panic', { method: 'POST' });
            const json = await resposta.json();
            box.textContent = json.ok ? '🛑 Bot desativado e fila pausada.' : 'Erro ao parar bot.';
            await carregarSettings();
            await carregarFila();
          } catch (erro) { box.textContent = 'Erro ao parar: ' + erro.message; }
        }

        function limparCampo(campoId, saidaId) {
          document.getElementById(campoId).value = '';
          document.getElementById(saidaId).textContent = 'Campo limpo.';
        }

        carregarTudo();
      </script>
    </body>
    </html>
  `);
});

app.get('/settings', (req, res) => {
  res.json({ ok: true, settings: getSettings() });
});

app.post('/settings', (req, res) => {
  const allowed = [
    'enabled',
    'selectedGroupId',
    'selectedGroupName',
    'selectedGroups',
    'groups',
    'windowStart',
    'windowEnd',
    'intervalMinutes',
    'dailyLimit'
  ];
  const partial = {};
  for (const key of allowed) {
    if (key in req.body) partial[key] = req.body[key];
  }
  res.json({ ok: true, settings: saveSettings(partial) });
});

app.get('/queue', (req, res) => {
  res.json({ ok: true, queue: getQueueSummary() });
});

app.post('/queue/add', (req, res) => {
  const text = String(req.body?.text || '').trim();

  if (!text) return res.status(400).json({ ok: false, error: 'Texto vazio.' });

  const messages = text.split(/\n---\n/g).map(msg => msg.trim()).filter(Boolean);
  if (!messages.length) return res.status(400).json({ ok: false, error: 'Nenhuma mensagem válida encontrada.' });

  const queue = getQueue();
  const targets = normalizeGroups(req.body?.selectedGroups || req.body?.groups || getSettings().selectedGroups, []);
  const newItems = messages.map(message => ({ ...createQueueItem(message), targets, sentTargets: [] }));
  saveQueue([...queue, ...newItems]);

  res.json({ ok: true, added: newItems.length, queue: getQueueSummary() });
});

app.post('/queue/start', (req, res) => {
  const settings = getSettings();
  if (!settings.enabled) return res.status(400).json({ ok: false, error: 'Ative o envio controlado antes de iniciar a fila.' });
  if (status !== 'conectado') return res.status(400).json({ ok: false, error: 'WhatsApp ainda não conectado.' });
  if (!normalizeGroups(settings.selectedGroups, []).length) return res.status(400).json({ ok: false, error: 'Selecione pelo menos um grupo.' });

  const summary = getQueueSummary();
  if (!summary.pending) return res.status(400).json({ ok: false, error: 'Não há mensagens pendentes na fila.' });

  queueRunning = true;
  scheduleNextQueueRun(1000);
  res.json({ ok: true, message: 'Fila iniciada.', queue: getQueueSummary() });
});

app.post('/queue/stop', (req, res) => {
  queueRunning = false;
  clearQueueTimer();
  res.json({ ok: true, message: 'Fila pausada.', queue: getQueueSummary() });
});

app.post('/queue/clear', (req, res) => {
  queueRunning = false;
  clearQueueTimer();
  saveQueue([]);
  res.json({ ok: true, message: 'Fila limpa.', queue: getQueueSummary() });
});

app.get('/status', (req, res) => {
  res.json({ ok: true, status, readyAt, hasQr: Boolean(qrDataUrl), lastError, queueRunning, queueProcessing });
});

app.get('/qr', (req, res) => {
  res.json({ ok: true, status, qr: qrRaw, qrDataUrl });
});

app.get('/qr-page', (req, res) => {
  if (!qrDataUrl) {
    return res.send(`
      <html>
        <body style="font-family: Arial; text-align:center; padding:40px; background:#0d1117; color:white;">
          <h2>Status: ${status}</h2>
          <p>Se ainda não apareceu QR, aguarde alguns segundos e atualize.</p>
          <a style="color:#58a6ff" href="/qr-page">Atualizar</a>
        </body>
      </html>
    `);
  }

  res.send(`
    <html>
      <body style="font-family: Arial; text-align:center; padding:30px; background:#0d1117; color:white;">
        <h2>Escaneie o QR Code</h2>
        <p>WhatsApp → Aparelhos conectados → Conectar aparelho</p>
        <img src="${qrDataUrl}" style="width:300px; max-width:90%; background:white; padding:12px; border-radius:12px;" />
        <p><a style="color:#58a6ff" href="/status">Ver status</a></p>
      </body>
    </html>
  `);
});

app.get('/groups', async (req, res) => {
  try {
    if (status !== 'conectado') {
      return res.status(400).json({ ok: false, error: 'WhatsApp ainda não conectado.', status });
    }

    const chats = await client.getChats();
    const groups = chats
      .filter(chat => chat.isGroup)
      .map(chat => ({ id: chat.id._serialized, name: chat.name || 'Grupo sem nome' }))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({ ok: true, total: groups.length, groups });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/send-controlado', async (req, res) => {
  try {
    const message = req.body?.message;
    if (!message || !String(message).trim()) return res.status(400).json({ ok: false, error: 'Mensagem vazia.' });

    const result = await sendMessageToConfiguredGroups(message);
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/send-test', async (req, res) => {
  try {
    if (status !== 'conectado') {
      return res.status(400).json({ ok: false, error: 'WhatsApp ainda não conectado.', status });
    }

    const message = req.body?.message || '🚀 Teste do bot Achou Levou funcionando!';
    await client.sendMessage(GRUPO_TESTE_ID, message);

    res.json({ ok: true, groupId: GRUPO_TESTE_ID, groupName: GRUPO_TESTE_NOME, message: 'Mensagem enviada para o Grupo teste ✅' });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/panic', (req, res) => {
  queueRunning = false;
  clearQueueTimer();
  const settings = saveSettings({ enabled: false });
  res.json({ ok: true, message: 'Bot desativado e fila pausada.', settings, queue: getQueueSummary() });
});

client.initialize();

app.listen(PORT, () => {
  console.log(`Bot rodando em http://localhost:${PORT}`);
});
