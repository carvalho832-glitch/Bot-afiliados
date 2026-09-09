const fs = require('node:fs');
const path = require('node:path');

const file = path.join(__dirname, 'bot-engine.mjs');
let source = fs.readFileSync(file, 'utf8');

const original = "args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']";
const replacement = `args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-zygote',
      '--renderer-process-limit=1',
      '--disable-site-isolation-trials',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-sync',
      '--metrics-recording-only',
      '--mute-audio',
      '--no-first-run',
      '--disable-software-rasterizer',
      '--disable-features=Translate,BackForwardCache,MediaRouter,OptimizationHints,AutofillServerCommunication',
      '--js-flags=--max-old-space-size=128'
    ]`;

if (source.includes(replacement)) {
  console.log('[RENDER] Modo de baixa memória do Chromium já aplicado.');
  process.exit(0);
}

if (!source.includes(original)) {
  throw new Error('Não encontrei os argumentos Puppeteer esperados em bot-engine.mjs. Patch interrompido por segurança.');
}

source = source.replace(original, replacement);
fs.writeFileSync(file, source, 'utf8');
console.log('[RENDER] Modo de baixa memória do Chromium aplicado.');
