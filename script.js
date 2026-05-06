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

// --- MÁSCARA DE MOEDA ---
function formatarMoeda(e) {
    let v = e.target.value.replace(/\D/g, ""); 
    v = (v / 100).toFixed(2) + "";
    v = v.replace(".", ",");
    v = v.replace(/\B(?=(\d{3})+(?!\d))/g, "."); 
    e.target.value = v ? "R$ " + v : "";
}
displayDe.addEventListener('input', formatarMoeda);
displayPor.addEventListener('input', formatarMoeda);

// --- CÁLCULO DE DESCONTO ---
function calcularPorcentagem(de, por) {
    const valorDe = parseFloat(de.replace(/[^\d,]/g, '').replace(',', '.'));
    const valorPor = parseFloat(por.replace(/[^\d,]/g, '').replace(',', '.'));
    if (valorDe > valorPor) return Math.floor(((valorDe - valorPor) / valorDe) * 100);
    return 0;
}

// --- MONTAGEM DA MENSAGEM ---
function montarMensagem() {
    const desc = calcularPorcentagem(displayDe.value, displayPor.value);
    const slogan = slogans[Math.floor(Math.random() * slogans.length)];
    
    let msg = `🚨 *${selectGrupo.value.toUpperCase()}* 🚨\n`;
    if (desc >= 2) msg += `🔥 *${desc}% DE DESCONTO!* 🔥\n`;
    msg += `_${slogan}_\n\n📦 *Produto:* ${displayProduto.value}\n\n`; 
    if(displayDe.value && displayDe.value !== "R$ 0,00") msg += `❌ De: ~${displayDe.value}~\n`;
    msg += `✅ *Por apenas: ${displayPor.value}* \n\n`; 
    if(displayCupom.value) msg += `🎫 Usar Cupom: *${displayCupom.value}*\n\n`;
    
    // Extrai apenas o Link (URL) do campo, ignorando textos extras
    const urlMatch = inputLink.value.match(/https?:\/\/[^\s]+/);
    const linkFinal = urlMatch ? urlMatch[0] : inputLink.value;
    
    msg += `🛒 *Compre aqui:* ${linkFinal}`;
    return msg;
}

// --- FUNÇÃO TURBO: BUSCAR DADOS E EXTRAIR PREÇO DO TEXTO ---
btnPuxar.addEventListener('click', async () => {
    const conteudo = inputLink.value.trim();
    if(!conteudo) return alert("Cole o link ou o texto da oferta!");

    loader.style.display = 'flex';

    // 1. EXTRAÇÃO DE PREÇOS (REGEX)
    // Procura padrões de R$ no texto colado
    const regexPreco = /R\$\s?(\d{1,3}(\.\d{3})*,\d{2})/g;
    const precosEncontrados = conteudo.match(regexPreco);

    if (precosEncontrados) {
        let valoresNumericos = precosEncontrados.map(p => 
            parseFloat(p.replace("R$", "").replace(/\./g, "").replace(",", ".").trim())
        );

        if (valoresNumericos.length >= 2) {
            const valorDe = Math.max(...valoresNumericos);
            const valorPor = Math.min(...valoresNumericos);
            displayDe.value = "R$ " + valorDe.toLocaleString('pt-BR', {minimumFractionDigits: 2});
            displayPor.value = "R$ " + valorPor.toLocaleString('pt-BR', {minimumFractionDigits: 2});
        } else if (valoresNumericos.length === 1) {
            displayPor.value = "R$ " + valoresNumericos[0].toLocaleString('pt-BR', {minimumFractionDigits: 2});
        }
    }

    // 2. BUSCA DO TÍTULO VIA API
    try {
        const urlMatch = conteudo.match(/https?:\/\/[^\s]+/);
        if (urlMatch) {
            const res = await fetch(`https://api.microlink.io?url=${encodeURIComponent(urlMatch[0])}`);
            const json = await res.json();
            if (json.data && json.data.title) {
                displayProduto.value = json.data.title.replace("Amazon.com.br : ", "").replace(" | Amazon.com.br", "").trim();
            }
        }
    } catch (e) {
        console.log("Erro ao buscar título, mas os preços podem ter sido extraídos.");
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
    alert("Salvo no Arquivo! 💾");
});

function renderizarOfertas() {
    listaSalvas.innerHTML = "";
    ofertasSet.forEach(o => {
        const div = document.createElement('div');
        div.className = "saved-card";
        div.style = "background:#111827; padding:10px; border-radius:8px; margin-bottom:8px; display:flex; justify-content:space-between; border: 1px solid #30363d;";
        div.innerHTML = `<pre style="font-size:10px; color:#d1d5db; white-space:pre-wrap; margin:0; flex:1; line-height:1.4;">${o.texto}</pre>
            <div style="display:flex; flex-direction:column; gap:5px;">
                <button onclick="copiarTexto('${encodeURIComponent(o.texto)}')" style="width:60px; background:#25D366; font-size:9px; padding:5px; border-radius:4px; color:white; font-weight:bold;">COPIAR</button>
                <button onclick="apagar(${o.id})" style="width:30px; background:#ef4444; font-size:9px; padding:5px; border-radius:4px; color:white; font-weight:bold;">X</button>
            </div>`;
        listaSalvas.appendChild(div);
    });
}

window.copiarTexto = (t) => { 
    navigator.clipboard.writeText(decodeURIComponent(t)); 
    alert("Copiado!"); 
};

window.apagar = (id) => { 
    ofertasSet = ofertasSet.filter(o => o.id !== id); 
    localStorage.setItem('ofertas_achou_levou', JSON.stringify(ofertasSet)); 
    renderizarOfertas(); 
};

btnApagarTudo.onclick = () => { 
    if(confirm("Deseja apagar todo o histórico?")) { 
        ofertasSet = []; 
        localStorage.removeItem('ofertas_achou_levou'); 
        renderizarOfertas(); 
    } 
};

btnLimparCampos.onclick = () => { 
    inputLink.value=""; 
    displayProduto.value=""; 
    displayDe.value=""; 
    displayPor.value=""; 
    displayCupom.value=""; 
    messageBox.innerText="Aguardando geração...";
};
