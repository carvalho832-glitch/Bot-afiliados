(() => {
    const STORAGE_OFERTAS = 'ofertas_achou_levou';

    const inputLink = document.getElementById('input-link');
    const selectGrupo = document.getElementById('select-grupo');
    const displayProduto = document.getElementById('display-produto');
    const displayDe = document.getElementById('display-de');
    const displayPor = document.getElementById('display-por');
    const displayCupom = document.getElementById('display-cupom');
    const messageBox = document.getElementById('msg-preview');
    const btnGerar = document.getElementById('btn-gerar');
    const btnCopiar = document.getElementById('btn-copiar');
    const btnSalvar = document.getElementById('btn-salvar');
    const listaSalvas = document.getElementById('lista-salvas');
    const actions = document.querySelector('.actions');
    const sectionTitle = document.querySelector('.section-title');

    if (!inputLink || !actions || !listaSalvas) return;

    let ultimaMensagem = '';

    if (!document.getElementById('select-loja')) {
        const lojaBox = document.createElement('div');
        lojaBox.className = 'field';
        lojaBox.style.marginTop = '10px';
        lojaBox.innerHTML = `
            <label for="select-loja">🏬 Loja do produto</label>
            <select id="select-loja">
                <option value="auto">Detectar automaticamente</option>
                <option value="Shopee">Shopee</option>
                <option value="Mercado Livre">Mercado Livre</option>
                <option value="Amazon">Amazon</option>
                <option value="Outra loja">Outra loja</option>
            </select>`;

        inputLink.parentElement.insertBefore(lojaBox, document.getElementById('btn-puxar'));
    }

    const selectLoja = document.getElementById('select-loja');

    if (!document.getElementById('btn-whatsapp')) {
        const btnWhatsApp = document.createElement('button');
        btnWhatsApp.id = 'btn-whatsapp';
        btnWhatsApp.className = 'green-btn';
        btnWhatsApp.type = 'button';
        btnWhatsApp.innerText = '💬 ENVIAR NO WHATSAPP';
        actions.insertBefore(btnWhatsApp, btnSalvar);
    }

    const btnWhatsApp = document.getElementById('btn-whatsapp');

    if (!sectionTitle?.querySelector('.btn-limpar-historico-inline')) {
        const btnLimparHistorico = document.createElement('button');
        btnLimparHistorico.type = 'button';
        btnLimparHistorico.className = 'btn-limpar-historico-inline';
        btnLimparHistorico.innerText = '🧹 Limpar histórico';
        btnLimparHistorico.style.cssText = 'width:auto;margin:0;padding:8px 10px;border-radius:999px;background:#da3633;color:#fff;font-size:11px;';
        sectionTitle?.appendChild(btnLimparHistorico);
    }

    const btnLimparHistorico = sectionTitle?.querySelector('.btn-limpar-historico-inline');

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

    function extrairLink(texto) {
        return texto.match(/https?:\/\/[^\s]+/)?.[0] || texto.trim();
    }

    function detectarLoja(link) {
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

    function desconto() {
        const de = moedaNumero(displayDe.value);
        const por = moedaNumero(displayPor.value);
        if (de > por && por > 0) return Math.floor(((de - por) / de) * 100);
        return 0;
    }

    function limparTituloProduto(produto) {
        return (produto || 'Oferta especial')
            .replace(/Amazon\.com\.br\s?:?\s?/gi, '')
            .replace(/\|\s?Mercado\s?Livre/gi, '')
            .replace(/- Mercado Livre/gi, '')
            .replace(/\|\s?Shopee Brasil/gi, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function tituloCurto(produto) {
        return limparTituloProduto(produto).split(' ').slice(0, 8).join(' ').toUpperCase();
    }

    function beneficioPorProduto(produto) {
        const p = (produto || '').toLowerCase();

        if (p.includes('tv') || p.includes('smart')) return 'Tela grande para filmes, séries, jogos e apps de streaming.';
        if (p.includes('notebook') || p.includes('laptop') || p.includes('inspiron') || p.includes('dell')) return 'Ideal para trabalho, estudos, navegação e tarefas do dia a dia.';
        if (p.includes('celular') || p.includes('smartphone') || p.includes('galaxy') || p.includes('iphone') || p.includes('motorola')) return 'Ótimo para fotos, vídeos, redes sociais, apps e uso diário.';
        if (p.includes('cadeira') && (p.includes('auto') || p.includes('carro') || p.includes('bebê') || p.includes('bebe'))) return 'Mais segurança e conforto para transportar a criança no carro.';
        if (p.includes('toalha') || p.includes('algodão') || p.includes('algodao') || p.includes('cama') || p.includes('banho')) return 'Produto útil para renovar a casa e deixar a rotina mais confortável.';
        if (p.includes('fone') || p.includes('headset') || p.includes('bluetooth')) return 'Mais praticidade para músicas, vídeos e chamadas.';
        if (p.includes('bolsa') || p.includes('mochila')) return 'Ajuda a organizar seus itens com praticidade no dia a dia.';
        if (p.includes('tenis') || p.includes('tênis') || p.includes('sapato') || p.includes('sandalia') || p.includes('sandália')) return 'Mais conforto e estilo para usar na rotina.';
        if (p.includes('omega') || p.includes('ômega') || p.includes('capsula') || p.includes('cápsula') || p.includes('cafeína') || p.includes('cafeina')) return 'Produto prático para incluir na rotina de cuidados pessoais.';
        if (p.includes('grill') || p.includes('sanduicheira')) return 'Prepara lanches rápidos com mais praticidade no dia a dia.';

        return 'Produto selecionado para facilitar sua rotina e ajudar você a economizar.';
    }

    function montarMensagemNova() {
        const link = extrairLink(inputLink.value);
        const loja = detectarLoja(link);
        const desc = desconto();
        const produto = limparTituloProduto(displayProduto.value || 'Oferta especial');
        const beneficio = beneficioPorProduto(produto);
        const cupom = displayCupom.value.trim();
        const temDe = displayDe.value && displayDe.value !== 'R$ 0,00';
        const temPor = displayPor.value && displayPor.value !== 'R$ 0,00';
        const cupomEhFrete = /frete|gr[aá]tis/i.test(cupom);

        let msg = `🔥 *${tituloCurto(produto)}!*\n`;
        msg += `✅ ${beneficio}\n\n`;

        if (temDe) msg += `❌ De: ~${displayDe.value}~\n`;
        msg += `💰 *POR APENAS: ${temPor ? displayPor.value : 'Confira no site'}*\n`;
        if (desc >= 2) msg += `🔥 *${desc}% OFF!*\n`;

        if (cupom) {
            msg += cupomEhFrete
                ? `🚚 *Frete grátis:* ${cupom}\n`
                : `🎫 *Cupom:* ${cupom}\n`;
        }

        msg += `\n🔒 *Compre com segurança no site oficial:*\n`;
        msg += `🛒 *Link ${loja}:* ${link}`;

        return msg;
    }

    async function copiar(texto) {
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
    }

    function abrirWhatsApp(texto) {
        if (!texto || texto === 'Aguardando geração...') {
            alert('Gere uma mensagem primeiro!');
            return;
        }
        window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank');
    }

    function criarResumo(texto) {
        const produto = texto.match(/🔥 \*(.*?)!\*/)?.[1] || texto.match(/📦 \*Produto:\* (.*)/)?.[1] || 'Oferta salva';
        const por = texto.match(/💰 \*POR APENAS: (.*)\*/)?.[1] || texto.match(/✅ \*POR APENAS: (.*)\*/)?.[1] || texto.match(/✅ \*Por apenas: (.*)\*/)?.[1] || '';
        const loja = texto.match(/🛒 \*Link (.*?):\*/)?.[1] || 'Loja';
        return { produto, por, loja };
    }

    function imagemDoProduto(item) {
        return item?.imagem || item?.image || item?.imageUrl || '';
    }

    function renderizarHistorico() {
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
                ${imagem ? `<img src="${imagem}" alt="Foto do produto" loading="lazy" referrerpolicy="no-referrer" style="width:100%;max-height:210px;object-fit:cover;border-radius:14px;margin-bottom:12px;background:var(--input-bg);border:1px solid var(--border);" onerror="this.remove()">` : ''}
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
                    <button class="green-btn" data-copy="${item.id}" style="margin:0;padding:12px;font-size:12px;">COPIAR</button>
                    <button class="green-btn" data-wa="${item.id}" style="margin:0;padding:12px;font-size:12px;">WHATSAPP</button>
                    <button class="red-btn" data-rm="${item.id}" style="margin:0;padding:12px;font-size:14px;">🗑️</button>
                </div>`;

            listaSalvas.appendChild(card);
        });
    }

    btnGerar.onclick = () => {
        if (!displayProduto.value || displayProduto.value === 'Buscando...') {
            alert('Puxe os dados primeiro ou preencha o produto manualmente!');
            return;
        }
        ultimaMensagem = montarMensagemNova();
        messageBox.innerText = ultimaMensagem;
        btnGerar.innerText = '✅ MENSAGEM GERADA!';
        setTimeout(() => btnGerar.innerText = '✨ GERAR MENSAGEM', 1800);
    };

    btnCopiar.onclick = async () => {
        const texto = ultimaMensagem || messageBox.innerText;
        await copiar(texto);
        btnCopiar.innerText = '✅ COPIADO!';
        setTimeout(() => btnCopiar.innerText = '📋 COPIAR MENSAGEM', 1800);
    };

    btnWhatsApp.onclick = () => {
        const texto = ultimaMensagem || messageBox.innerText;
        abrirWhatsApp(texto);
    };

    btnSalvar.onclick = () => {
        if (!displayProduto.value || displayProduto.value === 'Buscando...') {
            alert('Nada para salvar!');
            return;
        }

        const texto = ultimaMensagem || montarMensagemNova();
        const link = extrairLink(inputLink.value);
        const oferta = {
            id: Date.now(),
            texto,
            produto: displayProduto.value || 'Oferta salva',
            loja: detectarLoja(link),
            por: displayPor.value,
            de: displayDe.value,
            cupom: displayCupom.value.trim(),
            link,
            imagem: window.__produtoImagemAtual || '',
            criadoEm: new Date().toLocaleString('pt-BR')
        };

        const ofertas = getOfertas();
        ofertas.unshift(oferta);
        setOfertas(ofertas);
        renderizarHistorico();
        alert('Oferta salva! 💾');
    };

    btnLimparHistorico.onclick = () => {
        if (confirm('Deseja limpar todo o histórico de ofertas salvas?')) {
            setOfertas([]);
            renderizarHistorico();
        }
    };

    listaSalvas.addEventListener('click', async (e) => {
        const botao = e.target.closest('button');
        if (!botao) return;

        const ofertas = getOfertas();
        const id = Number(botao.dataset.copy || botao.dataset.wa || botao.dataset.rm);
        const item = ofertas.find(o => Number(o.id) === id);
        if (!item) return;

        if (botao.dataset.copy) {
            await copiar(item.texto || item);
            alert('Copiado! ✅');
        }

        if (botao.dataset.wa) abrirWhatsApp(item.texto || item);

        if (botao.dataset.rm) {
            if (confirm('Deseja excluir esta oferta?')) {
                setOfertas(ofertas.filter(o => Number(o.id) !== id));
                renderizarHistorico();
            }
        }
    });

    renderizarHistorico();
})();
