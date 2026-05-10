// Substitua o valor abaixo pela sua chave se necessário, mas já deixei configurado
const GEMINI_API_KEY = "AIzaSyAAnce2NJmvD57anz7zq99TGAO6F-qyV58";

// --- NOVAS FUNÇÕES COM IA ---

async function gerarTextoIA(produto, precoPor) {
    const prompt = `Aja como um vendedor especialista em promoções de WhatsApp e Telegram. 
    Crie um texto extremamente curto (máximo 120 caracteres) e chamativo para o produto: ${produto}. 
    O preço atual é ${precoPor}. 
    Use emojis e gatilhos de urgência. Retorne APENAS o texto da oferta, sem introduções ou aspas.`;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const data = await response.json();
        if (data.candidates && data.candidates[0].content) {
            return data.candidates[0].content.parts[0].text.trim();
        }
        return "Oferta imperdível! Confira os detalhes no link abaixo: 🚀";
    } catch (error) {
        console.error("Erro no Gemini:", error);
        return "Preço imbatível! Aproveite essa oportunidade agora: 🔥";
    }
}

// --- LOGICA DOS BOTÕES ATUALIZADA ---

btnGerar.onclick = async () => {
    if(!displayProduto.value || displayProduto.value === "Buscando...") return alert("Puxe os dados primeiro!");
    
    // Feedback visual
    btnGerar.innerText = "🤖 IA PENSANDO...";
    btnGerar.disabled = true;

    const desc = calcularPorcentagem(displayDe.value, displayPor.value);
    const linkFinal = inputLink.value.match(/https?:\/\/[^\s]+/)?.[0] || inputLink.value;
    
    // Chama a IA para criar o texto curto
    const textoIA = await gerarTextoIA(displayProduto.value, displayPor.value);

    let msg = `🚨 *${selectGrupo.value.toUpperCase()}* 🚨\n`;
    if (desc >= 2) msg += `🔥 *${desc}% DE DESCONTO!* 🔥\n\n`;
    
    msg += `${textoIA}\n\n`;
    msg += `📦 *Produto:* ${displayProduto.value}\n\n`; 
    
    if(displayDe.value && displayDe.value !== "R$ 0,00") {
        msg += `❌ De: ~${displayDe.value}~\n`;
    }
    
    msg += `✅ *Por apenas: ${displayPor.value}* \n\n`; 
    
    if(displayCupom.value) {
        msg += `🎫 Cupom: *${displayCupom.value}*\n\n`;
    }
    
    msg += `🛒 *Compre aqui:* ${linkFinal}`;

    // Exibe e copia
    messageBox.innerText = msg;
    navigator.clipboard.writeText(msg);
    
    btnGerar.disabled = false;
    btnGerar.innerText = "📋 COPIADO!";
    setTimeout(() => btnGerar.innerText = "GERAR MENSAGEM", 2000);
};
