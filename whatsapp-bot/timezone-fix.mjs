import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverFile = path.join(__dirname, 'server.js');
const marker = 'ACHOU_LEVOU_FUSO_SAO_PAULO_V1';

if (!fs.existsSync(serverFile)) {
  throw new Error(`Arquivo não encontrado: ${serverFile}`);
}

let source = fs.readFileSync(serverFile, 'utf8');
let changed = false;

if (!source.includes(marker)) {
  const hojePattern = /function hojeKey\(\) \{[\s\S]*?\n\}/;
  const hojeReplacement = `function hojeKey() {
  // ${marker}: o servidor pode estar em UTC, mas o bot opera no horário de São Paulo.
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());

  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return \`${'${values.year}'}-${'${values.month}'}-${'${values.day}'}\`;
}`;

  const minutesPattern = /function minutesNow\(\) \{[\s\S]*?\n\}/;
  const minutesReplacement = `function minutesNow() {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date());

  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return Number(values.hour || 0) * 60 + Number(values.minute || 0);
}`;

  if (!hojePattern.test(source)) {
    throw new Error('Não foi possível localizar hojeKey() em server.js.');
  }

  if (!minutesPattern.test(source)) {
    throw new Error('Não foi possível localizar minutesNow() em server.js.');
  }

  source = source.replace(hojePattern, hojeReplacement);
  source = source.replace(minutesPattern, minutesReplacement);
  changed = true;
}

if (changed) {
  fs.writeFileSync(serverFile, source, 'utf8');
  console.log('✅ Fuso horário do bot fixado em America/Sao_Paulo.');
} else {
  console.log('✅ Correção de fuso horário já está aplicada.');
}
