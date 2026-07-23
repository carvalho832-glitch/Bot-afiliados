import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverFile = path.join(__dirname, 'server.js');
const marker = 'ACHOU_LEVOU_ENVIO_DIRETO_V1';

let source = fs.readFileSync(serverFile, 'utf8');

if (source.includes(marker)) {
  console.log('Envio direto já aplicado.');
  process.exit(0);
}

const oldQueue = `  const chat = await client.getChatById(target.id);
  if (!chat || !chat.isGroup) return { ok: false, error: \`Grupo inválido: \${target.name || target.id}\`, settings };

  await chat.sendMessage(String(message).trim());`;

const newQueue = `  // ${marker}
  await client.sendMessage(target.id, String(message).trim());`;

if (!source.includes(oldQueue)) {
  throw new Error('Bloco de envio da fila não localizado.');
}

source = source.replace(oldQueue, newQueue);
source = source.replace('groupName: target.name || chat.name,', 'groupName: target.name || target.id,');

const oldManual = `    const chat = await client.getChatById(group.id);
    if (!chat || !chat.isGroup) {
      results.push({ ok: false, groupId: group.id, groupName: group.name, category: group.category, error: 'Grupo inválido.' });
      continue;
    }

    await chat.sendMessage(String(message).trim());`;

const newManual = `    await client.sendMessage(group.id, String(message).trim());`;

if (source.includes(oldManual)) {
  source = source.replace(oldManual, newManual);
  source = source.replace('groupName: group.name || chat.name,', 'groupName: group.name || group.id,');
}

source = source.replace("console.log('Erro na fila:', error.message);", "console.error('Erro completo na fila:', error?.stack || error);");

fs.writeFileSync(serverFile, source, 'utf8');
console.log('Fila corrigida para envio direto.');
