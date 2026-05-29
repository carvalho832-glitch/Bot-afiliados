(() => {
    const btnPuxar = document.getElementById('btn-puxar');
    const loader = document.getElementById('loader-global');
    const inputLink = document.getElementById('input-link');
    const displayProduto = document.getElementById('display-produto');
    const displayDe = document.getElementById('display-de');
    const displayPor = document.getElementById('display-por');
    const progressTrack = document.getElementById('loader-progress-track');
    const progressBar = document.getElementById('loader-progress-bar');
    const progressText = document.getElementById('loader-progress-text');
    const progressPhase = document.getElementById('loader-progress-phase');
    const loaderTitle = document.getElementById('loader-title');
    const loaderSubtitle = document.getElementById('loader-subtitle');

    if (!btnPuxar || !progressBar) return;

    let timer = null;
    let progresso = 0;

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function setProgress(valor, fase, titulo, subtitulo) {
        progresso = Math.max(0, Math.min(100, Math.round(valor)));
        progressBar.style.width = `${progresso}%`;
        progressText.innerText = `${progresso}%`;
        progressTrack?.setAttribute('aria-valuenow', String(progresso));

        if (fase) progressPhase.innerText = fase;
        if (titulo) loaderTitle.innerText = titulo;
        if (subtitulo) loaderSubtitle.innerText = subtitulo;
    }

    function iniciarLoader() {
        clearInterval(timer);
        progresso = 0;
        loader.style.display = 'flex';
        setProgress(3, 'iniciando', 'Preparando busca...', 'validando o link informado');

        timer = setInterval(() => {
            if (progresso < 82) {
                const salto = progresso < 35 ? 4 : progresso < 62 ? 2 : 1;
                setProgress(progresso + salto, 'recebendo dados', 'Baixando informações...', 'aguardando resposta da central de ofertas');
            }
        }, 420);
    }

    function fecharLoader() {
        clearInterval(timer);
        timer = null;
        setTimeout(() => {
            loader.style.display = 'none';
        }, 360);
    }

    async function fetchComProgresso(url) {
        setProgress(22, 'conectando', 'Conectando...', 'abrindo canal com a API');
        const resposta = await fetch(url);
        const total = Number(resposta.headers.get('content-length'));

        if (!resposta.body || !total) {
            setProgress(Math.max(progresso, 58), 'processando', 'Recebendo pacote...', 'servidor não informou o tamanho, usando etapas');
            const json = await resposta.json();
            setProgress(86, 'processando', 'Processando dados...', 'separando nome, preço e desconto');
            return json;
        }

        const reader = resposta.body.getReader();
        const chunks = [];
        let recebido = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            recebido += value.length;
            const real = Math.round((recebido / total) * 100);
            setProgress(24 + Math.round(real * 0.58), 'baixando dados', 'Baixando informações...', `${real}% do pacote recebido`);
        }

        const texto = await new Blob(chunks).text();
        setProgress(88, 'processando', 'Processando dados...', 'organizando resposta da API');
        return JSON.parse(texto);
    }

    btnPuxar.onclick = async () => {
        const conteudo = inputLink.value.trim();
        if (!conteudo) return alert('Cole o link!');

        iniciarLoader();
        displayDe.value = 'R$ 0,00';
        displayPor.value = 'R$ 0,00';
        displayProduto.value = 'Buscando...';

        try {
            const urlMatch = conteudo.match(/https?:\/\/[^\s]+/);
            if (!urlMatch) {
                displayProduto.value = '';
                setProgress(100, 'erro', 'Link inválido', 'não encontrei um link válido');
                await sleep(500);
                return alert('Não encontrei um link válido.');
            }

            setProgress(14, 'validando', 'Validando link...', 'preparando robô garimpeiro');
            const urlAlvo = urlMatch[0];
            const query = `https://api.microlink.io?url=${encodeURIComponent(urlAlvo)}&data.amz_por_r.selector=.a-price-whole&data.amz_por_c.selector=.a-price-fraction&data.amz_de.selector=.basisPrice .a-offscreen,.a-text-strike&data.ml_de_r.selector=.andes-money-amount--previous .andes-money-amount__fraction&data.ml_de_c.selector=.andes-money-amount--previous .andes-money-amount__cents&data.ml_por_r.selector=.andes-money-amount--cents-superscript .andes-money-amount__fraction,.ui-pdp-price--size-large .andes-money-amount__fraction&data.ml_por_c.selector=.andes-money-amount--cents-superscript .andes-money-amount__cents,.ui-pdp-price--size-large .andes-money-amount__cents&prerender=true`;

            const json = await fetchComProgresso(query);

            if (json.data) {
                setProgress(90, 'lendo dados', 'Lendo produto...', 'extraindo nome e valores');

                displayProduto.value = (json.data.title || '')
                    .replace(/Amazon\.com\.br\s?:?\s?/gi, '')
                    .replace(/\|\s?Mercado\s?Livre/gi, '')
                    .replace(/- Mercado Livre/gi, '')
                    .replace(/\|\s?Shopee Brasil/gi, '')
                    .trim() || 'Produto encontrado';

                let vPor = 'R$ 0,00';
                let vDe = 'R$ 0,00';

                if (json.data.amz_por_r) {
                    const rNum = parseInt(json.data.amz_por_r.toString().replace(/\D/g, ''));
                    const c = json.data.amz_por_c ? json.data.amz_por_c.toString().replace(/\D/g, '') : '00';
                    vPor = 'R$ ' + rNum.toLocaleString('pt-BR') + ',' + c;

                    if (json.data.amz_de) {
                        const pDeStr = json.data.amz_de.toString();
                        const pDeNum = parseFloat(pDeStr.match(/[\d,.]+/)?.[0].replace(/\./g, '').replace(',', '.') || 0);
                        vDe = 'R$ ' + pDeNum.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                    }
                } else if (json.data.ml_por_r || json.data.ml_de_r) {
                    if (json.data.ml_por_r) {
                        const rNum = parseInt(json.data.ml_por_r.toString().replace(/\D/g, ''));
                        const c = json.data.ml_por_c ? json.data.ml_por_c.toString().replace(/\D/g, '') : '00';
                        vPor = 'R$ ' + rNum.toLocaleString('pt-BR') + ',' + c;
                    }
                    if (json.data.ml_de_r) {
                        const rNum = parseInt(json.data.ml_de_r.toString().replace(/\D/g, ''));
                        const c = json.data.ml_de_c ? json.data.ml_de_c.toString().replace(/\D/g, '') : '00';
                        vDe = 'R$ ' + rNum.toLocaleString('pt-BR') + ',' + c;
                    }
                }

                if (vPor === 'R$ 0,00' && json.data.price) {
                    vPor = 'R$ ' + Number(json.data.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                }

                displayPor.value = vPor;
                displayDe.value = vDe;
                setProgress(100, 'concluído', 'Oferta encontrada!', 'dados capturados com sucesso');
                await sleep(450);
            } else {
                setProgress(100, 'sem dados', 'Busca concluída', 'preencha os campos manualmente se precisar');
                await sleep(600);
            }
        } catch (erro) {
            console.log('Erro no processamento:', erro);
            setProgress(100, 'erro', 'Falha na captura', 'preencha produto e preço manualmente');
            await sleep(600);
            alert('Não consegui puxar tudo automático. Você pode preencher produto e preço manualmente.');
        } finally {
            fecharLoader();
        }
    };
})();
