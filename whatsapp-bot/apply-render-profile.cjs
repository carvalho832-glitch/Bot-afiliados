const fs = require('node:fs');
const path = require('node:path');

const file = path.join(__dirname, 'bot-engine.mjs');
const source = fs.readFileSync(file, 'utf8');

const profile = String(process.env.BOT_PROFILE || 'julio')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9_-]/g, '') || 'julio';
const clientId = String(process.env.WHATSAPP_CLIENT_ID || `achou-levou-${profile}`)
  .trim()
  .replace(/[^a-zA-Z0-9_-]/g, '');

if (!clientId) {
  throw new Error('WHATSAPP_CLIENT_ID inválido.');
}

const original = "authStrategy: new LocalAuth({ clientId: 'achou-levou-julio' }),";
const replacement = `authStrategy: new LocalAuth({ clientId: ${JSON.stringify(clientId)} }),`;

if (source.includes(replacement)) {
  console.log(`[RENDER] Perfil ${profile} já aplicado (${clientId}).`);
  process.exit(0);
}

if (!source.includes(original)) {
  throw new Error('Não encontrei o trecho esperado do LocalAuth em bot-engine.mjs. O patch foi interrompido por segurança.');
}

fs.writeFileSync(file, source.replace(original, replacement), 'utf8');
console.log(`[RENDER] Perfil aplicado: ${profile} / clientId=${clientId}`);
