'use strict';

const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'panel.html');
const original = fs.readFileSync(file, 'utf8');
let next = original;

next = next.replace(
  "let settingsAtual=null;let gruposDisponiveis=[];let selecaoSuja=false;",
  "let settingsAtual=null;let gruposDisponiveis=[];let selecaoSuja=false;let substituirSelecaoCompleta=false;"
);

next = next.replace(
  "function limparSelecao(){document.querySelectorAll('.grupo-check').forEach(i=>i.checked=false);selecaoSuja=true;atualizarResumo()}",
  "function limparSelecao(){document.querySelectorAll('.grupo-check').forEach(i=>i.checked=false);selecaoSuja=true;substituirSelecaoCompleta=true;atualizarResumo()}"
);

const oldSave = "async function salvarConfiguracao(){const selectedGroups=gruposTela();const box=document.getElementById('configResultado');if(!selectedGroups.length){box.textContent='Selecione pelo menos um grupo.';return}const payload={enabled:document.getElementById('enabled').checked,selectedGroups,groupCategories:categoriasTela(),windowStart:document.getElementById('windowStart').value,windowEnd:document.getElementById('windowEnd').value,intervalMinutes:Number(document.getElementById('intervalMinutes').value),offersPerBatch:Number(document.getElementById('offersPerBatch').value),dailyLimit:Number(document.getElementById('dailyLimit').value)};box.textContent='Salvando...';const r=await fetch('/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const j=await r.json();if(!j.ok){box.textContent='Erro: '+(j.error||'falha');return}settingsAtual=j.settings;selecaoSuja=false;box.textContent='✅ Configuração salva.';await carregarSettings();renderizarGrupos(false)}";

const newSave = "async function salvarConfiguracao(){const selecionadosVisiveis=gruposTela();const idsVisiveis=new Set(gruposDisponiveis.map(g=>String(g.id)));const preservadosOcultos=substituirSelecaoCompleta?[]:((settingsAtual&&settingsAtual.selectedGroups)||[]).filter(g=>!idsVisiveis.has(String(g.id)));const selectedGroups=[...preservadosOcultos,...selecionadosVisiveis];const box=document.getElementById('configResultado');if(!selectedGroups.length){box.textContent='Selecione pelo menos um grupo.';return}const payload={enabled:document.getElementById('enabled').checked,selectedGroups,groupCategories:{...((settingsAtual&&settingsAtual.groupCategories)||{}),...categoriasTela()},windowStart:document.getElementById('windowStart').value,windowEnd:document.getElementById('windowEnd').value,intervalMinutes:Number(document.getElementById('intervalMinutes').value),offersPerBatch:Number(document.getElementById('offersPerBatch').value),dailyLimit:Number(document.getElementById('dailyLimit').value)};box.textContent='Salvando...';const r=await fetch('/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const j=await r.json();if(!j.ok){box.textContent='Erro: '+(j.error||'falha');return}settingsAtual=j.settings;selecaoSuja=false;substituirSelecaoCompleta=false;box.textContent='✅ Configuração salva. Grupos fora da lista visível foram preservados.';await carregarSettings();renderizarGrupos(false)}";

next = next.replace(oldSave, newSave);

if (next === original) {
  console.error('[PATCH] Nenhuma alteração aplicada. O painel não corresponde à versão esperada.');
  process.exit(1);
}

if (!next.includes('preservadosOcultos') || !next.includes('substituirSelecaoCompleta')) {
  console.error('[PATCH] Validação interna falhou.');
  process.exit(1);
}

const backup = `${file}.backup-preservar-grupos-${new Date().toISOString().replace(/[:.]/g, '-')}`;
fs.copyFileSync(file, backup);
fs.writeFileSync(file, next);
console.log('[PATCH] Painel corrigido para preservar grupos ausentes em leituras parciais.');
console.log(`[PATCH] Backup: ${backup}`);
