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

fs.mkdirSync(DATA_DIR, { recursive: true });

const GRUPO_TESTE_ID = '120363426800905804@g.us';
const GRUPO_TESTE_NOME = 'Grupo teste';

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let status = 'iniciando';
let qrDataUrl = null;
let qrRaw = null;
let readyAt = null;
let lastError = null;

function hojeKey() {
  return new Date().toISOString().slice(0, 10);
}

const defaultSettings = {
  enabled: false,
  selectedGroupId: GRUPO_TESTE_ID,
  selectedGroupName: GRUPO_TESTE_NOME,
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

function getSettings() {
  const saved = readJson(SETTINGS_FILE, {});
  const settings = {
    ...defaultSettings,
    ...saved
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

  const next = {
    ...current,
    ...partial,
    intervalMinutes: Number(partial.intervalMinutes ?? current.intervalMinutes),
    dailyLimit: Number(partial.dailyLimit ?? current.dailyLimit),
    enabled: Boolean(partial.enabled ?? current.enabled)
  };

  writeJson(SETTINGS_FILE, next);
  return next;
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

  if (start <= end) {
    return now >= start && now <= end;
  }

  return now >= start || now <= end;
}

function podeEnviarAgora(settings) {
  if (!settings.enabled) {
    return 'Bot desativado. Ative no painel antes de enviar.';
  }

  if (status !== 'conectado') {
    return 'WhatsApp ainda não conectado.';
  }

  if (!settings.selectedGroupId) {
    return 'Nenhum grupo selecionado.';
  }

  if (!dentroDoHorario(settings)) {
    return `Fora do horário permitido: ${settings.windowStart} até ${settings.windowEnd}.`;
  }

  if (settings.sentToday >= settings.dailyLimit) {
    return `Limite diário atingido: ${settings.dailyLimit} envio(s).`;
  }

  const intervaloMs = Math.max(1, Number(settings.intervalMinutes || 10)) * 60 * 1000;
  const passouIntervalo = Date.now() - Number(settings.lastSendAt || 0);

  if (settings.lastSendAt && passouIntervalo < intervaloMs) {
    const restanteMs = intervaloMs - passouIntervalo;
    const restanteMin = Math.ceil(restanteMs / 60000);
    return `Aguarde mais ${restanteMin} minuto(s) para respeitar o intervalo configurado.`;
  }

  return null;
}

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: 'achou-levou-julio'
  }),
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
  console.log('Desconectado:', reason);
});

