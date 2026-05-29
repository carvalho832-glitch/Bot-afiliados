(() => {
    const inputLink = document.getElementById('input-link');
    const btnPuxar = document.getElementById('btn-puxar');
    const displayProduto = document.getElementById('display-produto');
    const displayDe = document.getElementById('display-de');
    const displayPor = document.getElementById('display-por');
    const displayCupom = document.getElementById('display-cupom');
    const btnGerar = document.getElementById('btn-gerar');

    if (!inputLink || !btnPuxar || !displayProduto) return;

    const puxarOriginal = btnPuxar.onclick;

    displayProduto.removeAttribute('readonly');
    displayProduto.placeholder = 'Digite ou edite o nome do produto aqui';

    const helper = document.createElement('div');
    helper.id = 'shopee-helper-box';
    helper.style.cssText = 'display:none;margin:10px 0 0;padding:12px;border:1px solid var(--border);border-radius:14px;background:var(--card);box-shadow:var(--shadow);font-size:13px;line-height:1.45;color:var(--text);';
    helper.innerHTML = `
        <strong>🛒 Modo Shopee ativado</strong><br>
        A Shopee pode bloquear a captura automática. Abra o produto, confira os dados e preencha aqui.
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;">
            <button id="btn-open-shopee-link" type="button" style="margin:0;padding:11px;border-radius:10px;background:#f97316;color:#fff;font-size:12px;font-weight:800;">🔗 Abrir produto</button>
            <button id="btn-fast-shopee-msg" type="button" style="margin:0;padding:11px;border-radius:10px;background:#16a34a;color:#fff;font-size:12px;font-weight:800;">⚡ Mensagem rápida</button>
        </div>
        <small style="display:block;margin-top:8px;color:var(--muted);font-weight:700;">Dica: se não lembrar o preço, deixe vazio. A mensagem sai como “Confira no site”.</small>`;

    btnPuxar.insertAdjacentElement('afterend', helper);

    function extrairLink(texto) {
        return texto.match(/https?:\/\/[^\s]+/)?.[0] || texto.trim();
    }

    function isShopee(texto) {
        const link = (texto || '').toLowerCase();
        return link.includes('shopee') || link.includes('shp.ee') || link.includes('collshp.com') || link.includes('s.shopee.com.br');
    }

    function mostrarHelper() {
        helper.style.display = 'block';
    }

    inputLink.addEventListener('input', () => {
        helper.style.display = isShopee(inputLink.value) ? 'block' : 'none';
    });

    helper.addEventListener('click', (event) => {
        const id = event.target.id;
        const link = extrairLink(inputLink.value);

        if (id === 'btn-open-shopee-link') {
            if (!link) return alert('Cole o link da Shopee primeiro.');
            window.open(link, '_blank');
        }

        if (id === 'btn-fast-shopee-msg') {
            if (!displayProduto.value || displayProduto.value === 'Buscando...') {
                displayProduto.value = 'Oferta Shopee com desconto';
            }

            if (!displayPor.value || displayPor.value === 'R$ 0,00') displayPor.value = '';
            if (displayDe.value === 'R$ 0,00') displayDe.value = '';

            btnGerar?.click();
        }
    });

    btnPuxar.onclick = async () => {
        const conteudo = inputLink.value.trim();
        if (!conteudo) return alert('Cole o link!');

        if (isShopee(conteudo)) {
            mostrarHelper();
            displayProduto.value = displayProduto.value && displayProduto.value !== 'Buscando...' ? displayProduto.value : 'Oferta Shopee com desconto';
            displayDe.value = '';
            displayPor.value = '';
            displayCupom.value = displayCupom.value || '';
            alert('Link Shopee detectado. Deixei os campos prontos para edição manual.');
            return;
        }

        if (typeof puxarOriginal === 'function') return puxarOriginal.call(btnPuxar);
    };
})();
