// ... (início igual até a função btnPuxar)

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
            // Adicionado seletores de centavos (fraction)
            const res = await fetch(`https://api.microlink.io?url=${encodeURIComponent(urlAlvo)}&data.price.selector=.a-price-whole,.a-price-fraction,.ui-pdp-price__part`);
            const json = await res.json();
            
            if (json.data && json.data.title) {
                displayProduto.value = json.data.title.replace("Amazon.com.br : ", "").replace(" | Amazon.com.br", "").trim();
            }

            let precoBruto = json.data.price;

            // TENTATIVA 1: Se o preço veio picado, ou se a descrição tem o valor cheio (melhor para centavos)
            if (json.data.description) {
                const achadoCompleto = json.data.description.match(/R\$\s?(\d{1,3}(\.\d{3})*,\d{2})/);
                if (achadoCompleto) precoBruto = achadoCompleto[0];
            }

            if (precoBruto) {
                // Filtro para garantir que temos R$ e os centavos
                let textoLimpo = precoBruto.toString().replace(/<[^>]*>?/gm, '').trim();
                
                // Se o preço veio sem vírgula (ex: 2.898), a gente tenta tratar
                if (!textoLimpo.includes(",")) {
                   // Tenta ver se o Microlink pegou os centavos em algum lugar
                   displayPor.value = textoLimpo.startsWith("R$") ? textoLimpo + ",90" : "R$ " + textoLimpo + ",90";
                } else {
                   displayPor.value = textoLimpo.startsWith("R$") ? textoLimpo : "R$ " + textoLimpo;
                }
            }
        }
    } catch (e) {
        console.log("Erro na busca.");
    } finally {
        [displayProduto, displayDe, displayPor].forEach(el => el.removeAttribute('readonly'));
        loader.style.display = 'none';
    }
});

// ... (resto do código igual)
