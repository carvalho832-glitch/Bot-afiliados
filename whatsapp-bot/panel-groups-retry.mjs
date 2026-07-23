import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverFile = path.join(__dirname, 'server.js');
const retryMarker = 'ACHOU_LEVOU_GRUPOS_RETRY_V1';
const stableMarker = 'ACHOU_LEVOU_GRUPOS_ESTAVEIS_V3';

if (!fs.existsSync(serverFile)) {
  throw new Error(`Arquivo não encontrado: ${serverFile}`);
}

let source = fs.readFileSync(serverFile, 'utf8');
let changed = false;

if (!source.includes(retryMarker)) {
  const loadAllPattern = /async function carregarTudo\(\) \{[\s\S]*?setInterval\(carregarFila, 10000\);\n\}/;
  const loadAllReplacement = `async function carregarTudo() {
  // ${retryMarker}: tenta carregar os grupos novamente enquanto o WhatsApp termina de iniciar.
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

if (!source.includes(stableMarker)) {
  const stateAnchor = 'let gruposDisponiveis = [];';
  if (!source.includes('let gruposCarregando = false;')) {
    if (!source.includes(stateAnchor)) {
      throw new Error('Não foi possível localizar o estado da lista de grupos.');
    }
    source = source.replace(
      stateAnchor,
      `${stateAnchor}\nlet gruposCarregando = false;\nlet gruposCarregadosUmaVez = false;`
    );
  }

  const loadGroupsPattern = /async function carregarGrupos\(\) \{[\s\S]*?\n\}\n\nasync function salvarConfiguracao/;
  const loadGroupsReplacement = `async function carregarGrupos() {
  // ${stableMarker}: atualiza a lista sem desfazer escolhas ainda não salvas.
  if (gruposCarregando) return;
  gruposCarregando = true;

  const box = document.getElementById('gruposLista');
  const checksAntes = Array.from(document.querySelectorAll('.grupo-check'));
  const haviaSelecaoNaTela = checksAntes.length > 0;
  const idsMarcadosAntes = new Set(
    checksAntes.filter(input => input.checked).map(input => String(input.value))
  );
  const categoriasAntes = {};
  document.querySelectorAll('.categoria-grupo').forEach(select => {
    categoriasAntes[String(select.dataset.id)] = select.value || 'geral';
  });

  try {
    const resposta = await fetch('/groups?ts=' + Date.now(), { cache: 'no-store' });
    const json = await resposta.json();

    if (!json.ok) {
      throw new Error(json.error || 'Falha ao carregar grupos');
    }

    const novosGrupos = Array.isArray(json.groups) ? json.groups : [];
    if (!novosGrupos.length) {
      throw new Error('Nenhum grupo retornado pelo WhatsApp.');
    }

    gruposDisponiveis = novosGrupos;
    gruposCarregadosUmaVez = true;
    renderizarGrupos();

    if (haviaSelecaoNaTela) {
      document.querySelectorAll('.grupo-check').forEach(input => {
        input.checked = idsMarcadosAntes.has(String(input.value));
      });
      document.querySelectorAll('.categoria-grupo').forEach(select => {
        const id = String(select.dataset.id);
        if (categoriasAntes[id]) select.value = categoriasAntes[id];
      });
      atualizarResumoGrupos();
    }
  } catch (erro) {
    console.warn('Falha temporária ao atualizar grupos:', erro.message);

    if (gruposCarregadosUmaVez || gruposDisponiveis.length) return;

    const fallback = Array.isArray(settingsAtual?.selectedGroups)
      ? settingsAtual.selectedGroups.filter(grupo => grupo?.id)
      : [];

    if (fallback.length) {
      gruposDisponiveis = fallback;
      renderizarGrupos();
    } else if (box) {
      box.textContent = 'Aguardando o WhatsApp carregar os grupos...';
    }
  } finally {
    gruposCarregando = false;
  }
}

async function salvarConfiguracao`;

  if (!loadGroupsPattern.test(source)) {
    throw new Error('Não foi possível localizar carregarGrupos() no painel.');
  }

  source = source.replace(loadGroupsPattern, loadGroupsReplacement);
  changed = true;
}

if (changed) {
  fs.writeFileSync(serverFile, source, 'utf8');
  console.log('✅ Painel atualizado sem desfazer a seleção manual dos grupos.');
} else {
  console.log('✅ Proteção da seleção de grupos já está aplicada.');
}
