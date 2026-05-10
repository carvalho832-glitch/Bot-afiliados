const loader = document.getElementById('loader-global');
const selectGrupo = document.getElementById('select-grupo');
const btnPuxar = document.getElementById('btn-puxar');
const btnGerar = document.getElementById('btn-gerar');
const btnSalvar = document.getElementById('btn-salvar');
const btnLimparCampos = document.getElementById('btn-limpar-campos');
const listaSalvas = document.getElementById('lista-salvas');
const inputLink = document.getElementById('input-link');
const displayProduto = document.getElementById('display-produto');
const displayDe = document.getElementById('display-de');
const displayPor = document.getElementById('display-por');
const displayCupom = document.getElementById('display-cupom');
const messageBox = document.getElementById('msg-preview');

// --- AS 100 FRASES DE OFERTA PRÉ-PROGRAMADAS ---
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

let ofertasSet = JSON.parse(localStorage.getItem('ofertas_achou_levou')) || [];
renderizarOfertas();

// Formatação automática enquanto digita
function formatarMoeda(e) {
    let v = e.target.value.replace(/\D/g, ""); 
    v = (v / 100).toFixed(2) + "";
    v = v.replace(".", ",");
    v = v.replace(/\B(?=(\d{3})+(?!\d))/g, "."); 
    e.target.value = v ? "R$ " + v : "";
}
displayDe.addEventListener('input', formatarMoeda);
displayPor.addEventListener('input', formatarMoeda);

function calcularPorcentagem(de, por) {
    const valorDe = parseFloat(de.replace(/[^\d,]/g, '').replace(',', '.'));
    const valorPor = parseFloat(por.replace(/[^\d,]/g, '').replace(',', '.'));
    if (valorDe > valorPor) return Math.floor(((valorDe - valorPor) / valorDe) * 100);
    return 0;
}

// --- NOVA MONTAGEM DA MENSAGEM (LAYOUT REFORMULADO) ---
function montarMensagem() {
    const desc = calcularPorcentagem(displayDe.value, displayPor.value);
    const slogan = slogans[Math.floor(Math.random() * slogans.length)];
    const linkFinal = inputLink.value.match(/https?:\/\/[^\s]+/)?.[0] || inputLink.value;

    // 1. Cabeçalho do Grupo
    let msg = `🚨 *${selectGrupo.value.toUpperCase()}* 🚨\n\n`;

    // 2. Frase sorteada em Negrito e Itálico com espaço
    msg += `_*${slogan}*_\n\n`;
    
    // 3. Linha opcional para guiar o olhar
    msg += `👇 Confira os detalhes: 👇\n\n`;

    // 4. Nome do Produto isolado
    msg += `📦 *Produto:* ${displayProduto.value}\n\n`; 
    
    // 5. Bloco de Preços e Desconto agrupados
    if (desc >= 2) {
        msg += `🔥 *DESCONTO DE ${desc}%!* 🔥\n`;
    }
    if(displayDe.value && displayDe.value !== "R$ 0,00") {
        msg += `❌ De: ~${displayDe.value}~\n`;
    }
    msg += `✅ *Por apenas: ${displayPor.value}* \n\n`; 
    
    // 6. Cupom (se existir)
    if(displayCupom.value) {
        msg += `🎫 *Use o Cupom:* ${displayCupom.value}\n\n`;
    }
    
    // 7. Chamada para Ação e Link
    msg += `🛒 *Compre aqui:* ${linkFinal}`;
    
    return msg;
}

