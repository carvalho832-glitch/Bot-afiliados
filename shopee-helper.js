(() => {
    const inputLink = document.getElementById('input-link');
    const btnPuxar = document.getElementById('btn-puxar');
    const displayProduto = document.getElementById('display-produto');
    const displayDe = document.getElementById('display-de');
    const displayPor = document.getElementById('display-por');
    const displayCupom = document.getElementById('display-cupom');
    const btnGerar = document.getElementById('btn-gerar');

    if (!inputLink || !btnPuxar || !displayProduto) return;

    displayProduto.removeAttribute('readonly');
    displayProduto.placeholder = 'Digite ou edite o nome do produto aqui';

    const helper = document.createElement('div');
    helper.id = 'shopee-helper-box';
    helper.style.cssText = 'display:none;margin:10px 0 0;padding:12px;border:1px solid var(--border);border-radius:14px;background:var(--input-bg);font-size:13px;line-height:1.45;color:var(--text);';
    helper.innerHTML = `
        <strong>🛒 Link Shopee detectado</strong><br>
        A Shopee pode bloquear a captura automática. Abra o produto, confira os dados e preencha se precisar.
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;">
            <button id="btn-open-shopee-link" type="button" class="btn-secondary" style="margin:0;min-height:42px;padding:10px;font-size:12px;">Abrir produto</button>
            <button id="btn-fast-shopee-msg" type="button" class="btn-main soft" style="margin:0;min-height:42px;padding:10px;font-size:12px;">Mensagem rápida</button>
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

})();