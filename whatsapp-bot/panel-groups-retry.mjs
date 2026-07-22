import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverFile = path.join(__dirname, 'server.js');
const marker = 'ACHOU_LEVOU_GRUPOS_RETRY_V1';

if (!fs.existsSync(serverFile)) {
  throw new Error(`Arquivo não encontrado: ${serverFile}`);
}

let source = fs.readFileSync(serverFile, 'utf8');
let changed = false;

if (!source.includes(marker)) {
  const loadAllPattern = /async function carregarTudo\(\) \{[\s\S]*?setInterval\(carregarFila, 10000\);\n\}/;
  const loadAllReplacement = `async function carregarTudo() {
  // ${marker}: tenta carregar os grupos novamente enquanto o WhatsApp termina de iniciar.
  await carregarSettings();
  await carregarGrupos();
  await carregarFila();
  setInterval(carregarFila, 10000);
  setInterval(carregarGrupos, 15000);
}`;

  if (!loadAllPattern.test(source)) {
    throw new Error('Não foi possível localizar carregarTudo() no painel.');
  }

  source = source.replace(loadAllPattern, loadAllReplacement);
  changed = true;
}

const oldFetch = "const resposta = await fetch('/groups');";
const newFetch = "const resposta = await fetch('/groups?ts=' + Date.now(), { cache: 'no-store' });";

if (source.includes(oldFetch)) {
  source = source.replace(oldFetch, newFetch);
  changed = true;
}

if (changed) {
  fs.writeFileSync(serverFile, source, 'utf8');
  console.log('✅ Painel configurado para recarregar os grupos automaticamente.');
} else {
  console.log('✅ Recarga automática dos grupos já está aplicada.');
}
