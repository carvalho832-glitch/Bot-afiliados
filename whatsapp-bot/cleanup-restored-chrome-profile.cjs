const fs = require('node:fs');
const path = require('node:path');

const authDir = path.join(__dirname, '.wwebjs_auth');
const removable = new Set([
  'SingletonLock',
  'SingletonSocket',
  'SingletonCookie',
  'DevToolsActivePort'
]);

let removed = 0;

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (removable.has(entry.name)) {
      try {
        fs.rmSync(full, { recursive: true, force: true });
        removed += 1;
      } catch (error) {
        console.warn('[RENDER] Não foi possível remover trava do Chromium:', full, error?.message || error);
      }
      continue;
    }
    if (entry.isDirectory()) walk(full);
  }
}

walk(authDir);
console.log(`[RENDER] Limpeza de perfil concluída. Travas removidas: ${removed}.`);
