(() => {
    const API_URL = 'https://bot-afiliados-1fwi.onrender.com';
    const inputLink = document.getElementById('input-link');
    const btnPuxar = document.getElementById('btn-puxar');
    const selectLoja = document.getElementById('select-loja');
    const displayProduto = document.getElementById('display-produto');
    const displayDe = document.getElementById('display-de');
    const displayPor = document.getElementById('display-por');
    const displayCupom = document.getElementById('display-cupom');
    const messageBox = document.getElementById('msg-preview');
    const loader = document.getElementById('loader-global');
    const progressTrack = document.getElementById('loader-progress-track');
    const progressBar = document.getElementById('loader-progress-bar');
    const progressText = document.getElementById('loader-progress-text');
    const progressPhase = document.getElementById('loader-progress-phase');
    const loaderTitle = document.getElementById('loader-title');
    const loaderSubtitle = document.getElementById('loader-subtitle');

    if (!inputLink || !btnPuxar || !displayProduto) return;

    let controller = null;
    let timers = [];

    function extrairLink(texto = '') {
        return String(texto || '').match(/https?:\/\/[^\s]+/)?.[0]?.replace(/[),.;]+$/, '') || String(texto || '').trim();
    }

    function isMagalu(texto = '') {
        const link = String(texto || '').toLowerCase();
        return link.includes('magazineluiza.onelink.me') ||
            link.includes('magazineluiza.com.br') ||
            link.includes('magalu.com.br');
    }

    function limparTitulo(valor = '') {
        return String(valor || '')
            .replace(/\s+/g, ' ')
            .replace(/\s*[|–-]\s*Magazine Luiza.*$/i, '')
            .replace(/\s*[|–-]\s*Magalu.*$/i, '')
            .replace(/^Magazine Luiza\s*[|:–-]?\s*/i, '')
            .replace(/^Magalu\s*[|:–-]?\s*/i, '')
            .trim();
    }

    function atualizarProgresso(valor, fase, titulo, subtitulo) {
        const percentual = Math.max(0, Math.min(100, Math.round(valor)));
        if (progressBar) progressBar.style.width = `${percentual}%`;
        if (progressText) progressText.textContent = `${percentual}%`;
        if (progressPhase) progressPhase.textContent = fase;
        if (loaderTitle) loaderTitle.textContent = titulo;
        if (loaderSubtitle) loaderSubtitle.textContent = subtitulo;
        progressTrack?.setAttribute('aria-valuenow', String(percentual));
        loader?.setAttribute('data-progress-stage', String(Math.ceil(percentual / 25)));
    }

    function limparTimers() {
        timers.forEach(clearTimeout);
        timers = [];
    }

    function iniciarProgresso() {
        limparTimers();
        atualizarProgresso(25, 'ETAPA 1 DE 4', 'Abrindo link da Magalu...', 'resolvendo o endereço de afiliado sem alterar seu link');
        timers.push(setTimeout(() => {
            atualizarProgresso(50, 'ETAPA 2 DE 4', 'Localizando o produto...', 'procurando a página oficial dentro do OneLink');
        }, 5000));
        timers.push(setTimeout(() => {
            atualizarProgresso(75, 'ETAPA 3 DE 4', 'Consultando a Magalu...', 'buscando nome, preço atual e preço anterior');
        }, 15000));
    }

    function setCarregando(ativo) {
        if (loader) loader.style.display = ativo ? 'flex' : 'none';
        btnPuxar.disabled = ativo;
        btnPuxar.innerText = ativo ? '🔄 Convertendo e puxando...' : '🔎 Puxar produto';
        if (ativo) iniciarProgresso();
        else limparTimers();
    }

    function selecionarMagalu() {
        if (!selectLoja) return;
        const opcao = Array.from(selectLoja.options).find(item => item.value === 'Magalu');
        if (opcao) selectLoja.value = 'Magalu';
    }

    btnPuxar.addEventListener('click', async (event) => {
        const link = extrairLink(inputLink.value);
        if (!isMagalu(link)) return;

        event.preventDefault();
        event.stopImmediatePropagation();

        controller?.abort();
        controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120000);

        selecionarMagalu();
        displayProduto.value = 'Buscando na Magalu...';
        if (displayDe) displayDe.value = '';
        if (displayPor) displayPor.value = '';
        if (displayCupom) displayCupom.value = '';
        if (messageBox) messageBox.innerText = 'Aguardando geração...';
        window.__ultimaMensagemAchouLevou = '';
        setCarregando(true);

        try {
            const resposta = await fetch(`${API_URL}/magalu/produto?url=${encodeURIComponent(link)}&_agora=${Date.now()}`, {
                method: 'GET',
                headers: { Accept: 'application/json' },
                cache: 'no-store',
                signal: controller.signal
            });

            const dados = await resposta.json().catch(() => null);
            if (!resposta.ok || !dados?.ok) {
                throw new Error(dados?.detalhe || dados?.error || `A Magalu respondeu com HTTP ${resposta.status}.`);
            }

            const produto = limparTitulo(dados.produto);
            if (!produto || /partner_id|promoter_id|onelink/i.test(produto)) {
                throw new Error('A página abriu, mas não retornou um nome de produto válido.');
            }

            displayProduto.value = produto;
            if (displayDe) displayDe.value = dados.precoDe || '';
            if (displayPor) displayPor.value = dados.precoPor || '';
            if (displayCupom) displayCupom.value = dados.cupom || dados.desconto || '';

            atualizarProgresso(100, 'ETAPA 4 DE 4', 'Produto Magalu encontrado!', 'os dados estão prontos e seu link de afiliado foi preservado');
            await new Promise(resolve => setTimeout(resolve, 650));

            if (!dados.precoPor) {
                alert(`Produto localizado na Magalu, mas o preço não apareceu para o servidor. O nome foi preenchido e você pode informar o preço manualmente.\n\n${dados.aviso || ''}`.trim());
            } else {
                alert('Link da Magalu convertido e dados puxados! ✅');
            }
        } catch (error) {
            console.error('Erro Magalu:', error);
            displayProduto.value = '';
            if (displayDe) displayDe.value = '';
            if (displayPor) displayPor.value = '';

            if (error?.name === 'AbortError') {
                atualizarProgresso(100, 'TEMPO LIMITE', 'Consulta interrompida', 'a Magalu demorou mais de 120 segundos para responder');
                alert('A consulta da Magalu demorou mais de 120 segundos. O link continua no campo para uma nova tentativa.');
            } else {
                atualizarProgresso(100, 'ERRO', 'Não consegui ler o produto', 'o link foi preservado para você tentar novamente');
                alert(`Não consegui puxar os dados da Magalu. Detalhe: ${error.message}`);
            }
            await new Promise(resolve => setTimeout(resolve, 500));
        } finally {
            clearTimeout(timeout);
            setCarregando(false);
        }
    }, true);
})();
