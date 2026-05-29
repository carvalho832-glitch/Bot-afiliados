const loader = document.getElementById('loader-global');
const selectGrupo = document.getElementById('select-grupo');
const btnPuxar = document.getElementById('btn-puxar');
const btnGerar = document.getElementById('btn-gerar');
const btnCopiar = document.getElementById('btn-copiar');
const btnSalvar = document.getElementById('btn-salvar');
const btnLimparCampos = document.getElementById('btn-limpar-campos');
const btnTema = document.getElementById('btn-tema');
const listaSalvas = document.getElementById('lista-salvas');
const inputLink = document.getElementById('input-link');
const displayProduto = document.getElementById('display-produto');
const displayDe = document.getElementById('display-de');
const displayPor = document.getElementById('display-por');
const displayCupom = document.getElementById('display-cupom');
const messageBox = document.getElementById('msg-preview');
const metaThemeColor = document.getElementById('meta-theme-color');

const STORAGE_OFERTAS = 'ofertas_achou_levou';
const STORAGE_TEMA = 'tema_achou_levou';

let ofertasSet = JSON.parse(localStorage.getItem(STORAGE_OFERTAS)) || [];
let ultimaMensagemGerada = '';

iniciarTema();
renderizarOfertas();

function iniciarTema() {
    const temaSalvo = localStorage.getItem(STORAGE_TEMA) || 'dark';
    aplicarTema(temaSalvo);
}

function aplicarTema(tema) {
    const modoEscuro = tema === 'dark';
    document.body.classList.toggle('dark', modoEscuro);
    btnTema.innerText = modoEscuro ? '☀️' : '🌙';
    btnTema.title = modoEscuro ? 'Ativar modo claro' : 'Ativar modo escuro';
    metaThemeColor?.setAttribute('content', modoEscuro ? '#0d1117' : '#f5f7fb');
    localStorage.setItem(STORAGE_TEMA, tema);
}

btnTema.onclick = () => {
    const temaAtual = document.body.classList.contains('dark') ? 'dark' : 'light';
    aplicarTema(temaAtual === 'dark' ? 'light' : 'dark');
};

function formatarMoeda(e) {
    let v = e.target.value.replace(/\D/g, '');
    v = (v / 100).toFixed(2) + '';
    v = v.replace('.', ',');
    v = v.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    e.target.value = v ? 'R$ ' + v : '';
}

displayDe.addEventListener('input', formatarMoeda);
displayPor.addEventListener('input', formatarMoeda);

function moedaParaNumero(valor) {
    return parseFloat((valor || '').replace(/[^\d,]/g, '').replace(',', '.')) || 0;
}

function calcularPorcentagem(de, por) {
    const valorDe = moedaParaNumero(de);
    const valorPor = moedaParaNumero(por);
    if (valorDe > valorPor && valorPor > 0) return Math.floor(((valorDe - valorPor) / valorDe) * 100);
    return 0;
}

function extrairLink(texto) {
    return texto.match(/https?:\/\/[^\s]+/)?.[0] || texto.trim();
}

function detectarLoja(link) {
    const l = (link || '').toLowerCase();
    if (l.includes('shopee') || l.includes('shp.ee') || l.includes('collshp')) return 'Shopee';
    if (l.includes('mercadolivre') || l.includes('mercado livre') || l.includes('meli.la')) return 'Mercado Livre';
    if (l.includes('amazon') || l.includes('amzn.to')) return 'Amazon';
    return 'Loja oficial';
}

