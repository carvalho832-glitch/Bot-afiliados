(() => {
    const API_URL = 'https://bot-afiliados-1fwi.onrender.com';

    const inputLink = document.getElementById('input-link');
    const btnPuxar = document.getElementById('btn-puxar');
    const displayProduto = document.getElementById('display-produto');
    const displayDe = document.getElementById('display-de');
    const displayPor = document.getElementById('display-por');
    const displayCupom = document.getElementById('display-cupom');
    const btnGerar = document.getElementById('btn-gerar');
    const loader = document.getElementById('loader-global');

    if (!inputLink || !btnPuxar || !displayProduto) return;

    displayProduto.removeAttribute('readonly');
    displayProduto.placeholder = 'Digite ou edite o nome do produto aqui';

    const helper = document.createElement('div');
    helper.id = 'shopee-helper-box';
    helper.style.cssText = 'display:none;margin:10px 0 0;padding:12px;border:1px solid var(--border);border-radius:14px;background:var(--input-bg);font-size:13px;line-height:1.45;color:var(--text);';
    helper.innerHTML = `
        <strong>🛒 Link Shopee detectado</strong><br>
        Agora o bot tenta puxar os dados pela API segura no Render. Se algum dado vier incompleto, você pode editar antes de gerar a mensagem.
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;">
            <button id="btn-open-shopee-link" type="button" class="btn-secondary" style="margin:0;min-height:42px;padding:10px;font-size:12px;">Abrir produto</button>
            <button id="btn-fast-shopee-msg" type="button" class="btn-main soft" style="margin:0;min-height:42px;padding:10px;font-size:12px;">Mensagem rápida</button>
        </div>
        <small style="display:block;margin-top:8px;color:var(--muted);font-weight:700;">Dica: se a Shopee não retornar preço, deixe como “Confira no site”.</small>`;

    btnPuxar.insertAdjacentElement('afterend', helper);

    function extrairLink(texto) {
        return String(texto || '').match(/https?:\/\/[^\s]+/)?.[0] || String(texto || '').trim();
    }

    function isShopee(texto) {
        const link = (texto || '').toLowerCase();
        return link.includes('shopee') || link.includes('shp.ee') || link.includes('collshp.com') || link.includes('s.shopee.com.br');
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
        const umaPalavraCurta = /^[a-z0-9]{4,12}$/i.test(nome);
        const pareceTextoReal = /[áéíóúâêôãõç\s\-]/i.test(nome) || nome.length > 12;

        return origemFallback && semPreco && umaPalavraCurta && !pareceTextoReal;
    }

    function normalizarProdutoShopee(dados) {
        if (nomePareceCodigoCurtoShopee(dados)) {
            return 'Oferta Shopee com desconto';
        }

        const produto = String(dados?.produto || '').trim();
        if (!produto || produto === 'Buscando na Shopee...') return 'Oferta Shopee com desconto';

        return produto;
    }

    function preencherCampos(dados) {
        displayProduto.value = normalizarProdutoShopee(dados);
        if (displayDe) displayDe.value = dados.precoDe || '';
        if (displayPor) displayPor.value = dados.precoPor || '';
        if (displayCupom) displayCupom.value = dados.cupom || dados.desconto || displayCupom.value || '';

        if (dados?.aviso && dados?.origem === 'shopee-fallback') {
            console.warn('Shopee fallback:', dados.aviso);
        }
    }

    async function puxarShopeePelaApi(link) {
        const resposta = await fetch(`${API_URL}/shopee/produto?url=${encodeURIComponent(link)}`, {
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
        helper.style.display = isShopee(inputLink.value) ? 'block' : 'none';
    });

    // Captura o clique antes do script principal para impedir o modo manual antigo da Shopee.
    btnPuxar.addEventListener('click', async (event) => {
        const link = extrairLink(inputLink.value);

        if (!isShopee(link)) return;

        event.preventDefault();
        event.stopImmediatePropagation();

        if (!link) return alert('Cole o link da Shopee primeiro.');

        helper.style.display = 'block';
        setCarregando(true);
        displayProduto.value = 'Buscando na Shopee...';
        if (displayDe) displayDe.value = '';
        if (displayPor) displayPor.value = '';

        try {
            const dados = await puxarShopeePelaApi(link);
            preencherCampos(dados);

            if (dados?.origem === 'shopee-fallback') {
                alert(`A Shopee não retornou os dados automáticos.\n\nMotivo: ${dados.aviso || 'motivo não informado'}\n\nEnvie esse aviso para ajustarmos o sistema.`);
            } else {
                alert('Dados da Shopee processados! ✅');
            }
        } catch (erro) {
            console.error('Erro Shopee API:', erro);
            displayProduto.value = displayProduto.value === 'Buscando na Shopee...' ? 'Oferta Shopee com desconto' : displayProduto.value;
            alert(`Não consegui puxar automático pela Shopee ainda. Detalhe: ${erro.message}\n\nVocê pode preencher manualmente por enquanto.`);
        } finally {
            setCarregando(false);
        }
    }, true);

    helper.addEventListener('click', (event) => {
        const id = event.target.id;
        const link = extrairLink(inputLink.value);

        if (id === 'btn-open-shopee-link') {
            if (!link) return alert('Cole o link da Shopee primeiro.');
            window.open(link, '_blank');
        }

        if (id === 'btn-fast-shopee-msg') {
            if (!displayProduto.value || displayProduto.value === 'Buscando...' || displayProduto.value === 'Buscando na Shopee...' || /^[a-z0-9]{4,12}$/i.test(displayProduto.value.trim())) {
                displayProduto.value = 'Oferta Shopee com desconto';
            }

            if (!displayPor?.value || displayPor.value === 'R$ 0,00') displayPor.value = '';
            if (displayDe?.value === 'R$ 0,00') displayDe.value = '';

            btnGerar?.click();
        }
    });
})();