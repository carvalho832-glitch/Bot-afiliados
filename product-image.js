(() => {
    const inputLink = document.getElementById('input-link');
    const btnPuxar = document.getElementById('btn-puxar');
    const displayProduto = document.getElementById('display-produto');

    if (!inputLink || !btnPuxar) return;

    window.__produtoImagemAtual = '';

    const preview = document.createElement('div');
    preview.id = 'product-image-preview';
    preview.style.cssText = 'display:none;margin-top:12px;padding:12px;border:1px solid var(--border);border-radius:14px;background:var(--card);box-shadow:var(--shadow);';
    preview.innerHTML = `
        <div style="font-size:13px;font-weight:800;color:var(--text);margin-bottom:8px;">🖼️ Foto detectada</div>
        <img id="product-image-preview-img" src="" alt="Foto do produto" style="width:100%;max-height:220px;object-fit:cover;border-radius:12px;border:1px solid var(--border);background:var(--input-bg);" referrerpolicy="no-referrer">
        <small style="display:block;margin-top:8px;color:var(--muted);font-weight:700;">A imagem será salva junto com o card, quando disponível.</small>`;

    btnPuxar.insertAdjacentElement('afterend', preview);
    const previewImg = document.getElementById('product-image-preview-img');

    function extrairLink(texto) {
        return texto.match(/https?:\/\/[^\s]+/)?.[0] || texto.trim();
    }

    function limparImagem() {
        window.__produtoImagemAtual = '';
        preview.style.display = 'none';
        previewImg.src = '';
    }

    function mostrarImagem(url) {
        if (!url) return limparImagem();
        window.__produtoImagemAtual = url;
        previewImg.src = url;
        preview.style.display = 'block';
    }

    async function buscarImagem(link) {
        if (!link) return '';

        try {
            const url = `https://api.microlink.io?url=${encodeURIComponent(link)}&screenshot=false&meta=true`;
            const resposta = await fetch(url);
            const json = await resposta.json();

            return json?.data?.image?.url || json?.data?.logo?.url || '';
        } catch (erro) {
            console.log('Não consegui buscar imagem do produto:', erro);
            return '';
        }
    }

    inputLink.addEventListener('input', () => {
        limparImagem();
    });

    btnPuxar.addEventListener('click', async () => {
        const link = extrairLink(inputLink.value);
        if (!link) return;

        limparImagem();

        setTimeout(async () => {
            const imagem = await buscarImagem(link);
            if (imagem) mostrarImagem(imagem);
        }, 600);
    });

    const observer = new MutationObserver(async () => {
        if (window.__produtoImagemAtual) return;
        if (!displayProduto || !displayProduto.value || displayProduto.value === 'Buscando...') return;

        const link = extrairLink(inputLink.value);
        if (!link) return;

        const imagem = await buscarImagem(link);
        if (imagem) mostrarImagem(imagem);
    });

    if (displayProduto) {
        observer.observe(displayProduto, {
            attributes: true,
            childList: true,
            subtree: true
        });
    }
})();
