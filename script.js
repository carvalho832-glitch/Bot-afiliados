const loader = document.getElementById('loader-global');
const selectGrupo = document.getElementById('select-grupo');
const btnPuxar = document.getElementById('btn-puxar');
const btnGerar = document.getElementById('btn-gerar');
const btnSalvar = document.getElementById('btn-salvar');
const btnLimparCampos = document.getElementById('btn-limpar-campos');
const btnApagarTudo = document.getElementById('limpar-historico');
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

// --- FUNÇÃO TURBO ATUALIZADA (AMAZON & ML) ---
btnPuxar.addEventListener('click', async () => {
    const conteudo = inputLink.value.trim();
    if(!conteudo) return alert("Cole o link!");

    loader.style.display = 'flex';
    displayDe.value = "";
    displayPor.value = "";

    try {
        const urlMatch = conteudo.match(/https?:\/\/[^\s]+/);
        if (urlMatch) {
            const urlAlvo = urlMatch[0];
            
            // Busca títulos e tenta forçar a captura de preços via seletores de classe
            const res = await fetch(`https://api.microlink.io?url=${encodeURIComponent(urlAlvo)}&data.price.selector=.a-price-whole,.ui-pdp-price__part,.price-tag-fraction`);
            const json = await res.json();
            
            // 1. Título Inteligente
            if (json.data && json.data.title) {
                displayProduto.value = json.data.title
                    .replace("Amazon.com.br : ", "")
                    .replace(" | Amazon.com.br", "")
                    .replace(" | Mercado Livre", "")
                    .replace(" - Mercado Livre", "")
                    .trim();
            }

            // 2. Captura de Preço (Tentativa em 3 níveis)
            let precoFinal = null;

            // Nível A: Preço direto da API
            if (json.data.price) {
                precoFinal = json.data.price;
            } 
            // Nível B: Procurar R$ na descrição ou metadados
            else if (json.data.description) {
                const achado = json.data.description.match(/R\$\s?(\d{1,3}(\.\d{3})*,\d{2})/);
                if (achado) precoFinal = achado[0];
            }

            // Formatação final do preço capturado
            if (precoFinal) {
                if (typeof precoFinal === 'number') {
                    displayPor.value = "R$ " + precoFinal.toLocaleString('pt-BR', {minimumFractionDigits: 2});
                } else {
                    displayPor.value = precoFinal.toString().startsWith("R$") ? precoFinal : "R$ " + precoFinal;
                }
            }
        }
    } catch (e) {
        console.log("Erro na busca automática.");
    } finally {
        [displayProduto, displayDe, displayPor].forEach(el => el.removeAttribute('readonly'));
        loader.style.display = 'none';
    }
});

btnGerar.addEventListener('click', () => {
    if(!displayProduto.value) return alert("Puxe os dados primeiro!");
    const msg = montarMensagem();
    messageBox.innerText = msg;
    navigator.clipboard.writeText(msg);
    btnGerar.innerText = "📋 COPIADO!";
    setTimeout(() => btnGerar.innerText = "GERAR MENSAGEM", 2000);
});

btnSalvar.addEventListener('click', () => {
    if(!displayProduto.value) return alert("Nada para salvar!");
    ofertasSet.unshift({ id: Date.now(), texto: montarMensagem() });
    localStorage.setItem('ofertas_achou_levou', JSON.stringify(ofertasSet));
    renderizarOfertas();
    alert("Salvo no Histórico! 💾");
});

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