btnPuxar.onclick = async () => {
    const conteudo = inputLink.value.trim();
    if(!conteudo) return alert("Cole o link!");

    loader.style.display = 'flex';
    displayDe.value = "R$ 0,00";
    displayPor.value = "R$ 0,00";
    displayProduto.value = "Buscando...";

    try {
        const urlMatch = conteudo.match(/https?:\/\/[^\s]+/);
        if (urlMatch) {
            const urlAlvo = urlMatch[0];
            
            // Seus anzóis originais para Amazon e Mercado Livre
            const query = `https://api.microlink.io?url=${encodeURIComponent(urlAlvo)}&data.amz_por_r.selector=.a-price-whole&data.amz_por_c.selector=.a-price-fraction&data.amz_de.selector=.basisPrice .a-offscreen,.a-text-strike&data.ml_de_r.selector=.andes-money-amount--previous .andes-money-amount__fraction&data.ml_de_c.selector=.andes-money-amount--previous .andes-money-amount__cents&data.ml_por_r.selector=.andes-money-amount--cents-superscript .andes-money-amount__fraction,.ui-pdp-price--size-large .andes-money-amount__fraction&data.ml_por_c.selector=.andes-money-amount--cents-superscript .andes-money-amount__cents,.ui-pdp-price--size-large .andes-money-amount__cents&prerender=true`;
            
            const res = await fetch(query);
            const json = await res.json();
            
            if (json.data) {
                // Título sem sujeira
                displayProduto.value = (json.data.title || "").replace(/Amazon\.com\.br\s?:?\s?/gi, "").replace(/\|\s?Mercado\s?Livre/gi, "").replace(/- Mercado Livre/gi, "").trim();

                let vPor = "R$ 0,00";
                let vDe = "R$ 0,00";

                // Lógica Amazon
                if (json.data.amz_por_r) {
                    let rNum = parseInt(json.data.amz_por_r.toString().replace(/\D/g, ""));
                    let c = json.data.amz_por_c ? json.data.amz_por_c.toString().replace(/\D/g, "") : "00";
                    vPor = "R$ " + rNum.toLocaleString('pt-BR') + "," + c;
                    
                    if (json.data.amz_de) {
                        let pDeStr = json.data.amz_de.toString();
                        let pDeNum = parseFloat(pDeStr.match(/[\d,.]+/)?.[0].replace(/\./g, '').replace(',', '.') || 0);
                        vDe = "R$ " + pDeNum.toLocaleString('pt-BR', {minimumFractionDigits: 2});
                    }
                } 
                // Lógica Mercado Livre
                else if (json.data.ml_por_r || json.data.ml_de_r) {
                    if (json.data.ml_por_r) {
                        let rNum = parseInt(json.data.ml_por_r.toString().replace(/\D/g, ""));
                        let c = json.data.ml_por_c ? json.data.ml_por_c.toString().replace(/\D/g, "") : "00";
                        vPor = "R$ " + rNum.toLocaleString('pt-BR') + "," + c;
                    }
                    if (json.data.ml_de_r) {
                        let rNum = parseInt(json.data.ml_de_r.toString().replace(/\D/g, ""));
                        let c = json.data.ml_de_c ? json.data.ml_de_c.toString().replace(/\D/g, "") : "00";
                        vDe = "R$ " + rNum.toLocaleString('pt-BR') + "," + c;
                    }
                }

                // Segurança extra
                if (vPor === "R$ 0,00" && json.data.price) {
                    vPor = "R$ " + json.data.price.toLocaleString('pt-BR', {minimumFractionDigits: 2});
                }

                displayPor.value = vPor;
                displayDe.value = vDe;
            }
        }
    } catch (e) {
        console.log("Erro no processamento.");
    } finally {
        loader.style.display = 'none';
    }
};

btnGerar.onclick = () => {
    if(!displayProduto.value || displayProduto.value === "Buscando...") return alert("Puxe os dados primeiro!");
    const msg = montarMensagem();
    messageBox.innerText = msg;
    navigator.clipboard.writeText(msg);
    btnGerar.innerText = "📋 COPIADO!";
    setTimeout(() => btnGerar.innerText = "GERAR MENSAGEM", 2000);
};

btnSalvar.onclick = () => {
    if(!displayProduto.value || displayProduto.value === "Buscando...") return alert("Nada para salvar!");
    ofertasSet.unshift({ id: Date.now(), texto: montarMensagem() });
    localStorage.setItem('ofertas_achou_levou', JSON.stringify(ofertasSet));
    renderizarOfertas();
    alert("Oferta Salva! 💾");
};

function renderizarOfertas() {
    listaSalvas.innerHTML = "";
    ofertasSet.forEach(o => {
        const div = document.createElement('div');
        div.style = "background:#161b22; padding:15px; border-radius:8px; margin-bottom:15px; border: 1px solid #30363d;";
        
        div.innerHTML = `
            <pre style="font-size:13px; color:#e6edf3; white-space:pre-wrap; margin:0 0 15px 0; font-family: monospace;">${o.texto}</pre>
            <div style="display:flex; gap:10px;">
                <button onclick="copiarTexto('${encodeURIComponent(o.texto)}')" style="flex: 1; background:#238636; border:none; padding:12px; color:white; border-radius:6px; font-weight:bold; font-size:14px; margin:0;">COPIAR</button>
                <button onclick="apagar(${o.id})" style="width:50px; background:#da3633; border:none; padding:12px; color:white; border-radius:6px; font-size:16px; margin:0;">🗑️</button>
            </div>`;
            
        listaSalvas.appendChild(div);
    });
}

// Funções globais expostas para os botões da lista
window.copiarTexto = (t) => {
    navigator.clipboard.writeText(decodeURIComponent(t));
    alert("Copiado! ✅");
};

window.apagar = (id) => {
    if(confirm("Deseja excluir esta oferta?")) {
        ofertasSet = ofertasSet.filter(o => o.id !== id);
        localStorage.setItem('ofertas_achou_levou', JSON.stringify(ofertasSet));
        renderizarOfertas();
    }
};

btnLimparCampos.onclick = () => {
    if(confirm("Deseja limpar todos os campos e recarregar?")) {
        location.reload();
    }
};
