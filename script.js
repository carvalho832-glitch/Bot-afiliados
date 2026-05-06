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
const messageBox = document.querySelector('.message-output-box p');

const slogans = ["Oferta boa assim voa! 💸", "Preço de banana! 🍌", "Aproveite agora! 🚀", "Estoque baixo! 🏃‍♂️", "Achado do dia! ⭐", "Direto no alvo! 🎯", "Caiu o preço! 📉", "Pechincha bruta! 🔨", "Garanta o seu! 🛒"];

let ofertasSet = JSON.parse(localStorage.getItem('ofertas_achou_levou')) || [];
renderizarOfertas();

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

function montarMensagem() {
    const desc = calcularPorcentagem(displayDe.value, displayPor.value);
    const slogan = slogans[Math.floor(Math.random() * slogans.length)];
    const urlMatch = inputLink.value.match(/https?:\/\/[^\s]+/);
    const linkFinal = urlMatch ? urlMatch[0] : inputLink.value;

    let msg = `🚨 *${selectGrupo.value.toUpperCase()}* 🚨\n`;
    if (desc >= 2) msg += `🔥 *${desc}% DE DESCONTO!* 🔥\n`;
    msg += `_${slogan}_\n\n📦 *Produto:* ${displayProduto.value}\n\n`; 
    if(displayDe.value && displayDe.value !== "R$ 0,00") msg += `❌ De: ~${displayDe.value}~\n`;
    msg += `✅ *Por apenas: ${displayPor.value}* \n\n`; 
    if(displayCupom.value) msg += `🎫 Usar Cupom: *${displayCupom.value}*\n\n`;
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
            
            // SUPER QUERY: Captura estrutura da Amazon e Mercado Livre simultaneamente
            const query = `https://api.microlink.io?url=${encodeURIComponent(urlAlvo)}&data.reais.selector=.a-price-whole,.ui-pdp-price__second-line .andes-money-amount__fraction&data.centavos.selector=.a-price-fraction,.ui-pdp-price__second-line .andes-money-amount__cents&data.preco_de.selector=.basisPrice .a-offscreen,.a-text-strike,.ui-pdp-price__original-value .andes-money-amount__fraction&prerender=true`;
            
            const res = await fetch(query);
            const json = await res.json();
            
            if (json.data) {
                // Título Limpo
                displayProduto.value = (json.data.title || "")
                    .replace(/Amazon\.com\.br\s?:?\s?/gi, "")
                    .replace(/\|\s?Mercado\s?Livre/gi, "")
                    .replace(/- Mercado Livre/gi, "")
                    .replace(/Frete grátis/gi, "")
                    .replace(/Enviando hoje/gi, "")
                    .trim();

                let valorPor = "R$ 0,00";
                let valorDe = "R$ 0,00";

                // 1. Lógica do Preço Atual (Por)
                if (json.data.reais) {
                    let r = json.data.reais.toString().replace(/\D/g, "");
                    let c = json.data.centavos ? json.data.centavos.toString().replace(/\D/g, "") : "00";
                    valorPor = "R$ " + r + "," + c;
                } else if (json.data.price) {
                    valorPor = "R$ " + json.data.price.toLocaleString('pt-BR', {minimumFractionDigits: 2});
                }

                // 2. Lógica do Preço Anterior (De)
                if (json.data.preco_de) {
                    let pDe = json.data.preco_de.toString().replace(/\D/g, "");
                    if (pDe) {
                        // Converte para centavos se o valor for muito grande ou limpa formatação
                        let numDe = parseInt(pDe);
                        valorDe = "R$ " + (numDe).toLocaleString('pt-BR', {minimumFractionDigits: 2});
                    }
                }

                displayPor.value = valorPor;
                displayDe.value = valorDe;
            }
        }
    } catch (e) {
        console.log("Erro no Scraping");
    } finally {
        [displayProduto, displayDe, displayPor].forEach(el => el.removeAttribute('readonly'));
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
    alert("Salvo! 💾");
};

function renderizarOfertas() {
    listaSalvas.innerHTML = "";
    ofertasSet.forEach(o => {
        const div = document.createElement('div');
        div.className = "saved-card";
        div.style = "background:#111827; padding:10px; border-radius:8px; margin-bottom:8px; display:flex; justify-content:space-between; border: 1px solid #30363d;";
        div.innerHTML = `<pre style="font-size:10px; color:#d1d5db; white-space:pre-wrap; margin:0; flex:1;">${o.texto}</pre>
            <div style="display:flex; flex-direction:column; gap:5px; margin-left:10px;">
                <button onclick="copiarTexto('${encodeURIComponent(o.texto)}')" style="width:60px; background:#25D366; font-size:9px; padding:5px; color:white; border-radius:4px;">COPIAR</button>
                <button onclick="apagar(${o.id})" style="width:30px; background:#ef4444; font-size:9px; padding:5px; color:white; border-radius:4px;">X</button>
            </div>`;
        listaSalvas.appendChild(div);
    });
}

window.copiarTexto = (t) => { navigator.clipboard.writeText(decodeURIComponent(t)); alert("Copiado!"); };
window.apagar = (id) => { 
    ofertasSet = ofertasSet.filter(o => o.id !== id); 
    localStorage.setItem('ofertas_achou_levou', JSON.stringify(ofertasSet)); 
    renderizarOfertas(); 
};
btnLimparCampos.onclick = () => { location.reload(); };
