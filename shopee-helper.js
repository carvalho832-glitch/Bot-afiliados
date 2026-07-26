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
        <label for="input-shopee-id">ID do produto Shopee <small style="font-weight:700;color:var(--muted);">(opcional)</small></label>
        <input type="text" id="input-shopee-id" placeholder="Use somente se tiver shopId e itemId" autocomplete="off" autocapitalize="characters">
        <small style="display:block;margin-top:6px;color:var(--muted);font-weight:700;line-height:1.4;">Normalmente basta colar o link curto da Shopee acima. O Render tentará convertê-lo automaticamente.</small>`;
    inputLink.insertAdjacentElement('afterend', campoId);

    const inputShopeeId = document.getElementById('input-shopee-id');

    const helper = document.createElement('div');
    helper.id = 'shopee-helper-box';
    helper.style.cssText = 'display:none;margin:10px 0 0;padding:12px;border:1px solid var(--border);border-radius:14px;background:var(--input-bg);font-size:13px;line-height:1.45;color:var(--text);';
    helper.innerHTML = `
        <strong>🛒 Produto Shopee detectado</strong><br>
        O bot converterá o link curto em link completo, localizará os IDs e consultará a API oficial.
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;">
            <button id="btn-open-shopee-link" type="button" class="btn-secondary" style="margin:0;min-height:42px;padding:10px;font-size:12px;">Abrir produto</button>
            <button id="btn-fast-shopee-msg" type="button" class="btn-main soft" style="margin:0;min-height:42px;padding:10px;font-size:12px;">Mensagem rápida</button>
        </div>
        <small id="shopee-converter-status" style="display:block;margin-top:8px;color:var(--muted);font-weight:700;">Aguardando link para conversão automática.</small>`;

    btnPuxar.insertAdjacentElement('afterend', helper);
    const converterStatus = document.getElementById('shopee-converter-status');
    let linkPreenchidoAutomaticamente = '';

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
        btnPuxar.innerText = ativo ? '🔄 Convertendo e puxando...' : '🔎 Puxar produto';
        if (converterStatus && ativo) converterStatus.textContent = 'Convertendo o link curto e consultando a Shopee...';
    }

    function normalizarProdutoShopee(dados) {
        const produto = String(dados?.produto || '').trim();
        if (!produto || produto === 'Buscando na Shopee...') return 'Oferta Shopee com desconto';
        return produto;
    }

    function preencherCampos(dados) {
        displayProduto.value = normalizarProdutoShopee(dados);
        if (displayDe) displayDe.value = dados.precoDe || '';
        if (displayPor) displayPor.value = dados.precoPor || '';
        if (displayCupom) displayCupom.value = dados.cupom || dados.desconto || '';

        if (dados?.linkCompleto) {
            linkPreenchidoAutomaticamente = dados.linkCompleto;
            inputLink.value = dados.linkCompleto;
        }

        if (inputShopeeId && dados?.shopId && dados?.itemId) {
            inputShopeeId.value = `${dados.shopId}/${dados.itemId}`;
        }

        if (converterStatus) {
            converterStatus.textContent = dados?.linkCompleto
                ? '✅ Link convertido e produto localizado.'
                : 'Produto localizado pela API oficial da Shopee.';
        }
    }

    async function puxarShopeePelaApi(link, idProduto) {
        const params = new URLSearchParams();
        if (link) {
            params.set('url', link);
        } else if (idProduto) {
            params.set('id', idProduto);
        }

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

    inputLink.addEventListener('input', () => {
        const linkAtual = extrairLink(inputLink.value);
        if (inputShopeeId && linkAtual && linkAtual !== linkPreenchidoAutomaticamente) {
            inputShopeeId.value = '';
            linkPreenchidoAutomaticamente = '';
            if (converterStatus) converterStatus.textContent = 'Novo link detectado. O ID anterior foi limpo.';
        }
        atualizarHelper();
    });

    inputShopeeId?.addEventListener('input', () => {
        inputShopeeId.value = limparId(inputShopeeId.value);
        atualizarHelper();
    });

    btnPuxar.addEventListener('click', async (event) => {
        if (!deveUsarShopee()) return;

        event.preventDefault();
        event.stopImmediatePropagation();

        const link = extrairLink(inputLink.value);
        const idProduto = link ? '' : limparId(inputShopeeId?.value);

        if (!idProduto && !link) return alert('Cole o link da Shopee.');

        helper.style.display = 'block';
        setCarregando(true);
        displayProduto.value = 'Buscando na Shopee...';
        if (displayDe) displayDe.value = '';
        if (displayPor) displayPor.value = '';
        if (displayCupom) displayCupom.value = '';

        try {
            const dados = await puxarShopeePelaApi(link, idProduto);
            preencherCampos(dados);

            if (dados?.origem === 'shopee-fallback') {
                if (converterStatus) converterStatus.textContent = '⚠️ O link não pôde ser convertido automaticamente.';
                alert(`Não consegui converter esse link curto da Shopee.\n\nMotivo: ${dados.aviso || 'motivo não informado'}\n\nVocê ainda pode abrir o produto no navegador e copiar o link completo.`);
            } else {
                alert('Link convertido e dados da Shopee puxados! ✅');
            }
        } catch (erro) {
            console.error('Erro Shopee API:', erro);
            displayProduto.value = displayProduto.value === 'Buscando na Shopee...' ? 'Oferta Shopee com desconto' : displayProduto.value;
            if (converterStatus) converterStatus.textContent = '⚠️ Falha ao converter o link.';
            alert(`Não consegui converter e puxar esse produto. Detalhe: ${erro.message}`);
        } finally {
            setCarregando(false);
        }
    }, true);

    btnLimparCampos?.addEventListener('click', () => {
        if (inputShopeeId) inputShopeeId.value = '';
        linkPreenchidoAutomaticamente = '';
        if (converterStatus) converterStatus.textContent = 'Aguardando link para conversão automática.';
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
            if (!displayProduto.value || displayProduto.value === 'Buscando...' || displayProduto.value === 'Buscando na Shopee...') {
                displayProduto.value = 'Oferta Shopee com desconto';
            }
            if (!displayPor?.value || displayPor.value === 'R$ 0,00') displayPor.value = '';
            if (displayDe?.value === 'R$ 0,00') displayDe.value = '';
            btnGerar?.click();
        }
    });
})();