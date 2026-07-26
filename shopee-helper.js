(() => {
    const API_URL = 'https://bot-afiliados-1fwi.onrender.com';

    const inputLink = document.getElementById('input-link');
    const btnPuxar = document.getElementById('btn-puxar');
    const displayProduto = document.getElementById('display-produto');
    const displayDe = document.getElementById('display-de');
    const displayPor = document.getElementById('display-por');
    const displayCupom = document.getElementById('display-cupom');
    const messageBox = document.getElementById('msg-preview');
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
        <small style="display:block;margin-top:6px;color:var(--muted);font-weight:700;line-height:1.4;">O link curto será preservado na mensagem. O link completo será usado somente na consulta interna.</small>`;
    inputLink.insertAdjacentElement('afterend', campoId);

    const inputShopeeId = document.getElementById('input-shopee-id');

    const helper = document.createElement('div');
    helper.id = 'shopee-helper-box';
    helper.style.cssText = 'display:none;margin:10px 0 0;padding:12px;border:1px solid var(--border);border-radius:14px;background:var(--input-bg);font-size:13px;line-height:1.45;color:var(--text);';
    helper.innerHTML = `
        <strong>🛒 Produto Shopee detectado</strong><br>
        O bot converterá o link curto, localizará os IDs e consultará a API oficial.
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;">
            <button id="btn-open-shopee-link" type="button" class="btn-secondary" style="margin:0;min-height:42px;padding:10px;font-size:12px;">Abrir produto</button>
            <button id="btn-fast-shopee-msg" type="button" class="btn-main soft" style="margin:0;min-height:42px;padding:10px;font-size:12px;">Mensagem rápida</button>
        </div>
        <small id="shopee-converter-status" style="display:block;margin-top:8px;color:var(--muted);font-weight:700;">Aguardando link para conversão automática.</small>`;

    btnPuxar.insertAdjacentElement('afterend', helper);
    const converterStatus = document.getElementById('shopee-converter-status');

    let resolvedUrl = '';
    let ultimaEntrada = '';
    let numeroConsulta = 0;
    let controleConsulta = null;

    window.__achouLevouOriginalShortUrl = '';
    window.__achouLevouResolvedUrl = '';
    window.__achouLevouRequestId = 0;

    function extrairLink(texto) {
        return String(texto || '').match(/https?:\/\/[^\s]+/)?.[0] || String(texto || '').trim();
    }

    function limparId(valor) {
        return String(valor || '').trim().toUpperCase().replace(/\s+/g, '');
    }

    function isShopee(texto) {
        const link = String(texto || '').toLowerCase();
        return link.includes('shopee') || link.includes('shp.ee') || link.includes('collshp.com');
    }

    function isLinkCurtoShopee(link) {
        return /s\.shopee\.com\.br|shp\.ee|collshp\.com/i.test(String(link || ''));
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

    function limparDadosProduto(status = '🔄 Buscando novo produto...') {
        displayProduto.value = '';
        if (displayDe) displayDe.value = '';
        if (displayPor) displayPor.value = '';
        if (displayCupom) displayCupom.value = '';
        if (messageBox) messageBox.innerText = 'Aguardando geração...';
        window.__ultimaMensagemAchouLevou = '';
        resolvedUrl = '';
        window.__achouLevouResolvedUrl = '';
        if (inputShopeeId) inputShopeeId.value = '';
        if (converterStatus) converterStatus.textContent = status;
    }

    function registrarLinkOriginal(link) {
        const original = extrairLink(link);
        window.__achouLevouOriginalShortUrl = isLinkCurtoShopee(original) ? original : '';
        return original;
    }

    function normalizarProdutoShopee(dados) {
        const produto = String(dados?.produto || '').trim();
        return produto && produto !== 'Buscando na Shopee...' ? produto : 'Oferta Shopee com desconto';
    }

    function preencherCampos(dados, idConsulta) {
        if (idConsulta !== numeroConsulta) return false;

        displayProduto.value = normalizarProdutoShopee(dados);
        if (displayDe) displayDe.value = dados.precoDe || '';
        if (displayPor) displayPor.value = dados.precoPor || '';
        if (displayCupom) displayCupom.value = dados.cupom || dados.desconto || '';

        resolvedUrl = dados?.linkCompleto || dados?.linkOferta || '';
        window.__achouLevouResolvedUrl = resolvedUrl;

        if (inputShopeeId && dados?.shopId && dados?.itemId) {
            inputShopeeId.value = `${dados.shopId}/${dados.itemId}`;
        }

        if (converterStatus) {
            converterStatus.textContent = resolvedUrl
                ? '✅ Link convertido e produto localizado. O link curto foi preservado para a mensagem.'
                : '✅ Produto localizado pela API oficial da Shopee.';
        }
        return true;
    }

    async function puxarShopeePelaApi(link, idProduto, signal) {
        const params = new URLSearchParams();
        if (link) params.set('url', link);
        else if (idProduto) params.set('id', idProduto);

        const resposta = await fetch(`${API_URL}/shopee/produto?${params.toString()}`, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            cache: 'no-store',
            signal
        });

        const json = await resposta.json().catch(() => null);
        if (!resposta.ok || !json?.ok) {
            throw new Error(json?.detalhe || json?.error || 'Não consegui puxar os dados da Shopee.');
        }
        return json;
    }

    inputLink.addEventListener('input', () => {
        const atual = extrairLink(inputLink.value);
        if (atual !== ultimaEntrada) {
            ultimaEntrada = atual;
            controleConsulta?.abort();
            numeroConsulta += 1;
            window.__achouLevouRequestId = numeroConsulta;
            registrarLinkOriginal(atual);
            limparDadosProduto(atual ? 'Novo link detectado. Dados anteriores foram limpos.' : 'Aguardando link para conversão automática.');
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

        const link = registrarLinkOriginal(inputLink.value);
        const idProduto = link ? '' : limparId(inputShopeeId?.value);
        if (!idProduto && !link) return alert('Cole o link da Shopee.');

        controleConsulta?.abort();
        controleConsulta = new AbortController();
        const idConsulta = ++numeroConsulta;
        window.__achouLevouRequestId = idConsulta;

        helper.style.display = 'block';
        limparDadosProduto('🔄 Buscando novo produto...');
        displayProduto.value = 'Buscando na Shopee...';
        setCarregando(true);

        const timeout = setTimeout(() => controleConsulta?.abort(), 45000);

        try {
            const dados = await puxarShopeePelaApi(link, idProduto, controleConsulta.signal);
            if (!preencherCampos(dados, idConsulta)) return;

            if (dados?.origem === 'shopee-fallback') {
                if (converterStatus) converterStatus.textContent = '⚠️ O link não pôde ser convertido automaticamente.';
                alert(`Não consegui converter esse link curto da Shopee.\n\nMotivo: ${dados.aviso || 'motivo não informado'}`);
            } else {
                alert('Link convertido e dados da Shopee puxados! ✅');
            }
        } catch (erro) {
            if (idConsulta !== numeroConsulta) return;
            if (erro?.name === 'AbortError') {
                if (converterStatus) converterStatus.textContent = '⚠️ Consulta cancelada ou tempo limite atingido.';
                alert('A consulta foi cancelada ou demorou mais de 45 segundos. Tente novamente.');
            } else {
                console.error('Erro Shopee API:', erro);
                if (converterStatus) converterStatus.textContent = '⚠️ Falha ao converter o link.';
                alert(`Não consegui converter e puxar esse produto. Detalhe: ${erro.message}`);
            }
            displayProduto.value = '';
        } finally {
            clearTimeout(timeout);
            if (idConsulta === numeroConsulta) setCarregando(false);
        }
    }, true);

    btnLimparCampos?.addEventListener('click', () => {
        controleConsulta?.abort();
        numeroConsulta += 1;
        ultimaEntrada = '';
        window.__achouLevouRequestId = numeroConsulta;
        window.__achouLevouOriginalShortUrl = '';
        limparDadosProduto('Aguardando link para conversão automática.');
        setTimeout(atualizarHelper, 0);
    });

    helper.addEventListener('click', (event) => {
        const id = event.target.id;
        const linkOriginal = window.__achouLevouOriginalShortUrl || extrairLink(inputLink.value);

        if (id === 'btn-open-shopee-link') {
            const destino = resolvedUrl || window.__achouLevouResolvedUrl || linkOriginal;
            if (!destino) return alert('Cole o link da Shopee primeiro.');
            window.open(destino, '_blank');
        }

        if (id === 'btn-fast-shopee-msg') {
            if (!displayProduto.value || displayProduto.value === 'Buscando na Shopee...') {
                return alert('Aguarde o produto terminar de carregar.');
            }
            btnGerar?.click();
        }
    });
})();