function limparTituloProduto(produto) {
    return (produto || 'Oferta especial')
        .replace(/Amazon\.com\.br\s?:?\s?/gi, '')
        .replace(/\|\s?Mercado\s?Livre/gi, '')
        .replace(/- Mercado Livre/gi, '')
        .replace(/\|\s?Shopee Brasil/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function tituloCurto(produto) {
    return limparTituloProduto(produto).split(' ').slice(0, 8).join(' ').toUpperCase();
}

function beneficioProduto(produto) {
    const p = (produto || '').toLowerCase();

    if (p.includes('tv') || p.includes('smart')) {
        return 'Tela grande para assistir filmes, séries, jogos e apps de streaming com mais conforto.';
    }

    if (p.includes('notebook') || p.includes('laptop') || p.includes('inspiron') || p.includes('dell')) {
        return 'Ideal para trabalho, estudos, navegação e tarefas do dia a dia.';
    }

    if (p.includes('celular') || p.includes('smartphone') || p.includes('galaxy') || p.includes('iphone') || p.includes('motorola')) {
        return 'Ótimo para fotos, vídeos, redes sociais, apps e uso diário.';
    }

    if (p.includes('cadeira') && (p.includes('auto') || p.includes('carro') || p.includes('bebê') || p.includes('bebe'))) {
        return 'Mais segurança e conforto para transportar a criança no carro.';
    }

    if (p.includes('toalha') || p.includes('algodão') || p.includes('algodao') || p.includes('cama') || p.includes('banho')) {
        return 'Produto útil para renovar a casa e deixar a rotina mais confortável.';
    }

    if (p.includes('fone') || p.includes('headset') || p.includes('bluetooth')) {
        return 'Mais praticidade para ouvir músicas, ver vídeos e atender chamadas.';
    }

    if (p.includes('bolsa') || p.includes('mochila')) {
        return 'Ajuda a organizar seus itens com mais praticidade no dia a dia.';
    }

    if (p.includes('tenis') || p.includes('tênis') || p.includes('sapato') || p.includes('sandalia') || p.includes('sandália')) {
        return 'Mais conforto e estilo para usar na rotina, passeio ou trabalho.';
    }

    if (p.includes('omega') || p.includes('ômega') || p.includes('capsula') || p.includes('cápsula')) {
        return 'Produto prático para incluir na rotina de cuidados pessoais.';
    }

    return 'Produto selecionado para facilitar sua rotina e ajudar você a economizar.';
}

function montarMensagem() {
    const linkFinal = extrairLink(inputLink.value);
    const loja = detectarLoja(linkFinal);
    const produto = limparTituloProduto(displayProduto.value || 'Oferta especial');
    const desc = calcularPorcentagem(displayDe.value, displayPor.value);
    const beneficio = beneficioProduto(produto);
    const cupom = displayCupom.value.trim();
    const temDe = displayDe.value && displayDe.value !== 'R$ 0,00';
    const temPor = displayPor.value && displayPor.value !== 'R$ 0,00';
    const cupomEhFrete = /frete|gr[aá]tis/i.test(cupom);

    let msg = `🔥 *${tituloCurto(produto)}!*\n`;
    msg += `✅ ${beneficio}\n\n`;

    if (temDe) msg += `❌ De: ~${displayDe.value}~\n`;
    msg += `💰 *POR APENAS: ${temPor ? displayPor.value : 'Confira no site'}*\n`;
    if (desc >= 2) msg += `🔥 *${desc}% OFF!*\n`;

    if (cupom) {
        msg += cupomEhFrete
            ? `🚚 *Frete grátis:* ${cupom}\n`
            : `🎫 *Cupom:* ${cupom}\n`;
    }

    msg += `\n🔒 *Compre com segurança no site oficial:*\n`;
    msg += `🛒 *Link ${loja}:* ${linkFinal}`;

    return msg;
}

async function copiarParaAreaDeTransferencia(texto) {
    if (!texto || texto === 'Aguardando geração...') {
        alert('Gere uma mensagem primeiro!');
        return false;
    }

    try {
        await navigator.clipboard.writeText(texto);
        return true;
    } catch (error) {
        const area = document.createElement('textarea');
        area.value = texto;
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        area.remove();
        return true;
    }
}

btnPuxar.onclick = async () => {
    const conteudo = inputLink.value.trim();
    if (!conteudo) return alert('Cole o link!');

    loader.style.display = 'flex';
    displayDe.value = 'R$ 0,00';
    displayPor.value = 'R$ 0,00';
    displayProduto.value = 'Buscando...';

    try {
        const urlMatch = conteudo.match(/https?:\/\/[^\s]+/);
        if (!urlMatch) {
            displayProduto.value = '';
            return alert('Não encontrei um link válido.');
        }

        const urlAlvo = urlMatch[0];
        const query = `https://api.microlink.io?url=${encodeURIComponent(urlAlvo)}&data.amz_por_r.selector=.a-price-whole&data.amz_por_c.selector=.a-price-fraction&data.amz_de.selector=.basisPrice .a-offscreen,.a-text-strike&data.ml_de_r.selector=.andes-money-amount--previous .andes-money-amount__fraction&data.ml_de_c.selector=.andes-money-amount--previous .andes-money-amount__cents&data.ml_por_r.selector=.andes-money-amount--cents-superscript .andes-money-amount__fraction,.ui-pdp-price--size-large .andes-money-amount__fraction&data.ml_por_c.selector=.andes-money-amount--cents-superscript .andes-money-amount__cents,.ui-pdp-price--size-large .andes-money-amount__cents&prerender=true`;

        const res = await fetch(query);
        const json = await res.json();

        if (json.data) {
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
        }
    } catch (e) {
        console.log('Erro no processamento:', e);
        alert('Não consegui puxar tudo automático. Você pode preencher produto e preço manualmente.');
    } finally {
        loader.style.display = 'none';
    }
};

btnGerar.onclick = () => {
    if (!displayProduto.value || displayProduto.value === 'Buscando...') return alert('Puxe os dados primeiro ou preencha o produto manualmente!');

    ultimaMensagemGerada = montarMensagem();
    messageBox.innerText = ultimaMensagemGerada;
    btnGerar.innerText = '✅ MENSAGEM GERADA!';
    setTimeout(() => btnGerar.innerText = '✨ GERAR MENSAGEM', 1800);
};

btnCopiar.onclick = async () => {
    const texto = ultimaMensagemGerada || messageBox.innerText;
    const copiou = await copiarParaAreaDeTransferencia(texto);

    if (copiou) {
        btnCopiar.innerText = '✅ COPIADO!';
        setTimeout(() => btnCopiar.innerText = '📋 COPIAR MENSAGEM', 1800);
    }
};

btnSalvar.onclick = () => {
    if (!displayProduto.value || displayProduto.value === 'Buscando...') return alert('Nada para salvar!');

    const texto = ultimaMensagemGerada || montarMensagem();
    ofertasSet.unshift({ id: Date.now(), texto });
    localStorage.setItem(STORAGE_OFERTAS, JSON.stringify(ofertasSet));
    renderizarOfertas();
    alert('Oferta Salva! 💾');
};

function renderizarOfertas() {
    listaSalvas.innerHTML = '';

    if (!ofertasSet.length) {
        listaSalvas.innerHTML = '<div class="empty-state">Nenhuma oferta salva ainda.</div>';
        return;
    }

    ofertasSet.forEach(o => {
        const div = document.createElement('div');
        div.className = 'saved-card';

        div.innerHTML = `
            <pre>${o.texto}</pre>
            <div class="saved-actions">
                <button class="copy-saved" onclick="copiarTexto('${encodeURIComponent(o.texto)}')">COPIAR</button>
                <button class="delete-saved" onclick="apagar(${o.id})">🗑️</button>
            </div>`;

        listaSalvas.appendChild(div);
    });
}

window.copiarTexto = async (t) => {
    await copiarParaAreaDeTransferencia(decodeURIComponent(t));
    alert('Copiado! ✅');
};

window.apagar = (id) => {
    if (confirm('Deseja excluir esta oferta?')) {
        ofertasSet = ofertasSet.filter(o => o.id !== id);
        localStorage.setItem(STORAGE_OFERTAS, JSON.stringify(ofertasSet));
        renderizarOfertas();
    }
};

btnLimparCampos.onclick = () => {
    if (confirm('Deseja limpar todos os campos?')) {
        inputLink.value = '';
        displayProduto.value = '';
        displayDe.value = '';
        displayPor.value = '';
        displayCupom.value = '';
        ultimaMensagemGerada = '';
        messageBox.innerText = 'Aguardando geração...';
    }
};
