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

const slogans = ["Oferta boa assim voa! 💸", "Preço de banana! 🍌", "Aproveite agora! 🚀", "Achado do dia! ⭐", "Pechincha bruta! 🔨"];

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
    const linkFinal = inputLink.value.match(/https?:\/\/[^\s]+/)?.[0] || inputLink.value;

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
            const query = `https://api.microlink.io?url=${encodeURIComponent(urlAlvo)}&data.amz_por_r.selector=.a-price-whole&data.amz_por_c.selector=.a-price-fraction&data.amz_de.selector=.basisPrice .a-offscreen,.a-text-strike&data.ml_de_r.selector=.andes-money-amount--previous .andes-money-amount__fraction&data.ml_de_c.selector=.andes-money-amount--previous .andes-money-amount__cents&data.ml_por_r.selector=.andes-money-amount--cents-superscript .andes-money-amount__fraction,.ui-pdp-price--size-large .andes-money-amount__fraction&data.ml_por_c.selector=.andes-money-amount--cents-superscript .andes-money-amount__cents,.ui-pdp-price--size-large .andes-money-amount__cents&prerender=true`;
            
            const res = await fetch(query);
            const json = await res.json();
            
            if (json.data) {
                displayProduto.value = (json.data.title || "").replace(/Amazon\.com\.br\s?:?\s?/gi, "").replace(/\|\s?Mercado\s?Livre/gi, "").trim();

                let vPor = "R$ 0,00";
                let vDe = "R$ 0,00";

                if (json.data.amz_por_r) {
                    let rNum = parseInt(json.data.amz_por_r.toString().replace(/\D/g, ""));
                    let c = json.data.amz_por_c ? json.data.amz_por_c.toString().replace(/\D/g, "") : "00";
                    vPor = "R$ " + rNum.toLocaleString('pt-BR') + "," + c;
                    
                    if (json.data.amz_de) {
                        let pDeNum = parseFloat(json.data.amz_de.toString().match(/[\d,.]+/)?.[0].replace(/\./g, '').replace(',', '.') || 0);
                        vDe = "R$ " + pDeNum.toLocaleString('pt-BR', {minimumFractionDigits: 2});
                    }
                } 
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

                if (vPor === "R$ 0,00" && json.data.price) vPor = "R$ " + json.data.price.toLocaleString('pt-BR', {minimumFractionDigits: 2});

                displayPor.value = vPor;
                displayDe.value = vDe;
            }
        }
    } catch (e) { alert("Erro ao buscar dados."); }
    finally { loader.style.display = 'none'; }
};

btnGerar.onclick = () => {
    const msg = montarMensagem();
    messageBox.innerText = msg;
    navigator.clipboard.writeText(msg);
    btnGerar.innerText = "📋 COPIADO!";
    setTimeout(() => btnGerar.innerText = "GERAR MENSAGEM", 2000);
};

btnSalvar.onclick = () => {
    ofertasSet.unshift({ id: Date.now(), texto: montarMensagem() });
    localStorage.setItem('ofertas_achou_levou', JSON.stringify(ofertasSet));
    renderizarOfertas();
};

function renderizarOfertas() {
    listaSalvas.innerHTML = "";
    ofertasSet.forEach(o => {
        const div = document.createElement('div');
        div.innerHTML = `<div style="background:#161b22; padding:10px; border-radius:8px; margin-bottom:10px; border:1px solid #30363d; font-size:11px;">
            <pre style="white-space:pre-wrap;">${o.texto}</pre>
            <button onclick="navigator.clipboard.writeText('${encodeURIComponent(o.texto)}'); alert('Copiado!')" style="padding:5px; font-size:10px; background:#238636;">COPIAR</button>
        </div>`;
        listaSalvas.appendChild(div);
    });
}

btnLimparCampos.onclick = () => { location.reload(); };
