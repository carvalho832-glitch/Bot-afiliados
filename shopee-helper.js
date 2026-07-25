(() => {
    const API_URL = 'https://bot-afiliados-1fwi.onrender.com';

    const inputLink = document.getElementById('input-link');
    const btnPuxar = document.getElementById('btn-puxar');
    const displayProduto = document.getElementById('display-produto');
    const displayDe = document.getElementById('display-de');
    const displayPor = document.getElementById('display-por');
    const displayCupom = document.getElementById('display-cupom');
    const btnGerar = document.getElementById('btn-gerar');
    const btnLimparCampos = document.getElementById('btn-limpar-campos');
    const loader = document.getElementById('loader-global');

    if (!inputLink || !btnPuxar || !displayProduto) return;

    displayProduto.removeAttribute('readonly');
    displayProduto.placeholder = 'Digite ou edite o nome do produto aqui';

    const campoId = document.createElement('div');
    campoId.id = 'shopee-id-field';
    campoId.style.cssText = 'margin-top:12px;';
    campoId.innerHTML = `
        <label for="input-shopee-id">ID do produto Shopee</label>
        <input type="text" id="input-shopee-id" placeholder="Ex: BKL-WUD-YCW" autocomplete="off" autocapitalize="characters">
        <small style="display:block;margin-top:6px;color:var(--muted);font-weight:700;line-height:1.4;">Para Shopee, cole o link acima e o ID copiado no aplicativo. Para Amazon e Mercado Livre, use somente o link.</small>`;
    inputLink.insertAdjacentElement('afterend', campoId);

    const inputShopeeId = document.getElementById('input-shopee-id');

    const helper = document.createElement('div');
    helper.id = 'shopee-helper-box';
    helper.style.cssText = 'display:none;margin:10px 0 0;padding:12px;border:1px solid var(--border);border-radius:14px;background:var(--input-bg);font-size:13px;line-height:1.45;color:var(--text);';
    helper.innerHTML = `
        <strong>🛒 Produto Shopee detectado</strong><br>
        O bot usará primeiro o ID informado para consultar a API oficial. O link continuará sendo usado na mensagem de venda.
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;">
            <button id="btn-open-shopee-link" type="button" class="btn-secondary" style="margin:0;min-height:42px;padding:10px;font-size:12px;">Abrir produto</button>
            <button id="btn-fast-shopee-msg" type="button" class="btn-main soft" style="margin:0;min-height:42px;padding:10px;font-size:12px;">Mensagem rápida</button>
        </div>
        <small style="display:block;margin-top:8px;color:var(--muted);font-weight:700;">O código com letras e hífens será testado na busca oficial da Shopee.</small>`;

    btnPuxar.insertAdjacentElement('afterend', helper);

    function extrairLink(texto) {
        return String(texto || '').match(/https?:\/\/[^\s]+/)?.[0] || String(texto || '').trim();
    }

    function limparId(valor) {
        return String(valor || '').trim().toUpperCase().replace(/\s+/g, '');
    }

    function isShopee(texto) {
        const link = (texto || '').toLowerCase();
        return link.includes('shopee') || link.includes('shp.ee') || link.includes('collshp.com') || link.includes('s.shopee.com.br');
    }

    function deveUsarShopee() {
        return Boolean(limparId(inputShopeeId?.value)) || isShopee(inputLink.value);
    }

    function atualizarHelper() {
        helper.style.display = deveUsarShopee() ? 'block' : 'none';
    }

    function setCarregando(ativo) {
        if (loader) loader.style.display = ativo ? 'flex' : 'none';
        btnPuxar.disabled = ativo;
        btnPuxar.innerText = ativo ? '🔎 Puxando Shopee...' : '🔎 Puxar produto';
    }

    function nomePareceCodigoCurtoShopee(dados) {
        const nome = String(dados?.produto || '').trim();
        const semPreco = !dados?.precoPor && !dados?.precoDe;
        const origemFallback = String(dados?.origem || '').includes('fallback');
        const umaPalavraCurta = /^[a-z0-9-]{4,20}$/i.test(nome);
        const pareceTextoReal = /[áéíóúâêôãõç\s]/i.test(nome) || nome.length > 20;
        return origemFallback && semPreco && umaPalavraCurta && !pareceTextoReal;
    }

    function normalizarProdutoShopee(dados) {
        if (nomePareceCodigoCurtoShopee(dados)) return 'Oferta Shopee com desconto';
        const produto = String(dados?.produto || '').trim();
        if (!produto || produto === 'Buscando na Shopee...') return 'Oferta Shopee com desconto';
        return produto;
    }

    function preencherCampos(dados) {
        displayProduto.value = normalizarProdutoShopee(dados);
        if (displayDe) displayDe.value = dados.precoDe || '';
        if (displayPor) displayPor.value = dados.precoPor || '';
        if (displayCupom) displayCupom.value = dados.cupom || dados.desconto || displayCupom.value || '';
    }

    async function puxarShopeePelaApi(link, idProduto) {
        const params = new URLSearchParams();
        if (link) params.set('url', link);
        if (idProduto) params.set('id', idProduto);

        const resposta = await fetch(`${API_URL}/shopee/produto?${params.toString()}`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            cache: 'no-store'
        });

        const json = await resposta.json().catch(() => null);
        if (!resposta.ok || !json?.ok) {
            const detalhe = json?.detalhe || json?.error || 'Não consegui puxar os dados da Shopee.';
            throw new Error(detalhe);
        }
        return json;
    }

    inputLink.addEventListener('input', atualizarHelper);
    inputShopeeId?.addEventListener('input', () => {
        inputShopeeId.value = limparId(inputShopeeId.value);
        atualizarHelper();
    });

    btnPuxar.addEventListener('click', async (event) => {
        if (!deveUsarShopee()) return;

        event.preventDefault();
        event.stopImmediatePropagation();

        const link = extrairLink(inputLink.value);
        const idProduto = limparId(inputShopeeId?.value);

        if (!idProduto && !link) return alert('Cole o link ou o ID do produto Shopee.');
        if (!idProduto && isShopee(link)) return alert('Cole também o ID do produto Shopee no novo campo abaixo do link.');

        helper.style.display = 'block';
        setCarregando(true);
        displayProduto.value = 'Buscando na Shopee...';
        if (displayDe) displayDe.value = '';
        if (displayPor) displayPor.value = '';

        try {
            const dados = await puxarShopeePelaApi(link, idProduto);
            preencherCampos(dados);

            if (dados?.origem === 'shopee-fallback') {
                alert(`A Shopee não encontrou o produto por esse ID.\n\nMotivo: ${dados.aviso || 'motivo não informado'}\n\nConfira se o ID foi copiado exatamente como aparece no aplicativo.`);
            } else {
                alert('Dados da Shopee puxados pelo ID! ✅');
            }
        } catch (erro) {
            console.error('Erro Shopee API:', erro);
            displayProduto.value = displayProduto.value === 'Buscando na Shopee...' ? 'Oferta Shopee com desconto' : displayProduto.value;
            alert(`Não consegui puxar esse ID da Shopee. Detalhe: ${erro.message}`);
        } finally {
            setCarregando(false);
        }
    }, true);

    btnLimparCampos?.addEventListener('click', () => {
        if (inputShopeeId) inputShopeeId.value = '';
        setTimeout(atualizarHelper, 0);
    });

    helper.addEventListener('click', (event) => {
        const id = event.target.id;
        const link = extrairLink(inputLink.value);

        if (id === 'btn-open-shopee-link') {
            if (!link) return alert('Cole o link da Shopee primeiro.');
            window.open(link, '_blank');
        }

        if (id === 'btn-fast-shopee-msg') {
            if (!displayProduto.value || displayProduto.value === 'Buscando...' || displayProduto.value === 'Buscando na Shopee...' || /^[a-z0-9-]{4,20}$/i.test(displayProduto.value.trim())) {
                displayProduto.value = 'Oferta Shopee com desconto';
            }
            if (!displayPor?.value || displayPor.value === 'R$ 0,00') displayPor.value = '';
            if (displayDe?.value === 'R$ 0,00') displayDe.value = '';
            btnGerar?.click();
        }
    });
})();