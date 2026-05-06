// ... (mantenha as constantes de ID e slogans iguais)

btnPuxar.addEventListener('click', async () => {
    const conteudo = inputLink.value.trim();
    if(!conteudo) return alert("Cole o link!");

    loader.style.display = 'flex';
    
    // Limpa os campos antes de buscar
    displayDe.value = "";
    displayPor.value = "";

    try {
        const urlMatch = conteudo.match(/https?:\/\/[^\s]+/);
        if (urlMatch) {
            const urlAlvo = urlMatch[0];
            
            // Usando um serviço que foca em Meta-Tags (mais difícil de bloquear)
            const res = await fetch(`https://api.microlink.io?url=${encodeURIComponent(urlAlvo)}&data.price.selector=.a-price-whole,.ui-pdp-price__part`);
            const json = await res.json();
            
            // 1. Título
            if (json.data && json.data.title) {
                displayProduto.value = json.data.title
                    .replace("Amazon.com.br : ", "")
                    .replace(" | Amazon.com.br", "")
                    .replace(" | Mercado Livre", "")
                    .trim();
            }

            // 2. Lógica de Preço Turbinada
            // Tentamos pegar o preço que o Microlink encontrou automaticamente
            let precoExtraido = json.data.price || (json.data.description ? json.data.description.match(/R\$\s?(\d{1,3}(\.\d{3})*,\d{2})/) : null);

            if (precoExtraido) {
                // Se for um array (regex), pega a primeira posição
                let valorFinal = Array.isArray(precoExtraido) ? precoExtraido[0] : precoExtraido;
                displayPor.value = typeof valorFinal === 'number' ? "R$ " + valorFinal.toLocaleString('pt-BR', {minimumFractionDigits: 2}) : valorFinal;
            }
        }
    } catch (e) {
        console.log("Erro na busca automática.");
    } finally {
        [displayProduto, displayDe, displayPor].forEach(el => el.removeAttribute('readonly'));
        loader.style.display = 'none';
    }
});

// ... (resto do código de gerar mensagem e salvar permanece igual)
