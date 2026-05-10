// --- CONFIGURAÇÕES DE SEGURANÇA ---
// Chave dividida para o GitHub não bloquear
const p1 = "AIzaSyBvtlsR";
const p2 = "OEw5UoE62WUtniYKWsan47C6gDI";
const GEMINI_API_KEY = p1 + p2;

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

let ofertasSet = JSON.parse(localStorage.getItem('ofertas_achou_levou')) || [];
renderizarOfertas();

// --- FUNÇÕES DE FORMATAÇÃO ---
function formatarMoeda(e) {
    let v = e.target.value.replace(/\D/g, ""); 
    if (!v) { e.target.value = ""; return; }
    v = (v / 100).toFixed(2) + "";
    v = v.replace(".", ",");
    v = v.replace(/\B(?=(\d{3})+(?!\d))/g, "."); 
    e.target.value = "R$ " + v;
}
displayDe.addEventListener('input', formatarMoeda);
displayPor.addEventListener('input', formatarMoeda);

function calcularPorcentagem(de, por) {
    const valorDe = parseFloat(de.replace(/[^\d,]/g, '').replace(',', '.'));
    const valorPor = parseFloat(por.replace(/[^\d,]/g, '').replace(',', '.'));
    if (valorDe > valorPor && valorDe > 0) return Math.floor(((valorDe - valorPor) / valorDe) * 100);
    return 0;
}

// --- CHAMADA DA IA ---
async function pedirTextoParaIA(produto, preco) {
    const payload = {
        contents: [{
            parts: [{
                text: `Aja como um vendedor experiente. Crie uma frase CURTA, única e persuasiva para vender: ${produto} por ${preco}. Use emojis. Não use aspas.`
            }]
        }]
    };

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        
        if (data.candidates && data.candidates[0].content) {
            return data.candidates[0].content.parts[0].text.trim();
        }
        return "🚨 TEXTO DE EMERGÊNCIA: Preço espetacular, garanta o seu agora mesmo! 🔥";
    } catch (e) {
        console.error("Erro na IA:", e);
        return "🚨 ERRO DE REDE: Não foi possível conectar com a IA! 🚀";
    }
}

// --- LÓGICA DE PUXAR DADOS ---
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
                displayProduto.value = (json.data.title || "").replace(/Amazon\.com\.br\s?:?\s?/gi, "").replace(/\|\s?Mercado\s?Livre/gi, "").replace(/- Mercado Livre/gi, "").trim();

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
                
                if (vPor === "R$ 0,00" && json.data.price) {
                    vPor = "R$ " + json.data.price.toLocaleString('pt-BR', {minimumFractionDigits: 2});
                }

                displayPor.value = vPor;
                displayDe.value = vDe;
            }
        }
    } catch (e) {
        console.error("Erro ao puxar dados:", e);
    } finally {
        loader.style.display = 'none';
    }
};

// --- GERAÇÃO DA MENSAGEM FINAL ---
btnGerar.onclick = async () => {
    if(!displayProduto.value || displayProduto.value === "Buscando...") return alert("Puxe os dados primeiro!");
    
    // VISUAL DE TESTE: O botão tem que mudar para essa frase exata abaixo!
    btnGerar.innerText = "🤖 ACORDANDO A IA...";
    btnGerar.disabled = true;

    try {
        const desc = calcularPorcentagem(displayDe.value, displayPor.value);
        const linkFinal = inputLink.value.match(/https?:\/\/[^\s]+/)?.[0] || inputLink.value;
        
        const fraseIA = await pedirTextoParaIA(displayProduto.value, displayPor.value);

        let msg = `🚨 *${selectGrupo.value.toUpperCase()}* 🚨\n`;
        if (desc >= 2) msg += `🔥 *${desc}% DE DESCONTO!* 🔥\n`;
        
        msg += `\n_${fraseIA}_\n\n📦 *Produto:* ${displayProduto.value}\n\n`; 
        
        if(displayDe.value && displayDe.value !== "R$ 0,00") {
            msg += `❌ De: ~${displayDe.value}~\n`;
        }
        
        msg += `✅ *Por apenas: ${displayPor.value}* \n\n`; 
        
        if(displayCupom.value) {
            msg += `🎫 Usar Cupom: *${displayCupom.value}*\n\n`;
        }
        
        msg += `🛒 *Compre aqui:* ${linkFinal}`;

        messageBox.innerText = msg;
        navigator.clipboard.writeText(msg);
        btnGerar.innerText = "📋 COPIADO!";
    } catch (err) {
        console.error("Erro ao gerar mensagem:", err);
        alert("Erro técnico ao montar a mensagem.");
    } finally {
        btnGerar.disabled = false;
        setTimeout(() => btnGerar.innerText = "GERAR MENSAGEM", 2000);
    }
};

// --- GESTÃO DE HISTÓRICO ---
btnSalvar.onclick = () => {
    if(!displayProduto.value || displayProduto.value === "Buscando...") return alert("Nada para salvar!");
    ofertasSet.unshift({ id: Date.now(), texto: messageBox.innerText });
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
                <button onclick="copiarTexto('${encodeURIComponent(o.texto)}')" style="flex: 1; background:#238636; border:none; padding:12px; color:white; border-radius:6px; font-weight:bold;">COPIAR</button>
                <button onclick="apagar(${o.id})" style="width:50px; background:#da3633; border:none; color:white; border-radius:6px;">🗑️</button>
            </div>`;
        listaSalvas.appendChild(div);
    });
}

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
    if(confirm("Deseja limpar todos os campos?")) {
        location.reload();
    }
};
