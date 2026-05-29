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

const slogans = [
    "Oferta boa assim voa! 💸", "Preço de banana! 🍌", "Aproveite agora! 🚀", "Achado do dia! ⭐", "Pechincha bruta! 🔨",
    "Corre que acaba rápido! 🏃‍♂️💨", "Mais barato que isso, só de graça! 🎁", "Se piscar, perdeu! 👀", "Preço de custo! 😱", "O patrão ficou maluco! 🤪",
    "Desconto de verdade! 📉", "Menor preço dos últimos 30 dias! 🥇", "A carteira chega a sorrir! 😁", "Preço de Black Friday hoje! 🖤", "Não deixa essa passar! 🛑",
    "Estoque quase no fim! 🚨", "Promoção relâmpago! ⚡", "Essa é para zerar o estoque! 📦", "Deixa o like e leva! 👍", "Oferta exclusiva do grupo! 💎",
    "Vai esgotar em 3, 2, 1... ⏳", "Quem chega primeiro bebe água limpa! 💧", "Baita oportunidade! 🎯", "Precinho camarada! 🤝", "Essa bateu o recorde! 🏆",
    "Sua chance de economizar muito! 💰", "Não conte pra ninguém, mas o preço caiu! 🤫", "Olha a chance passando! 🏄‍♂️", "Oportunidade de ouro! 🥇", "Tá de graça! 🤯",
    "Quem compara, compra aqui! 🛒", "Preço que cabe no bolso! 👖", "Oferta pra ninguém botar defeito! 💯", "Só hoje com esse preço! 📅", "Imperdível! 🔥",
    "Você não vai ver esse preço de novo! 🚫", "Preço insano! 🧠💥", "Duvido você achar mais barato! 🧐", "É hoje que você leva! 🛍️", "Oferta quente! 🌶️",
    "Preço derreteu! 🫠", "Aquele achado que a gente ama! ❤️", "Mais economia pra sua casa! 🏡", "Você merece esse presente! 🎁", "Não pense muito, só vai! 🚦",
    "Promoção de verdade não tem pegadinha! 🎣", "Preço lá embaixo! ⬇️", "Caiu o preço, corre! 📉", "Aquele desconto que faz a diferença! 🤑", "Tá muito barato! 🤏",
    "Foco na economia! 🎯", "Seu bolso agradece! 🙏", "Oferta de cair o queixo! 😲", "Promoção absurda! 💥", "Menor preço da internet! 🌐",
    "Preço de atacado no varejo! 🏭", "Esmaga o preço! 🤛", "Oferta pra zerar a loja! 🏪", "Não precisa procurar mais! 🔍", "Esse é o menor valor histórico! 📊",
    "Oferta relâmpago ativada! ⚡", "Aproveita que o frete não perdoa! 🚚", "Oportunidade que não volta! 🔙", "Preço de mãe para filho! 👩‍👦", "Desconto agressivo! 🦁",
    "Oferta que vale cada centavo! 🪙", "A economia é certa! ✅", "Tá imperdível demais! 🤩", "Você encontrou o melhor preço! 📍", "Promoção válida enquanto durar o estoque! ⏳",
    "Desconto que você respeita! 🫡", "É pechincha que chama? 🗣️", "O preço despencou! 🪂", "Queima de estoque total! 🔥", "Liquidação relâmpago! ⛈️",
    "Aproveite antes que o preço suba! 📈", "Essa é pra levar dois! ✌️", "Oferta nível hard! 🎮", "Preço ninja! 🥷", "Desconto mágico! 🪄",
    "Promoção que brilha os olhos! ✨", "Essa oferta é um espetáculo! 🎭", "A melhor compra do seu dia! 🌅", "Preço de amigo! 🫂", "Oferta para os rápidos! 🐆",
    "Desconto de arrasar quarteirão! 🏢", "Preço top das galáxias! 🌌", "A economia que você buscava! 🕵️‍♂️", "Promoção de tirar o fôlego! 😮‍💨", "Essa você não pode perder! ❌",
    "O preço que você esperava! 🕰️", "Oferta para fechar o dia com chave de ouro! 🔑", "Desconto de mestre! 🧙‍♂️", "Preço que alegra o dia! ☀️", "Promoção sem igual! 🥇",
    "Oportunidade fantástica! 🦄", "Preço de feira! 🧺", "Oferta imperdível no ar! 📡", "Desconto que é um estouro! 🎆", "Aproveite a pechincha de hoje! 📅"
];

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

function montarMensagem() {
    const desc = calcularPorcentagem(displayDe.value, displayPor.value);
    const slogan = slogans[Math.floor(Math.random() * slogans.length)];
    const linkFinal = extrairLink(inputLink.value);

    let msg = `🚨 *${selectGrupo.value.toUpperCase()}* 🚨\n\n`;
    msg += `_*${slogan}*_\n\n`;
    msg += `👇 Confira os detalhes: 👇\n\n`;
    msg += `📦 *Produto:* ${displayProduto.value}\n\n`;

    if (desc >= 2) {
        msg += `🔥 *DESCONTO DE ${desc}%!* 🔥\n`;
    }

    if (displayDe.value && displayDe.value !== 'R$ 0,00') {
        msg += `❌ De: ~${displayDe.value}~\n`;
    }

    msg += `✅ *Por apenas: ${displayPor.value || 'Confira no site'}*\n\n`;

    if (displayCupom.value.trim()) {
        msg += `🎫 *Use o Cupom:* ${displayCupom.value.trim()}\n\n`;
    }

    msg += `🔒 *Compre com segurança no site oficial:*\n\n`;
    msg += `🛒 *Link:* ${linkFinal}`;

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
