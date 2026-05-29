(() => {
    const API_URL = 'https://bot-afiliados-1fvi.onrender.com';
    const STORAGE_OFERTAS = 'ofertas_achou_levou';

    const inputLink = document.getElementById('input-link');
    const displayProduto = document.getElementById('display-produto');
    const displayDe = document.getElementById('display-de');
    const displayPor = document.getElementById('display-por');
    const displayCupom = document.getElementById('display-cupom');
    const messageBox = document.getElementById('msg-preview');
    const btnGerar = document.getElementById('btn-gerar');
    const btnCopiar = document.getElementById('btn-copiar');
    const btnSalvar = document.getElementById('btn-salvar');
    const btnWhatsApp = document.getElementById('btn-whatsapp');
    const listaSalvas = document.getElementById('lista-salvas');

    if (!inputLink || !displayProduto || !messageBox || !btnGerar) return;

    function extrairLink(texto) {
        return texto.match(/https?:\/\/[^\s]+/)?.[0] || texto.trim();
    }

    function detectarLoja(link) {
        const selectLoja = document.getElementById('select-loja');
        const escolha = selectLoja?.value || 'auto';
        if (escolha !== 'auto') return escolha;

        const l = (link || '').toLowerCase();
        if (l.includes('shopee') || l.includes('shp.ee') || l.includes('collshp')) return 'Shopee';
        if (l.includes('mercadolivre') || l.includes('mercado livre') || l.includes('meli.la')) return 'Mercado Livre';
        if (l.includes('amazon') || l.includes('amzn.to')) return 'Amazon';
        return 'Loja oficial';
    }

    function moedaNumero(valor) {
        return parseFloat((valor || '').replace(/[^\d,]/g, '').replace(',', '.')) || 0;
    }

    function calcularDesconto(de, por) {
        const valorDe = moedaNumero(de);
        const valorPor = moedaNumero(por);
        if (valorDe > valorPor && valorPor > 0) return Math.floor(((valorDe - valorPor) / valorDe) * 100);
        return 0;
    }

    function limparTitulo(produto) {
        return (produto || 'Oferta especial')
            .replace(/Amazon\.com\.br\s?:?\s?/gi, '')
            .replace(/\|\s?Mercado\s?Livre/gi, '')
            .replace(/- Mercado Livre/gi, '')
            .replace(/\|\s?Shopee Brasil/gi, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function getOfertas() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_OFERTAS)) || [];
        } catch {
            return [];
        }
    }

    function setOfertas(ofertas) {
        localStorage.setItem(STORAGE_OFERTAS, JSON.stringify(ofertas));
    }

    async function copiar(texto) {
        if (!texto || texto === 'Aguardando geração...') {
            alert('Gere uma mensagem primeiro!');
            return false;
        }

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

        return true;
    }

    function abrirWhatsApp(texto) {
        if (!texto || texto === 'Aguardando geração...') {
            alert('Gere uma mensagem primeiro!');
            return;
        }
        window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank');
    }

    function criarResumo(texto) {
        const produto = texto.match(/🔥 \*(.*?)!\*/)?.[1] || 'Oferta salva';
        const por = texto.match(/💰 \*POR APENAS: (.*)\*/)?.[1] || texto.match(/✅ \*POR APENAS: (.*)\*/)?.[1] || '';
        const loja = texto.match(/🛒 \*Link (.*?):\*/)?.[1] || 'Loja';
        return { produto, por, loja };
    }

    function imagemDoProduto(item) {
        return item?.imagem || item?.image || item?.imageUrl || '';
    }

    function renderizarHistorico() {
        if (!listaSalvas) return;

        const ofertas = getOfertas();
        listaSalvas.innerHTML = '';

        if (!ofertas.length) {
            listaSalvas.innerHTML = '<div class="empty-state">Nenhuma oferta salva ainda.</div>';
            return;
        }

        ofertas.forEach(item => {
            const texto = item.texto || item;
            const resumo = item.produto ? item : criarResumo(texto);
            const imagem = imagemDoProduto(item);
            const card = document.createElement('div');
            card.className = 'saved-card';

            card.innerHTML = `
                ${imagem ? `<img src="${imagem}" alt="Foto do produto" loading="lazy" referrerpolicy="no-referrer" style="width:100%;max-height:210px;object-fit:contain;border-radius:14px;margin-bottom:12px;background:#fff;border:1px solid var(--border);padding:8px;" onerror="this.remove()">` : ''}
                <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:10px;">
                    <strong style="font-size:14px;line-height:1.35;">${resumo.produto || 'Oferta salva'}</strong>
                    <span style="font-size:11px;color:#f97316;font-weight:800;white-space:nowrap;">${resumo.loja || 'Loja'}</span>
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
                    ${resumo.por ? `<span style="font-size:11px;border:1px solid #30363d;border-radius:999px;padding:6px 9px;color:#f97316;font-weight:800;">${resumo.por}</span>` : ''}
                    ${item.cupom ? `<span style="font-size:11px;border:1px solid #30363d;border-radius:999px;padding:6px 9px;font-weight:800;">Cupom: ${item.cupom}</span>` : ''}
                </div>
                <pre style="font-size:12px;white-space:pre-wrap;margin:0 0 12px 0;max-height:180px;overflow:auto;">${texto}</pre>
                <div style="display:grid;grid-template-columns:1fr 1fr 52px;gap:8px;">
                    <button class="green-btn" data-copy-gemini="${item.id}" style="margin:0;padding:12px;font-size:12px;">COPIAR</button>
                    <button class="green-btn" data-wa-gemini="${item.id}" style="margin:0;padding:12px;font-size:12px;">WHATSAPP</button>
                    <button class="red-btn" data-rm-gemini="${item.id}" style="margin:0;padding:12px;font-size:14px;">🗑️</button>
                </div>`;

            listaSalvas.appendChild(card);
        });
    }

    function dadosParaGemini() {
        const link = extrairLink(inputLink.value);
        const precoDe = displayDe?.value || '';
        const precoPor = displayPor?.value || '';
        const desconto = calcularDesconto(precoDe, precoPor);

        return {
            produto: limparTitulo(displayProduto.value || 'Oferta especial'),
            precoDe,
            precoPor,
            desconto: desconto >= 2 ? `${desconto}% OFF` : '',
            cupom: displayCupom?.value?.trim() || '',
            loja: detectarLoja(link),
            link
        };
    }

    async function fetchComTimeout(url, opcoes = {}, timeout = 70000) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);

        try {
            return await fetch(url, {
                ...opcoes,
                signal: controller.signal,
                cache: 'no-store'
            });
        } finally {
            clearTimeout(timer);
        }
    }

    async function aquecerApi() {
        messageBox.innerText = 'Acordando a IA no Render... isso pode levar alguns segundos no plano grátis.';
        const resposta = await fetchComTimeout(`${API_URL}/health`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        }, 80000);

        if (!resposta.ok) {
            throw new Error('A API do Render não respondeu no teste /health.');
        }
    }

    async function gerarComGemini() {
        const dados = dadosParaGemini();

        await aquecerApi();
        messageBox.innerText = 'Gemini está criando a mensagem de venda...';

        const resposta = await fetchComTimeout(`${API_URL}/gerar-mensagem`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(dados)
        }, 90000);

        let json = null;
        try {
            json = await resposta.json();
        } catch {
            throw new Error('A API respondeu, mas não retornou JSON válido.');
        }

        if (!resposta.ok || !json.ok || !json.mensagem) {
            throw new Error(json?.error || 'Não consegui gerar a mensagem com Gemini.');
        }

        return json.mensagem.trim();
    }

    btnGerar.onclick = async () => {
        if (!displayProduto.value || displayProduto.value === 'Buscando...') {
            alert('Puxe os dados primeiro ou preencha o produto manualmente!');
            return;
        }

        const textoOriginalBotao = btnGerar.innerText;
        btnGerar.disabled = true;
        btnGerar.innerText = '🤖 GEMINI CRIANDO...';
        messageBox.innerText = 'Preparando Gemini...';

        try {
            const mensagem = await gerarComGemini();
            window.__ultimaMensagemAchouLevou = mensagem;
            messageBox.innerText = mensagem;
            btnGerar.innerText = '✅ MENSAGEM GERADA!';
            setTimeout(() => btnGerar.innerText = textoOriginalBotao || '✨ GERAR MENSAGEM', 1800);
        } catch (erro) {
            console.error('Erro Gemini:', erro);
            const msgErro = erro.name === 'AbortError'
                ? 'A IA demorou demais para responder. No Render grátis, tente novamente em alguns segundos.'
                : (erro.message || 'Erro ao gerar mensagem com Gemini.');

            window.__ultimaMensagemAchouLevou = '';
            messageBox.innerText = `Não consegui gerar com Gemini agora. Detalhe: ${msgErro}`;
            alert(msgErro);
            btnGerar.innerText = textoOriginalBotao || '✨ GERAR MENSAGEM';
        } finally {
            btnGerar.disabled = false;
        }
    };

    if (btnCopiar) {
        btnCopiar.onclick = async () => {
            const texto = window.__ultimaMensagemAchouLevou || messageBox.innerText;
            const copiou = await copiar(texto);
            if (copiou) {
                btnCopiar.innerText = '✅ COPIADO!';
                setTimeout(() => btnCopiar.innerText = '📋 COPIAR MENSAGEM', 1800);
            }
        };
    }

    if (btnWhatsApp) {
        btnWhatsApp.onclick = () => {
            const texto = window.__ultimaMensagemAchouLevou || messageBox.innerText;
            abrirWhatsApp(texto);
        };
    }

    if (btnSalvar) {
        btnSalvar.onclick = () => {
            const texto = window.__ultimaMensagemAchouLevou || messageBox.innerText;
            if (!texto || texto === 'Aguardando geração...' || texto.includes('Gemini está') || texto.includes('Acordando a IA') || texto.includes('Preparando Gemini')) {
                alert('Gere uma mensagem primeiro!');
                return;
            }

            const dados = dadosParaGemini();
            const oferta = {
                id: Date.now(),
                texto,
                produto: dados.produto,
                loja: dados.loja,
                por: dados.precoPor,
                de: dados.precoDe,
                cupom: dados.cupom,
                link: dados.link,
                imagem: window.__produtoImagemAtual || '',
                criadoEm: new Date().toLocaleString('pt-BR')
            };

            const ofertas = getOfertas();
            ofertas.unshift(oferta);
            setOfertas(ofertas);
            renderizarHistorico();
            alert('Oferta salva! 💾');
        };
    }

    if (listaSalvas) {
        listaSalvas.addEventListener('click', async event => {
            const botao = event.target.closest('button');
            if (!botao) return;

            const id = Number(botao.dataset.copyGemini || botao.dataset.waGemini || botao.dataset.rmGemini);
            if (!id) return;

            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            const ofertas = getOfertas();
            const item = ofertas.find(oferta => Number(oferta.id) === id);
            if (!item) return;

            if (botao.dataset.copyGemini) {
                await copiar(item.texto || item);
                alert('Copiado! ✅');
            }

            if (botao.dataset.waGemini) {
                abrirWhatsApp(item.texto || item);
            }

            if (botao.dataset.rmGemini) {
                const ok = window.appConfirm
                    ? await window.appConfirm({
                        badge: '🗑️ Remover oferta',
                        title: 'Apagar esta oferta?',
                        message: 'Ela será removida do seu histórico salvo no celular.',
                        okText: 'Sim, apagar',
                        cancelText: 'Manter'
                    })
                    : confirm('Deseja excluir esta oferta?');

                if (ok) {
                    setOfertas(ofertas.filter(oferta => Number(oferta.id) !== id));
                    renderizarHistorico();
                }
            }
        }, true);
    }
})();
