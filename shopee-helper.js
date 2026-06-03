(() => {
    const API = 'https://radar-ia-mjux.onrender.com';
    const input = document.getElementById('input-link');
    const botao = document.getElementById('btn-puxar');
    const loja = document.getElementById('select-loja');
    const nome = document.getElementById('display-produto');
    const de = document.getElementById('display-de');
    const por = document.getElementById('display-por');
    const cupom = document.getElementById('display-cupom');
    const gerar = document.getElementById('btn-gerar');
    const loader = document.getElementById('loader-global');

    if (!input || !botao || !nome || !por) return;

    input.placeholder = 'Cole o link ou digite o produto. Ex: celular samsung';
    nome.removeAttribute('readonly');

    const box = document.createElement('div');
    box.id = 'shopee-helper-box';
    box.className = 'radar-shopee-box';
    box.style.display = 'none';
    box.innerHTML = '<div class="radar-shopee-head"><strong>Radar Shopee</strong><button id="radar-fechar" type="button">x</button></div><div id="radar-status" class="radar-shopee-status"></div><div id="radar-lista" class="radar-shopee-lista"></div>';
    botao.insertAdjacentElement('afterend', box);

    const status = document.getElementById('radar-status');
    const lista = document.getElementById('radar-lista');
    document.getElementById('radar-fechar')?.addEventListener('click', () => {
        box.style.display = 'none';
        lista.innerHTML = '';
    });

    input.addEventListener('input', () => {
        const texto = input.value.trim();
        if (texto.length >= 3 && !texto.startsWith('http')) {
            box.style.display = 'block';
            status.textContent = 'Toque em Puxar produto para garimpar na Shopee.';
        }
    });

    botao.addEventListener('click', async (ev) => {
        const texto = input.value.trim();
        if (!texto) return;
        const ehUrl = texto.startsWith('http');
        const ehShopee = texto.toLowerCase().includes('shopee') || texto.toLowerCase().includes('shp.ee');
        if (ehUrl && !ehShopee) return;
        ev.preventDefault();
        ev.stopImmediatePropagation();
        if (ehUrl) await gerarLink(texto);
        else await buscar(texto);
    }, true);

    async function buscar(keyword) {
        abrir('Garimpando produtos na Shopee...');
        carregando(true);
        try {
            const dados = await chamar('/api/shopee/buscar-produtos', { keyword, limit: 10, notaMinima: 0 });
            const produtos = dados.produtos || dados.ranking || [];
            if (!produtos.length) {
                abrir('Nenhum produto encontrado. Tente outro termo.');
                return;
            }
            status.textContent = produtos.length + ' produto(s) encontrado(s). Escolha um para preencher o bot.';
            render(produtos);
        } catch (e) {
            abrir('Erro: ' + e.message);
        } finally {
            carregando(false);
        }
    }

    async function gerarLink(link) {
        abrir('Gerando link afiliado da Shopee...');
        carregando(true);
        try {
            const dados = await chamar('/api/shopee/gerar-link', { productUrl: link, subIds: ['achoulevou', 'bot'] });
            input.value = dados.linkAfiliado || link;
            if (loja) loja.value = 'Shopee';
            if (!nome.value || nome.value === 'Buscando...') nome.value = 'Oferta Shopee com desconto';
            de.value = '';
            if (por.value === 'R$ 0,00') por.value = '';
            cupom.value = cupom.value || 'Link afiliado gerado pelo Radar Shopee';
            status.textContent = 'Link afiliado gerado. Confira os campos e gere a mensagem.';
        } catch (e) {
            abrir('Erro: ' + e.message);
        } finally {
            carregando(false);
        }
    }

    function render(produtos) {
        lista.innerHTML = '';
        produtos.forEach((p, i) => {
            const card = document.createElement('article');
            card.className = 'radar-produto-card';
            const preco = precoBR(p.preco || p.precoMin);
            const comissao = pct(p.comissaoPercentual || p.taxaComissao);
            card.innerHTML = '<div class="radar-produto-img-wrap">' + (p.imagem ? '<img src="' + safe(p.imagem) + '">' : '<span>Produto</span>') + '</div><div class="radar-produto-info"><span class="radar-produto-pos">#' + (i + 1) + ' Shopee</span><strong>' + safe(p.nome || 'Produto Shopee') + '</strong><div class="radar-produto-tags"><span>' + safe(preco) + '</span><span>Comissao: ' + safe(comissao) + '</span><span>Vendas: ' + safe(p.vendidos || 'n/i') + '</span></div><div class="radar-produto-actions"><button type="button" class="usar">Usar no bot</button><button type="button" class="usar-gerar">Usar e gerar msg</button></div></div>';
            card.querySelector('.usar').onclick = () => preencher(p, false);
            card.querySelector('.usar-gerar').onclick = () => preencher(p, true);
            lista.appendChild(card);
        });
    }

    function preencher(p, autoGerar) {
        input.value = p.linkAfiliado || p.linkProduto || '';
        if (loja) loja.value = 'Shopee';
        nome.value = p.nome || 'Produto Shopee';
        por.value = precoBR(p.preco || p.precoMin) === 'não identificado' ? '' : precoBR(p.preco || p.precoMin);
        de.value = '';
        const obs = [];
        if (p.vendidos) obs.push('Vendas: ' + p.vendidos);
        if (p.avaliacao) obs.push('Avaliação: ' + p.avaliacao);
        if (p.comissaoPercentual) obs.push('Comissão: ' + pct(p.comissaoPercentual));
        cupom.value = obs.join(' | ');
        status.textContent = autoGerar ? 'Produto preenchido. Gerando mensagem...' : 'Produto preenchido no bot.';
        document.querySelector('.fields-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (autoGerar) setTimeout(() => gerar?.click(), 200);
    }

    async function chamar(path, body) {
        const res = await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.sucesso) throw new Error(json.detalhe || json.erro || 'Falha na API');
        return json;
    }

    function abrir(t) { box.style.display = 'block'; status.textContent = t; lista.innerHTML = ''; }
    function carregando(v) { botao.disabled = v; botao.innerText = v ? 'Garimpando...' : '🔎 Puxar produto'; if (loader) loader.style.display = v ? 'flex' : 'none'; }
    function precoBR(v) { const n = Number(String(v || '').replace(',', '.')); return Number.isFinite(n) ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'não identificado'; }
    function pct(v) { const n = Number(String(v || '').replace('%', '').replace(',', '.')); return Number.isFinite(n) ? n.toFixed(n % 1 === 0 ? 0 : 2).replace('.', ',') + '%' : 'não identificada'; }
    function safe(v) { return String(v || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c])); }
})();
