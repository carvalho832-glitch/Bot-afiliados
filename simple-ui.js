(() => {
  document.body.classList.add('simple-mode');

  const container = document.querySelector('.container');
  const inputBox = document.querySelector('.input-box');
  const fieldsGrid = document.querySelector('.fields-grid');
  const savedSection = document.querySelector('.saved-section');
  const msgPreview = document.getElementById('msg-preview');
  const btnGerar = document.getElementById('btn-gerar');
  const btnPuxar = document.getElementById('btn-puxar');

  if (!container || !inputBox || !fieldsGrid) return;

  function criarGuia() {
    if (document.querySelector('.simple-guide')) return;

    const guide = document.createElement('section');
    guide.className = 'simple-guide';
    guide.innerHTML = `
      <div class="simple-step"><span>1️⃣</span><div>Cole o link<small>Shopee, ML ou Amazon</small></div></div>
      <div class="simple-step"><span>2️⃣</span><div>Puxe os dados<small>preço e produto</small></div></div>
      <div class="simple-step"><span>3️⃣</span><div>Gere e envie<small>mensagem pronta</small></div></div>
    `;

    inputBox.before(guide);

    const tip = document.createElement('p');
    tip.className = 'simple-tip';
    tip.textContent = 'Comece colando o link do produto. O app monta a mensagem de venda automaticamente.';
    inputBox.appendChild(tip);
  }

  function organizarCampos() {
    if (fieldsGrid.dataset.simpleReady === '1') return;
    fieldsGrid.dataset.simpleReady = '1';
    fieldsGrid.classList.add('simple-collapsed');

    const header = document.createElement('div');
    header.className = 'simple-section-header';
    header.innerHTML = `
      <div><strong>📦 Dados encontrados</strong><br><small>confira o produto antes de gerar</small></div>
      <button type="button" class="simple-toggle-btn">Editar preço</button>
    `;

    fieldsGrid.prepend(header);

    const toggle = header.querySelector('.simple-toggle-btn');
    toggle.addEventListener('click', () => {
      fieldsGrid.classList.toggle('simple-collapsed');
      toggle.textContent = fieldsGrid.classList.contains('simple-collapsed') ? 'Editar preço' : 'Ocultar edição';
    });
  }

  function organizarHistorico() {
    if (!savedSection || savedSection.dataset.simpleReady === '1') return;
    savedSection.dataset.simpleReady = '1';
    savedSection.classList.add('simple-history-collapsed');

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'simple-history-toggle';
    toggle.textContent = '📁 Ver ofertas salvas';

    const title = savedSection.querySelector('.section-title');
    if (title) title.after(toggle);
    else savedSection.prepend(toggle);

    toggle.addEventListener('click', () => {
      savedSection.classList.toggle('simple-history-collapsed');
      toggle.textContent = savedSection.classList.contains('simple-history-collapsed')
        ? '📁 Ver ofertas salvas'
        : '📂 Ocultar ofertas salvas';
    });
  }

  function atualizarEstadoMensagem() {
    const texto = (msgPreview?.innerText || '').trim();
    const pronta = texto && texto !== 'Aguardando geração...' && !texto.toLowerCase().includes('gemini está criando') && !texto.toLowerCase().includes('preparando');
    document.body.classList.toggle('message-ready', Boolean(pronta));
  }

  function observarMensagem() {
    if (!msgPreview) return;
    atualizarEstadoMensagem();
    const observer = new MutationObserver(atualizarEstadoMensagem);
    observer.observe(msgPreview, { childList: true, subtree: true, characterData: true });
  }

  function renomearBotoes() {
    if (btnPuxar) btnPuxar.textContent = '🔎 Puxar produto';
    if (btnGerar) btnGerar.textContent = '✨ Gerar mensagem de venda';

    const copiar = document.getElementById('btn-copiar');
    const salvar = document.getElementById('btn-salvar');
    if (copiar) copiar.textContent = '📋 Copiar';
    if (salvar) salvar.textContent = '💾 Salvar';
  }

  criarGuia();
  organizarCampos();
  organizarHistorico();
  observarMensagem();
  renomearBotoes();
})();