function renderPainel() {
  const conectado = status === 'conectado';

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Painel Bot Achou Levou</title>

  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      font-family: Arial, sans-serif;
      background: #0d1117;
      color: #ffffff;
      padding: 20px;
    }

    .container {
      width: 100%;
      max-width: 860px;
      margin: 0 auto;
    }

    .card {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 18px;
      padding: 18px;
      margin-bottom: 16px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
    }

    h1 {
      margin: 0 0 6px;
      font-size: 1.7rem;
    }

    h2 {
      margin: 0 0 14px;
      font-size: 1.15rem;
    }

    .sub {
      color: #8b949e;
      margin-bottom: 18px;
    }

    .status {
      display: inline-block;
      padding: 8px 12px;
      border-radius: 999px;
      font-weight: 800;
      background: ${conectado ? '#15803d' : '#92400e'};
    }

    .muted {
      color: #9ca3af;
      font-size: 0.95rem;
      line-height: 1.45;
    }

    label {
      display: block;
      font-weight: 800;
      margin-bottom: 8px;
    }

    input,
    select,
    textarea {
      width: 100%;
      border-radius: 14px;
      border: 1px solid #30363d;
      background: #0d1117;
      color: #ffffff;
      padding: 13px;
      font-size: 16px;
      outline: none;
    }

    textarea {
      min-height: 230px;
      resize: vertical;
      line-height: 1.45;
    }

    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .field {
      margin-bottom: 14px;
    }

    button {
      width: 100%;
      margin-top: 12px;
      border: 0;
      border-radius: 14px;
      padding: 16px;
      font-weight: 900;
      font-size: 16px;
      color: #ffffff;
      cursor: pointer;
    }

    .send {
      background: linear-gradient(135deg, #16a34a, #10b981);
    }

    .save {
      background: linear-gradient(135deg, #2563eb, #6d39ff);
    }

    .clear {
      background: #374151;
    }

    .danger {
      background: linear-gradient(135deg, #991b1b, #ef4444);
    }

    .result {
      white-space: pre-wrap;
      background: #0d1117;
      border: 1px solid #30363d;
      border-radius: 14px;
      padding: 12px;
      margin-top: 12px;
      color: #c9d1d9;
      min-height: 48px;
      line-height: 1.4;
    }

    a {
      color: #58a6ff;
    }

    .badge {
      display: inline-block;
      padding: 6px 10px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.12);
      margin-top: 8px;
      font-weight: 700;
    }

    .switch-row {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 14px;
    }

    .switch-row input {
      width: auto;
      transform: scale(1.2);
    }

    @media (max-width: 700px) {
      .grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>

<body>
  <div class="container">
    <div class="card">
      <h1>🤖 Bot Achou Levou</h1>
      <div class="sub">Painel com freio, limite e horário</div>

      <p>Status: <span class="status">${status}</span></p>

      ${
        conectado
          ? '<p class="muted">Bot conectado e pronto para envio controlado.</p>'
          : '<p class="muted">Se não estiver conectado, abra <a href="/qr-page">/qr-page</a> para escanear o QR Code.</p>'
      }

      <p class="muted">
        Rota local:
        <span class="badge">http://localhost:3010/painel</span>
      </p>
    </div>

    <div class="card">
      <h2>⚙️ Configuração do Bot</h2>

      <div class="switch-row">
        <input type="checkbox" id="enabled">
        <label for="enabled" style="margin:0;">Ativar envio controlado</label>
      </div>

      <div class="field">
        <label for="grupo">Grupo autorizado:</label>
        <select id="grupo">
          <option value="">Carregando grupos...</option>
        </select>
      </div>

      <div class="grid">
        <div class="field">
          <label for="windowStart">Enviar das:</label>
          <input type="time" id="windowStart">
        </div>

        <div class="field">
          <label for="windowEnd">Até:</label>
          <input type="time" id="windowEnd">
        </div>
      </div>

      <div class="grid">
        <div class="field">
          <label for="intervalMinutes">Intervalo entre envios em minutos:</label>
          <input type="number" id="intervalMinutes" min="1" max="180">
        </div>

        <div class="field">
          <label for="dailyLimit">Limite diário de envios:</label>
          <input type="number" id="dailyLimit" min="1" max="50">
        </div>
      </div>

      <button class="save" onclick="salvarConfiguracao()">💾 Salvar configuração</button>
      <button class="danger" onclick="pararTudo()">🛑 Parar tudo</button>

      <div id="configResultado" class="result">Carregando configurações...</div>
    </div>

    <div class="card">
      <h2>💬 Enviar mensagem controlada</h2>

      <label for="mensagem">Mensagem para enviar:</label>

      <textarea id="mensagem" placeholder="Cole aqui a mensagem gerada pelo Achou Levou...">🚀 Teste do bot Achou Levou funcionando com painel controlado!</textarea>

      <button class="send" onclick="enviarMensagem()">💬 Enviar respeitando regras</button>
      <button class="clear" onclick="limparCampo()">🧹 Limpar campo</button>

      <div id="resultado" class="result">Aguardando envio...</div>
    </div>

    <div class="card">
      <p class="muted">
        Segurança desta etapa:
        <br>✅ Envia somente para o grupo escolhido no painel
        <br>✅ Respeita horário permitido
        <br>✅ Respeita intervalo entre mensagens
        <br>✅ Respeita limite diário
        <br>✅ Botão Parar tudo desativa o envio
        <br>❌ Sem fila automática ainda
        <br>❌ Sem envio em massa
      </p>
    </div>
  </div>

  <script>
    let settingsAtual = null;

    async function carregarTudo() {
      await carregarSettings();
      await carregarGrupos();
    }

    async function carregarSettings() {
      const box = document.getElementById('configResultado');

      try {
        const resposta = await fetch('/settings');
        const json = await resposta.json();

        if (!json.ok) {
          box.textContent = 'Erro ao carregar configurações.';
          return;
        }

        settingsAtual = json.settings;

        document.getElementById('enabled').checked = Boolean(settingsAtual.enabled);
        document.getElementById('windowStart').value = settingsAtual.windowStart || '09:00';
        document.getElementById('windowEnd').value = settingsAtual.windowEnd || '21:00';
        document.getElementById('intervalMinutes').value = settingsAtual.intervalMinutes || 10;
        document.getElementById('dailyLimit').value = settingsAtual.dailyLimit || 12;

        box.textContent =
          'Config atual:\\n' +
          'Grupo: ' + (settingsAtual.selectedGroupName || 'não selecionado') + '\\n' +
          'Ativo: ' + (settingsAtual.enabled ? 'sim' : 'não') + '\\n' +
          'Horário: ' + settingsAtual.windowStart + ' até ' + settingsAtual.windowEnd + '\\n' +
          'Intervalo: ' + settingsAtual.intervalMinutes + ' min\\n' +
          'Limite diário: ' + settingsAtual.dailyLimit + '\\n' +
          'Enviados hoje: ' + settingsAtual.sentToday;
      } catch (erro) {
        box.textContent = 'Erro ao carregar config: ' + erro.message;
      }
    }

    async function carregarGrupos() {
      const select = document.getElementById('grupo');
      select.innerHTML = '';

      try {
        const resposta = await fetch('/groups');
        const json = await resposta.json();

        if (!json.ok) {
          const opt = document.createElement('option');
          opt.value = settingsAtual?.selectedGroupId || '';
          opt.textContent = settingsAtual?.selectedGroupName || 'Grupo teste';
          select.appendChild(opt);
          return;
        }

        const grupos = json.groups || [];

        for (const grupo of grupos) {
          const opt = document.createElement('option');
          opt.value = grupo.id;
          opt.textContent = grupo.name;

          if (settingsAtual && settingsAtual.selectedGroupId === grupo.id) {
            opt.selected = true;
          }

          select.appendChild(opt);
        }
      } catch (erro) {
        const opt = document.createElement('option');
        opt.value = settingsAtual?.selectedGroupId || '';
        opt.textContent = settingsAtual?.selectedGroupName || 'Grupo teste';
        select.appendChild(opt);
      }
    }

    async function salvarConfiguracao() {
      const box = document.getElementById('configResultado');
      const select = document.getElementById('grupo');
      const selectedOption = select.options[select.selectedIndex];

      const payload = {
        enabled: document.getElementById('enabled').checked,
        selectedGroupId: select.value,
        selectedGroupName: selectedOption ? selectedOption.textContent : '',
        windowStart: document.getElementById('windowStart').value || '09:00',
        windowEnd: document.getElementById('windowEnd').value || '21:00',
        intervalMinutes: Number(document.getElementById('intervalMinutes').value || 10),
        dailyLimit: Number(document.getElementById('dailyLimit').value || 12)
      };

      box.textContent = 'Salvando configuração...';

      try {
        const resposta = await fetch('/settings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        const json = await resposta.json();

        if (!json.ok) {
          box.textContent = 'Erro: ' + (json.error || 'falha ao salvar');
          return;
        }

        settingsAtual = json.settings;
        box.textContent = '✅ Configuração salva com sucesso!';
        await carregarSettings();
      } catch (erro) {
        box.textContent = 'Erro ao salvar: ' + erro.message;
      }
    }

    async function enviarMensagem() {
      const resultado = document.getElementById('resultado');
      const mensagem = document.getElementById('mensagem').value.trim();

      if (!mensagem) {
        resultado.textContent = 'Digite ou cole uma mensagem primeiro.';
        return;
      }

      resultado.textContent = 'Enviando com regras de segurança...';

      try {
        const resposta = await fetch('/send-controlado', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: mensagem
          })
        });

        const json = await resposta.json();

        if (!json.ok) {
          resultado.textContent = 'Envio bloqueado: ' + (json.error || 'falha ao enviar');
          await carregarSettings();
          return;
        }

        resultado.textContent =
          '✅ Mensagem enviada com sucesso!\\n' +
          'Grupo: ' + json.groupName + '\\n' +
          'Enviados hoje: ' + json.sentToday + '/' + json.dailyLimit;

        await carregarSettings();
      } catch (erro) {
        resultado.textContent = 'Erro ao chamar o bot: ' + erro.message;
      }
    }

    async function pararTudo() {
      const box = document.getElementById('configResultado');

      if (!confirm('Deseja desativar o envio controlado agora?')) {
        return;
      }

      try {
        const resposta = await fetch('/panic', {
          method: 'POST'
        });

        const json = await resposta.json();

        box.textContent = json.ok
          ? '🛑 Bot desativado com sucesso.'
          : 'Erro ao parar bot.';

        await carregarSettings();
      } catch (erro) {
        box.textContent = 'Erro ao parar: ' + erro.message;
      }
    }

    function limparCampo() {
      document.getElementById('mensagem').value = '';
      document.getElementById('resultado').textContent = 'Campo limpo.';
    }

    carregarTudo();
  </script>
</body>
</html>
  `;
}

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
      'POST /settings',
      'POST /send-controlado',
      'POST /panic'
    ]
  });
});

app.get('/painel', (req, res) => {
  res.send(renderPainel());
});

app.get('/settings', (req, res) => {
  res.json({
    ok: true,
    settings: getSettings()
  });
});

app.post('/settings', (req, res) => {
  const allowed = [
    'enabled',
    'selectedGroupId',
    'selectedGroupName',
    'windowStart',
    'windowEnd',
    'intervalMinutes',
    'dailyLimit'
  ];

  const partial = {};

  for (const key of allowed) {
    if (key in req.body) {
      partial[key] = req.body[key];
    }
  }

  const settings = saveSettings(partial);

  res.json({
    ok: true,
    settings
  });
});

app.get('/status', (req, res) => {
  res.json({
    ok: true,
    status,
    readyAt,
    hasQr: Boolean(qrDataUrl),
    lastError
  });
});

app.get('/qr', (req, res) => {
  res.json({
    ok: true,
    status,
    qr: qrRaw,
    qrDataUrl
  });
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
      return res.status(400).json({
        ok: false,
        error: 'WhatsApp ainda não conectado.',
        status
      });
    }

    const chats = await client.getChats();

    const groups = chats
      .filter(chat => chat.isGroup)
      .map(chat => ({
        id: chat.id._serialized,
        name: chat.name || 'Grupo sem nome'
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({
      ok: true,
      total: groups.length,
      groups
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.post('/send-controlado', async (req, res) => {
  try {
    const settings = getSettings();
    const message = req.body?.message;

    if (!message || !String(message).trim()) {
      return res.status(400).json({
        ok: false,
        error: 'Mensagem vazia.'
      });
    }

    const bloqueio = podeEnviarAgora(settings);

    if (bloqueio) {
      return res.status(400).json({
        ok: false,
        error: bloqueio,
        settings
      });
    }

    const chat = await client.getChatById(settings.selectedGroupId);

    if (!chat || !chat.isGroup) {
      return res.status(400).json({
        ok: false,
        error: 'Grupo configurado não é válido.'
      });
    }

    await chat.sendMessage(String(message).trim());

    const updated = saveSettings({
      sentToday: settings.sentToday + 1,
      sentDate: hojeKey(),
      lastSendAt: Date.now()
    });

    res.json({
      ok: true,
      groupId: settings.selectedGroupId,
      groupName: settings.selectedGroupName || chat.name,
      sentToday: updated.sentToday,
      dailyLimit: updated.dailyLimit,
      sentAt: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.post('/send-test', async (req, res) => {
  try {
    if (status !== 'conectado') {
      return res.status(400).json({
        ok: false,
        error: 'WhatsApp ainda não conectado.',
        status
      });
    }

    const message = req.body?.message || '🚀 Teste do bot Achou Levou funcionando!';

    await client.sendMessage(GRUPO_TESTE_ID, message);

    res.json({
      ok: true,
      groupId: GRUPO_TESTE_ID,
      groupName: GRUPO_TESTE_NOME,
      message: 'Mensagem enviada para o Grupo teste ✅'
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.post('/panic', (req, res) => {
  const settings = saveSettings({
    enabled: false
  });

  res.json({
    ok: true,
    message: 'Bot desativado.',
    settings
  });
});

client.initialize();

app.listen(PORT, () => {
  console.log(`Bot rodando em http://localhost:${PORT}`);
});