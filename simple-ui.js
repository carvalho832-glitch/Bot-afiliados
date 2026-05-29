(() => {
  document.body.classList.add('simple-mode');

  const container = document.querySelector('.container');
  const inputBox = document.querySelector('.input-box');
  const fieldsGrid = document.querySelector('.fields-grid');
  const savedSection = document.querySelector('.saved-section');
  const msgPreview = document.getElementById('msg-preview');
  const btnGerar = document.getElementById('btn-gerar');
  const btnPuxar = document.getElementById('btn-puxar');
  const actions = document.querySelector('.actions');

  if (!container || !inputBox || !fieldsGrid) return;

  function criarGuia() {
    if (document.querySelector('.simple-guide')) return;

    const guide = document.createElement('section');
    guide.className = 'simple-guide';
    guide.innerHTML = `
      <span class="simple-guide-title">🚀 Venda em 3 passos</span>
      <small>Cole o link, puxe os dados e gere a mensagem pronta para WhatsApp.</small>
    `;

    inputBox.before(guide);
  }

  function organizarCampos() {
    if (fieldsGrid.dataset.simpleReady === '1') return;
    fieldsGrid.dataset.simpleReady = '1';
    fieldsGrid.classList.add('simple-collapsed');

    const header = document.createElement('div');
    header.className = 'simple-section-header';
    header.innerHTML = `
      <div><strong>📦 Produto encontrado</strong><br><small>confira antes de gerar</small></div>
      <button type="button" class="simple-toggle-btn">Editar</button>
    `;

    fieldsGrid.prepend(header);

    const toggle = header.querySelector('.simple-toggle-btn');
    toggle.addEventListener('click', () => {
      fieldsGrid.classList.toggle('simple-collapsed');
      toggle.textContent = fieldsGrid.classList.contains('simple-collapsed') ? 'Editar' : 'Ocultar';
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

  function criarAcoesSimples() {
    if (!actions || document.querySelector('.simple-whatsapp-action')) return;

    const btnWhats = document.createElement('button');
    btnWhats.type = 'button';
    btnWhats.className = 'green-btn simple-whatsapp-action';
    btnWhats.textContent = '💬 Enviar no WhatsApp';

    const btnMais = document.createElement('button');
    btnMais.type = 'button';
    btnMais.className = 'simple-more-toggle';
    btnMais.textContent = '⋯ Mais opções';

    actions.appendChild(btnWhats);
    actions.appendChild(btnMais);

    btnWhats.addEventListener('click', () => {
      const texto = (window.__ultimaMensagemAchouLevou || msgPreview?.innerText || '').trim();
      if (!texto || texto === 'Aguardando geração...') {
        alert('Gere uma mensagem primeiro!');
        return;
      }
      window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank');
    });

    btnMais.addEventListener('click', () => {
      document.body.classList.toggle('simple-more-open');
      btnMais.textContent = document.body.classList.contains('simple-more-open')
        ? 'Ocultar opções'
        : '⋯ Mais opções';
    });
  }

  function atualizarEstadoMensagem() {
    const texto = (msgPreview?.innerText || '').trim();
    const pronta = texto && texto !== 'Aguardando geração...' && !texto.toLowerCase().includes('gemini está criando') && !texto.toLowerCase().includes('preparando');
    document.body.classList.toggle('message-ready', Boolean(pronta));
    if (!pronta) document.body.classList.remove('simple-more-open');
  }

  function observarMensagem() {
    if (!msgPreview) return;
    atualizarEstadoMensagem();
    const observer = new MutationObserver(atualizarEstadoMensagem);
    observer.observe(msgPreview, { childList: true, subtree: true, characterData: true });
  }

  function renomearBotoes() {
    if (btnPuxar) btnPuxar.textContent = '🔎 Puxar produto';
    if (btnGerar) btnGerar.textContent = '✨ Gerar mensagem';

    const copiar = document.getElementById('btn-copiar');
    const salvar = document.getElementById('btn-salvar');
    const limpar = document.getElementById('btn-limpar-campos');
    if (copiar) copiar.textContent = '📋 Copiar texto';
    if (salvar) salvar.textContent = '💾 Salvar oferta';
    if (limpar) limpar.textContent = '🗑️ Limpar tudo';
  }

  criarGuia();
  organizarCampos();
  organizarHistorico();
  criarAcoesSimples();
  observarMensagem();
  renomearBotoes();
})();
