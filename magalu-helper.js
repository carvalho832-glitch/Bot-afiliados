(() => {
    const API_URL = 'https://bot-afiliados-1fwi.onrender.com';
    const inputLink = document.getElementById('input-link');
    const btnPuxar = document.getElementById('btn-puxar');
    const btnLimparCampos = document.getElementById('btn-limpar-campos');
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

    const campoConsulta = document.createElement('div');
    campoConsulta.id = 'magalu-consulta-field';
    campoConsulta.style.cssText = 'display:none;margin-top:12px;padding:12px;border:1px solid rgba(45,212,191,.35);border-radius:14px;background:rgba(45,212,191,.06);';
    campoConsulta.innerHTML = `
        <label for="input-magalu-consulta">Link completo do produto Magalu <small style="font-weight:700;color:var(--muted);">(somente para consulta)</small></label>
        <input type="url" id="input-magalu-consulta" placeholder="Cole o link magazineluiza.com.br/.../p/..." autocomplete="off" autocapitalize="none" spellcheck="false">
        <small style="display:block;margin-top:7px;color:var(--muted);font-weight:700;line-height:1.45;">Seu OneLink de afiliado continuará na mensagem. Este endereço completo será usado apenas para buscar nome e preços.</small>`;
    inputLink.insertAdjacentElement('afterend', campoConsulta);

    const inputConsulta = document.getElementById('input-magalu-consulta');
    const shopeeField = document.getElementById('shopee-id-field');

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

    function isOneLink(texto = '') {
        return /magazineluiza\.onelink\.me/i.test(String(texto || ''));
    }

    function isLinkCompletoMagalu(texto = '') {
        try {
            const url = new URL(extrairLink(texto));
            return /(?:magazineluiza|magalu)\.com\.br$/i.test(url.hostname) && /\/p\//i.test(url.pathname);
        } catch {
            return false;
        }
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

    function atualizarCamposAuxiliares() {
        const link = extrairLink(inputLink.value);
        const magaluAtiva = isMagalu(link) || selectLoja?.value === 'Magalu';
        const precisaConsulta = magaluAtiva && isOneLink(link);

        campoConsulta.style.display = precisaConsulta ? 'block' : 'none';
        if (shopeeField) shopeeField.style.display = magaluAtiva ? 'none' : '';
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

    function iniciarProgresso(usandoConsulta) {
        limparTimers();
        atualizarProgresso(
            25,
            'ETAPA 1 DE 4',
            usandoConsulta ? 'Abrindo página do produto...' : 'Abrindo link da Magalu...',
            usandoConsulta ? 'o link de afiliado será preservado na mensagem' : 'resolvendo o endereço de afiliado sem alterar seu link'
        );
        timers.push(setTimeout(() => {
            atualizarProgresso(50, 'ETAPA 2 DE 4', 'Localizando o produto...', usandoConsulta ? 'validando a página pública da Magalu' : 'procurando a página oficial dentro do OneLink');
        }, 5000));
        timers.push(setTimeout(() => {
            atualizarProgresso(75, 'ETAPA 3 DE 4', 'Consultando a Magalu...', 'buscando nome, preço atual e preço anterior');
        }, 15000));
    }

    function setCarregando(ativo, usandoConsulta = false) {
        if (loader) loader.style.display = ativo ? 'flex' : 'none';
        btnPuxar.disabled = ativo;
        btnPuxar.innerText = ativo ? '🔄 Convertendo e puxando...' : '🔎 Puxar produto';
        if (ativo) iniciarProgresso(usandoConsulta);
        else limparTimers();
    }

    function selecionarMagalu() {
        if (!selectLoja) return;
        const opcao = Array.from(selectLoja.options).find(item => item.value === 'Magalu');
        if (opcao) selectLoja.value = 'Magalu';
    }

    inputLink.addEventListener('input', atualizarCamposAuxiliares);
    selectLoja?.addEventListener('change', atualizarCamposAuxiliares);
    btnLimparCampos?.addEventListener('click', () => {
        if (inputConsulta) inputConsulta.value = '';
        setTimeout(atualizarCamposAuxiliares, 0);
    });

    atualizarCamposAuxiliares();

    btnPuxar.addEventListener('click', async (event) => {
        const link = extrairLink(inputLink.value);
        if (!isMagalu(link)) return;

        event.preventDefault();
        event.stopImmediatePropagation();

        const linkConsulta = extrairLink(inputConsulta?.value || '');
        if (linkConsulta && !isLinkCompletoMagalu(linkConsulta)) {
            campoConsulta.style.display = 'block';
            inputConsulta?.focus();
            alert('O link de consulta precisa ser a página completa do produto na Magalu e conter /p/ no endereço.');
            return;
        }

        controller?.abort();
        controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120000);

        selecionarMagalu();
        atualizarCamposAuxiliares();
        displayProduto.value = 'Buscando na Magalu...';
        if (displayDe) displayDe.value = '';
        if (displayPor) displayPor.value = '';
        if (displayCupom) displayCupom.value = '';
        if (messageBox) messageBox.innerText = 'Aguardando geração...';
        window.__ultimaMensagemAchouLevou = '';
        setCarregando(true, Boolean(linkConsulta));

        try {
            const params = new URLSearchParams({ url: link, _agora: String(Date.now()) });
            if (linkConsulta) params.set('consulta', linkConsulta);

            const resposta = await fetch(`${API_URL}/magalu/produto?${params.toString()}`, {
                method: 'GET',
                headers: { Accept: 'application/json' },
                cache: 'no-store',
                signal: controller.signal
            });

            const dados = await resposta.json().catch(() => null);
            if (!resposta.ok || !dados?.ok) {
                const erro = new Error(dados?.detalhe || dados?.error || `A Magalu respondeu com HTTP ${resposta.status}.`);
                erro.precisaLinkConsulta = Boolean(dados?.precisaLinkConsulta);
                erro.orientacao = dados?.orientacao || '';
                throw erro;
            }

            const produto = limparTitulo(dados.produto);
            if (!produto || /partner_id|promoter_id|onelink|não é possível acessar|nao e possivel acessar/i.test(produto)) {
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
            } else if (dados.consultaAssistida) {
                alert('Dados puxados pelo link completo e OneLink de afiliado preservado! ✅');
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
                alert('A consulta da Magalu demorou mais de 120 segundos. Os links continuam nos campos para uma nova tentativa.');
            } else if (error?.precisaLinkConsulta) {
                campoConsulta.style.display = 'block';
                atualizarProgresso(100, 'AÇÃO NECESSÁRIA', 'Link completo necessário', 'o OneLink abre somente o aplicativo da Magalu');
                alert('Esse OneLink abre somente o aplicativo e não revela o produto ao servidor. Cole no novo campo o link completo da página do produto. Seu link de afiliado continuará sendo usado na mensagem.');
                setTimeout(() => inputConsulta?.focus(), 150);
            } else {
                atualizarProgresso(100, 'ERRO', 'Não consegui ler o produto', 'os links foram preservados para você tentar novamente');
                alert(`Não consegui puxar os dados da Magalu. Detalhe: ${error.message}`);
            }
            await new Promise(resolve => setTimeout(resolve, 500));
        } finally {
            clearTimeout(timeout);
            setCarregando(false);
        }
    }, true);
})();
