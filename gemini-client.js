(() => {
  const API_URL = 'https://bot-afiliados-1fwi.onrender.com';
  const REQUEST_TIMEOUT_MS = 45000;

  const inputLink = document.getElementById('input-link');
  const selectLoja = document.getElementById('select-loja');
  const displayProduto = document.getElementById('display-produto');
  const displayDe = document.getElementById('display-de');
  const displayPor = document.getElementById('display-por');
  const displayCupom = document.getElementById('display-cupom');
  const messageBox = document.getElementById('msg-preview');
  const btnGerar = document.getElementById('btn-gerar');
  const btnSalvar = document.getElementById('btn-salvar');
  const btnCopiar = document.getElementById('btn-copiar');

  if (!inputLink || !displayProduto || !messageBox || !btnGerar) return;

  let geracaoEmAndamento = null;
  let salvandoDepoisDaGeracao = false;

  function limpar(valor = '') {
    return String(valor || '').replace(/\s+/g, ' ').trim();
  }

  function extrairLink(texto = '') {
    return String(texto || '').match(/https?:\/\/[^\s]+/)?.[0] || limpar(texto);
  }

  function detectarLoja(link = '') {
    const escolha = selectLoja?.value || 'auto';
    if (escolha !== 'auto') return escolha;

    const valor = String(link).toLowerCase();
    if (valor.includes('shopee') || valor.includes('shp.ee') || valor.includes('collshp')) return 'Shopee';
    if (valor.includes('mercadolivre') || valor.includes('mercado livre') || valor.includes('meli.la')) return 'Mercado Livre';
    if (valor.includes('amazon') || valor.includes('amzn.to')) return 'Amazon';
    if (valor.includes('magalu') || valor.includes('magazineluiza') || valor.includes('magazinevoce')) return 'Magalu';
    return 'Loja oficial';
  }

  function obterLinkOriginal() {
    return extrairLink(window.__achouLevouOriginalShortUrl || inputLink.value || '');
  }

  function dadosDaTela() {
    const link = obterLinkOriginal();
    return {
      produto: limpar(displayProduto.value || ''),
      precoDe: limpar(displayDe?.value || ''),
      precoPor: limpar(displayPor?.value || ''),
      cupom: limpar(displayCupom?.value || ''),
      loja: detectarLoja(link),
      link
    };
  }

  function mensagemAtual() {
    const texto = (messageBox.innerText || '').trim();
    return texto && texto !== 'Aguardando geração...' ? texto : '';
  }

  function aplicarMensagem(texto) {
    const mensagem = String(texto || '').trim();
    window.__ultimaMensagemAchouLevou = mensagem;
    messageBox.innerText = mensagem || 'Aguardando geração...';
    messageBox.dispatchEvent(new Event('input', { bubbles: true }));
  }

  async function lerJson(resposta) {
    const texto = await resposta.text();
    try {
      return JSON.parse(texto);
    } catch {
      throw new Error(`O servidor devolveu uma resposta inválida: ${texto.slice(0, 160)}`);
    }
  }

  function restaurarBotao(textoOriginal, textoTemporario, atraso = 1300) {
    btnGerar.innerText = textoTemporario;
    setTimeout(() => {
      btnGerar.innerText = textoOriginal;
      btnGerar.disabled = false;
    }, atraso);
  }

  function avisarFallbackUmaVez(aviso) {
    const chave = 'achou_levou_aviso_gemini_fallback';
    if (sessionStorage.getItem(chave)) return;
    sessionStorage.setItem(chave, '1');
    alert(`${aviso || 'O Gemini não respondeu. Uma mensagem local segura foi criada.'}\n\nA oferta pode ser revisada normalmente antes de salvar.`);
  }

  async function gerarMensagem() {
    if (geracaoEmAndamento) return geracaoEmAndamento;

    const dados = dadosDaTela();
    if (!dados.produto || /buscando/i.test(dados.produto)) {
      alert('Puxe os dados primeiro ou preencha o produto manualmente!');
      return null;
    }
    if (!dados.link) {
      alert('Cole o link de afiliado antes de gerar a mensagem.');
      return null;
    }

    const textoOriginal = '🤖 Gerar mensagem com IA';
    btnGerar.disabled = true;
    btnGerar.innerText = '✨ Gemini criando...';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    geracaoEmAndamento = (async () => {
      try {
        const resposta = await fetch(`${API_URL}/gerar-mensagem`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          body: JSON.stringify(dados),
          cache: 'no-store',
          credentials: 'omit',
          signal: controller.signal
        });

        const json = await lerJson(resposta);
        if (!resposta.ok || !json?.ok || !json?.mensagem) {
          throw new Error(json?.error || json?.detalhe || `Falha HTTP ${resposta.status}.`);
        }

        aplicarMensagem(json.mensagem);

        if (json.fallback) {
          restaurarBotao(textoOriginal, '⚠️ Mensagem local', 1700);
          avisarFallbackUmaVez(json.warning);
        } else {
          restaurarBotao(textoOriginal, '✅ Criada com Gemini');
        }

        return json;
      } catch (error) {
        btnGerar.disabled = false;
        btnGerar.innerText = textoOriginal;
        const detalhe = error?.name === 'AbortError'
          ? 'O Gemini demorou mais de 45 segundos para responder.'
          : String(error?.message || error);
        alert(`Não foi possível gerar a mensagem com IA.\n\n${detalhe}`);
        throw error;
      } finally {
        clearTimeout(timeout);
        geracaoEmAndamento = null;
      }
    })();

    return geracaoEmAndamento;
  }

  async function copiar(texto) {
    if (!texto) return alert('Gere uma mensagem primeiro!');
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      const area = document.createElement('textarea');
      area.value = texto;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    alert('Copiado! ✅');
  }

  // A captura ocorre antes dos geradores antigos. Assim, somente esta integração
  // controla o botão sem interferir na fila, nos grupos ou no envio ao WhatsApp.
  btnGerar.addEventListener('click', event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    gerarMensagem().catch(error => console.error('[GEMINI] Falha na geração:', error));
  }, true);

  // O salvamento antigo esperava uma mensagem síncrona. Quando a tela estiver
  // vazia, aguardamos o Gemini e repetimos o clique já com a mensagem pronta.
  btnSalvar?.addEventListener('click', event => {
    if (mensagemAtual() || salvandoDepoisDaGeracao) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    salvandoDepoisDaGeracao = true;

    gerarMensagem()
      .then(resultado => {
        if (resultado?.mensagem && mensagemAtual()) btnSalvar.click();
      })
      .catch(error => console.error('[GEMINI] Não foi possível gerar antes de salvar:', error))
      .finally(() => {
        salvandoDepoisDaGeracao = false;
      });
  }, true);

  btnCopiar?.addEventListener('click', event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    copiar(mensagemAtual() || window.__ultimaMensagemAchouLevou || '');
  }, true);

  window.AchouLevouGemini = {
    gerarMensagem,
    dadosDaTela,
    apiUrl: API_URL
  };
})();
