#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'bot-engine.mjs');
let source = fs.readFileSync(file, 'utf8');
const original = source;

function replaceOnce(search, replacement, label) {
  const count = source.split(search).length - 1;
  if (count !== 1) {
    throw new Error(`[PATCH] ${label}: esperado 1 trecho, encontrado ${count}. Nenhuma alteração gravada.`);
  }
  source = source.replace(search, replacement);
}

replaceOnce(
  "if (!force && liveGroupsCache.groups.length && Date.now() - liveGroupsCache.at < GROUP_CACHE_TTL_MS) {",
  "if (!force && liveGroupsCache.groups.length) {",
  'cache permanente nas operações normais'
);

replaceOnce(
`async function sendDirect(message, target) {
  let lastFailure = null;
  for (let attempt = 0; attempt <= TRANSIENT_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      await client.sendMessage(target.id, String(message).trim());
      return { ok: true, groupId: target.id, groupName: target.name || target.id };
    } catch (error) {
      lastFailure = error;
      if (!isTransientWhatsAppError(error) || attempt >= TRANSIENT_RETRY_DELAYS_MS.length) break;
      const delay = TRANSIENT_RETRY_DELAYS_MS[attempt];
      console.warn(\`[ENVIO] Contexto temporariamente indisponível para \${target.name || target.id}. Tentativa \${attempt + 1}/\${TRANSIENT_RETRY_DELAYS_MS.length + 1} em \${delay} ms.\`);
      await sleep(delay);
    }
  }
  throw lastFailure || new Error('Falha desconhecida ao enviar mensagem.');
}`,
`async function sendDirect(message, target) {
  try {
    await client.sendMessage(target.id, String(message).trim());
    return { ok: true, groupId: target.id, groupName: target.name || target.id };
  } catch (error) {
    if (isTransientWhatsAppError(error)) {
      status = 'reconectando';
      lastError = errorDetails(error).message;
      clearQueueTimer();
      setQueueRunning(false);
      console.error(\`[ENVIO] Contexto do WhatsApp perdido durante envio para \${target.name || target.id}. Reinício seguro solicitado, sem repetir a mensagem.\`, errorText(error));
      setTimeout(() => process.exit(1), 750).unref();
      throw new Error('A conexão do WhatsApp foi reiniciada com segurança. A mensagem não será repetida automaticamente.');
    }
    throw error;
  }
}`,
  'envio sem repetição automática'
);

replaceOnce(
`  return {
    ok: results.some(result => result.ok),
    partial: results.some(result => !result.ok),
    results,
    sentToday: updated.sentToday,
    dailyLimit: updated.dailyLimit,
    groupName: results.filter(result => result.ok).map(result => result.groupName).join(', ')
  };`,
`  const failures = results.filter(result => !result.ok);
  return {
    ok: results.some(result => result.ok),
    partial: failures.length > 0,
    error: results.some(result => result.ok)
      ? null
      : failures.map(result => \`\${result.groupName}: \${result.error || 'falha desconhecida'}\`).join(' | ') || 'Nenhum grupo disponível para envio.',
    results,
    sentToday: updated.sentToday,
    dailyLimit: updated.dailyLimit,
    groupName: results.filter(result => result.ok).map(result => result.groupName).join(', ')
  };`,
  'erro detalhado no envio manual'
);

source = source.replace("version: '2.1.0'", "version: '2.2.0'");

if (source === original) throw new Error('[PATCH] Nenhuma alteração necessária.');
const backup = `${file}.backup-cache-envio-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`;
fs.copyFileSync(file, backup);
const tmp = `${file}.tmp-${process.pid}`;
fs.writeFileSync(tmp, source);
fs.renameSync(tmp, file);
console.log(`[PATCH] bot-engine.mjs atualizado. Backup: ${backup}`);
