'use strict';

const fs = require('fs');
const path = require('path');

const appDir = __dirname;
const currentFile = path.join(appDir, 'data', 'settings.json');
const apply = process.argv.includes('--apply');

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && entry.name === 'settings.json') out.push(full);
  }
  return out;
}

function readCandidate(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const groups = Array.isArray(data.selectedGroups) ? data.selectedGroups.filter(g => g && g.id) : [];
    return { file, data, groups };
  } catch {
    return null;
  }
}

if (!fs.existsSync(currentFile)) {
  console.error(`ERRO: configuração atual não encontrada: ${currentFile}`);
  process.exit(1);
}

const roots = [
  path.join(appDir, 'backups-safe'),
  path.join(appDir, 'data-backup-antes-grupos'),
  path.dirname(appDir)
];

const files = Array.from(new Set([currentFile, ...roots.flatMap(root => walk(root))]));
const candidates = files.map(readCandidate).filter(Boolean).sort((a, b) => b.groups.length - a.groups.length);
const current = readCandidate(currentFile);
const best = candidates[0];

console.log(`[RECUPERAÇÃO] Seleção atual: ${current.groups.length} grupo(s).`);
console.log(`[RECUPERAÇÃO] Melhor backup encontrado: ${best.groups.length} grupo(s).`);
console.log(`[RECUPERAÇÃO] Origem: ${best.file}`);

if (!best || best.groups.length <= current.groups.length) {
  console.log('[RECUPERAÇÃO] Nenhum backup com seleção maior foi encontrado. Nada alterado.');
  process.exit(0);
}

for (const group of best.groups) {
  console.log(`- ${group.name || group.id}`);
}

if (!apply) {
  console.log('\nModo de conferência. Rode novamente com --apply para restaurar essa seleção.');
  process.exit(0);
}

const mergedCategories = { ...(best.data.groupCategories || {}), ...(current.data.groupCategories || {}) };
const next = {
  ...current.data,
  selectedGroups: best.groups.map(group => ({
    id: String(group.id),
    name: String(group.name || group.id),
    category: group.category || mergedCategories[group.id] || 'geral'
  })),
  groupCategories: mergedCategories
};

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupCurrent = `${currentFile}.backup-antes-recuperacao-${stamp}`;
fs.copyFileSync(currentFile, backupCurrent);
const tmp = `${currentFile}.tmp-${process.pid}`;
fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`);
fs.renameSync(tmp, currentFile);

console.log(`[RECUPERAÇÃO] Seleção restaurada para ${next.selectedGroups.length} grupo(s).`);
console.log(`[RECUPERAÇÃO] Backup da configuração anterior: ${backupCurrent}`);
