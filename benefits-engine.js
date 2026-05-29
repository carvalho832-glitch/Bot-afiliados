(() => {
    const inputLink = document.getElementById('input-link');
    const displayProduto = document.getElementById('display-produto');
    const displayDe = document.getElementById('display-de');
    const displayPor = document.getElementById('display-por');
    const displayCupom = document.getElementById('display-cupom');
    const messageBox = document.getElementById('msg-preview');
    const btnGerar = document.getElementById('btn-gerar');
    const selectLoja = document.getElementById('select-loja');

    if (!inputLink || !displayProduto || !messageBox || !btnGerar) return;

    function extrairLink(texto) {
        return texto.match(/https?:\/\/[^\s]+/)?.[0] || texto.trim();
    }

    function detectarLoja(link) {
        const escolha = selectLoja?.value || 'auto';
        if (escolha !== 'auto') return escolha;

        const l = (link || '').toLowerCase();
        if (l.includes('shopee') || l.includes('shp.ee') || l.includes('collshp')) return 'Shopee';
        if (l.includes('mercadolivre') || l.includes('mercado livre') || l.includes('meli.la')) return 'Mercado Livre';
        if (l.includes('amazon') || l.includes('amzn.to')) return 'Amazon';
        return 'Loja oficial';
    }

    function moedaNumero(valor) {
        return parseFloat((valor || '').replace(/[^\d,]/g, '').replace(',', '.')) || 0;
    }

    function calcularDesconto(de, por) {
        const valorDe = moedaNumero(de);
        const valorPor = moedaNumero(por);
        if (valorDe > valorPor && valorPor > 0) return Math.floor(((valorDe - valorPor) / valorDe) * 100);
        return 0;
    }

    function limparTitulo(produto) {
        return (produto || 'Oferta especial')
            .replace(/Amazon\.com\.br\s?:?\s?/gi, '')
            .replace(/\|\s?Mercado\s?Livre/gi, '')
            .replace(/- Mercado Livre/gi, '')
            .replace(/\|\s?Shopee Brasil/gi, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function tituloCurto(produto) {
        return limparTitulo(produto).split(' ').slice(0, 9).join(' ').toUpperCase();
    }

    function contem(texto, palavras) {
        return palavras.some(palavra => texto.includes(palavra));
    }

    function beneficioCliente(produto) {
        const p = limparTitulo(produto).toLowerCase();

        const regras = [
            {
                palavras: ['multivitamina', 'multivitamínico', 'polivitamínico', 'vitamina', 'minerais', 'zinco', 'magnésio', 'magnesio', 'cálcio', 'calcio'],
                texto: 'Ajuda a complementar a rotina diária de vitaminas e minerais de forma prática.'
            },
            {
                palavras: ['omega', 'ômega', 'óleo de peixe', 'oleo de peixe'],
                texto: 'Opção prática para complementar a rotina de cuidados diários com cápsulas.'
            },
            {
                palavras: ['cafeína', 'cafeina', 'termogênico', 'termogenico', 'creatina', 'whey', 'proteína', 'proteina', 'suplemento', 'capsula', 'cápsula'],
                texto: 'Prático para incluir na rotina de treinos, estudos ou cuidados pessoais.'
            },
            {
                palavras: ['celular', 'smartphone', 'galaxy', 'iphone', 'motorola', 'xiaomi', 'redmi', 'poco', 'realme'],
                texto: 'Mais praticidade para fotos, vídeos, redes sociais, apps e uso diário.'
            },
            {
                palavras: ['notebook', 'laptop', 'inspiron', 'dell', 'lenovo', 'acer', 'asus', 'macbook', 'computador'],
                texto: 'Ideal para trabalho, estudos, navegação e tarefas do dia a dia.'
            },
            {
                palavras: ['smart tv', 'tv ', 'televisão', 'televisao', 'roku', 'led', 'qled', 'oled'],
                texto: 'Tela maior para assistir filmes, séries, jogos e conteúdos de streaming com mais conforto.'
            },
            {
                palavras: ['fone', 'headset', 'earbuds', 'bluetooth', 'caixa de som', 'soundbar'],
                texto: 'Mais praticidade para ouvir músicas, assistir vídeos e atender chamadas.'
            },
            {
                palavras: ['vestido', 'blusa', 'camiseta', 'camisa', 'calça', 'calca', 'short', 'jaqueta', 'casaco', 'moletom', 'tricô', 'trico', 'cropped', 'saia'],
                texto: 'Peça versátil para compor looks do dia a dia com conforto e estilo.'
            },
            {
                palavras: ['tênis', 'tenis', 'sapato', 'sandália', 'sandalia', 'chinelo', 'bota', 'sapatilha'],
                texto: 'Mais conforto e estilo para usar na rotina, passeio ou trabalho.'
            },
            {
                palavras: ['bolsa', 'mochila', 'mala', 'necessaire', 'carteira'],
                texto: 'Ajuda a organizar seus itens com praticidade no trabalho, passeio ou viagem.'
            },
            {
                palavras: ['sanduicheira', 'grill', 'air fryer', 'airfryer', 'panela', 'liquidificador', 'cafeteira', 'batedeira', 'micro-ondas', 'microondas', 'forno'],
                texto: 'Facilita o preparo de comidas e lanches rápidos no dia a dia.'
            },
            {
                palavras: ['toalha', 'jogo de cama', 'lençol', 'lencol', 'edredom', 'cobertor', 'travesseiro', 'tapete', 'cortina'],
                texto: 'Ajuda a renovar a casa e deixar a rotina mais confortável.'
            },
            {
                palavras: ['cadeirinha', 'cadeira para auto', 'bebê conforto', 'bebe conforto', 'carrinho de bebê', 'carrinho de bebe'],
                texto: 'Mais segurança e conforto para transportar a criança em passeios e viagens.'
            },
            {
                palavras: ['fralda', 'mamadeira', 'chupeta', 'banheira bebê', 'banheira bebe'],
                texto: 'Produto útil para facilitar os cuidados com o bebê na rotina da família.'
            },
            {
                palavras: ['shampoo', 'condicionador', 'creme', 'hidratante', 'protetor solar', 'perfume', 'maquiagem', 'escova secadora', 'secador', 'chapinha'],
                texto: 'Ajuda nos cuidados pessoais com mais praticidade no dia a dia.'
            },
            {
                palavras: ['furadeira', 'parafusadeira', 'kit ferramenta', 'ferramenta', 'trena', 'serra'],
                texto: 'Facilita reparos, montagens e pequenas tarefas em casa ou no trabalho.'
            },
            {
                palavras: ['câmera', 'camera', 'webcam', 'monitor', 'teclado', 'mouse', 'impressora', 'roteador'],
                texto: 'Mais praticidade para trabalho, estudos, conexão e uso no dia a dia.'
            }
        ];

        const regra = regras.find(item => contem(p, item.palavras));
        return regra?.texto || 'Produto útil para facilitar sua rotina e aproveitar uma boa oferta.';
    }

    function montarMensagemInteligente() {
        const link = extrairLink(inputLink.value);
        const loja = detectarLoja(link);
        const produto = limparTitulo(displayProduto.value || 'Oferta especial');
        const de = displayDe?.value || '';
        const por = displayPor?.value || '';
        const cupom = displayCupom?.value?.trim() || '';
        const desc = calcularDesconto(de, por);
        const temDe = de && de !== 'R$ 0,00';
        const temPor = por && por !== 'R$ 0,00';
        const cupomEhFrete = /frete|gr[aá]tis/i.test(cupom);

        let msg = `🔥 *${tituloCurto(produto)}!*\n`;
        msg += `✅ ${beneficioCliente(produto)}\n\n`;

        if (temDe) msg += `❌ De: ~${de}~\n`;
        msg += `💰 *POR APENAS: ${temPor ? por : 'Confira no site'}*\n`;
        if (desc >= 2) msg += `🔥 *${desc}% OFF!*\n`;

        if (cupom) {
            msg += cupomEhFrete
                ? `🚚 *Frete grátis:* ${cupom}\n`
                : `🎫 *Cupom:* ${cupom}\n`;
        }

        msg += `\n🔒 *Compre com segurança no site oficial:*\n`;
        msg += `🛒 *Link ${loja}:* ${link}`;

        return msg;
    }

    btnGerar.onclick = () => {
        if (!displayProduto.value || displayProduto.value === 'Buscando...') {
            alert('Puxe os dados primeiro ou preencha o produto manualmente!');
            return;
        }

        const mensagem = montarMensagemInteligente();
        window.__ultimaMensagemAchouLevou = mensagem;
        messageBox.innerText = mensagem;
        btnGerar.innerText = '✅ MENSAGEM GERADA!';
        setTimeout(() => btnGerar.innerText = '✨ GERAR MENSAGEM', 1800);
    };
})();
