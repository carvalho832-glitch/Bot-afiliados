(() => {
    const STORAGE_OFERTAS = 'ofertas_achou_levou';
    const inputLink = document.getElementById('input-link');
    const btnSalvar = document.getElementById('btn-salvar');

    if (!inputLink || !btnSalvar) return;

    function extrairLink(texto) {
        return texto.match(/https?:\/\/[^\s]+/)?.[0] || texto.trim();
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

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function buscarImagem(link) {
        if (!link) return '';

        if (window.__produtoImagemAtual) return window.__produtoImagemAtual;

        try {
            const url = `https://api.microlink.io?url=${encodeURIComponent(link)}&screenshot=false&meta=true`;
            const resposta = await fetch(url);
            const json = await resposta.json();
            return json?.data?.image?.url || json?.data?.logo?.url || '';
        } catch (erro) {
            console.log('Imagem não encontrada para o card:', erro);
            return '';
        }
    }

    async function salvarImagemNoHistorico(link, imagem) {
        if (!imagem) return;

        const ofertas = getOfertas();
        if (!ofertas.length) return;

        const alvo = ofertas.find(oferta => {
            const mesmoLink = (oferta.link || '') === link || (oferta.texto || '').includes(link);
            return mesmoLink && !oferta.imagem;
        }) || ofertas[0];

        if (alvo && !alvo.imagem) {
            alvo.imagem = imagem;
            setOfertas(ofertas);
        }
    }

    btnSalvar.addEventListener('click', async () => {
        const link = extrairLink(inputLink.value);
        if (!link) return;

        await sleep(900);

        let imagem = window.__produtoImagemAtual || '';

        if (!imagem) {
            imagem = await buscarImagem(link);
            if (imagem) window.__produtoImagemAtual = imagem;
        }

        if (!imagem) return;

        await salvarImagemNoHistorico(link, imagem);
    });
})();
