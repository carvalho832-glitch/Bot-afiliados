const loader = document.getElementById('loader-global');
const btnPuxar = document.getElementById('btn-puxar');
const btnGerar = document.getElementById('btn-gerar');
const btnCopiar = document.getElementById('btn-copiar');
const btnSalvar = document.getElementById('btn-salvar');
const btnLimparCampos = document.getElementById('btn-limpar-campos');
const btnLimparOfertas = document.getElementById('btn-limpar-ofertas');
const btnEnviarAtualRobo = document.getElementById('btn-enviar-atual-robo');
const btnEnviarTodasRobo = document.getElementById('btn-enviar-todas-robo');
const btnAbrirPainelBot = document.getElementById('btn-abrir-painel-bot');
const btnTema = document.getElementById('btn-tema');
const listaSalvas = document.getElementById('lista-salvas');
const inputLink = document.getElementById('input-link');
const selectLoja = document.getElementById('select-loja');
const displayProduto = document.getElementById('display-produto');
const displayDe = document.getElementById('display-de');
const displayPor = document.getElementById('display-por');
const displayCupom = document.getElementById('display-cupom');
const messageBox = document.getElementById('msg-preview');
const metaThemeColor = document.getElementById('meta-theme-color');

const STORAGE_OFERTAS = 'ofertas_achou_levou';
const STORAGE_TEMA = 'tema_achou_levou';

let ofertasSet = carregarOfertas();
let ultimaMensagemGerada = '';

iniciarTema();
renderizarOfertas();

function carregarOfertas() {
    try {
        const raw = JSON.parse(localStorage.getItem(STORAGE_OFERTAS) || '[]');
        if (!Array.isArray(raw)) return [];
        return raw
            .map((item, index) => {
                if (typeof item === 'string') {
                    return {
                        id: Date.now() + index,
                        texto: item,
                        criadoEm: new Date().toISOString()
                    };
                }

                return {
                    id: item.id || Date.now() + index,
                    texto: item.texto || item.mensagem || item.message || item.text || '',
                    criadoEm: item.criadoEm || item.createdAt || item.data || new Date().toISOString()
                };
            })
            .filter(item => item.texto);
    } catch {
        return [];
    }
}

function salvarOfertas() {
    localStorage.setItem(STORAGE_OFERTAS, JSON.stringify(ofertasSet));
    window.dispatchEvent(new CustomEvent('achoulevou:ofertas-atualizadas', {
        detail: { total: ofertasSet.length }
    }));
}

function iniciarTema() {
    const temaSalvo = localStorage.getItem(STORAGE_TEMA) || 'dark';
    aplicarTema(temaSalvo);
}

function aplicarTema(tema) {
    const modoEscuro = tema === 'dark';
    document.body.classList.toggle('dark', modoEscuro);

    if (btnTema) {
        btnTema.innerText = modoEscuro ? '☀️' : '🌙';
        btnTema.title = modoEscuro ? 'Ativar modo claro' : 'Ativar modo escuro';
    }

    metaThemeColor?.setAttribute('content', modoEscuro ? '#07111f' : '#eef4fb');
    localStorage.setItem(STORAGE_TEMA, tema);
}

btnTema?.addEventListener('click', () => {
    const temaAtual = document.body.classList.contains('dark') ? 'dark' : 'light';
    aplicarTema(temaAtual === 'dark' ? 'light' : 'dark');
});

function formatarMoeda(e) {
    let v = e.target.value.replace(/\D/g, '');

    if (!v) {
        e.target.value = '';
        return;
    }

    v = (Number(v) / 100).toFixed(2);
    v = v.replace('.', ',');
    v = v.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    e.target.value = 'R$ ' + v;
}

displayDe?.addEventListener('input', formatarMoeda);
displayPor?.addEventListener('input', formatarMoeda);

displayProduto?.removeAttribute('readonly');

messageBox?.addEventListener('input', () => {
    const texto = obterMensagemAtual();
    ultimaMensagemGerada = texto;
    window.__ultimaMensagemAchouLevou = texto;
});

function moedaParaNumero(valor) {
    return parseFloat((valor || '').replace(/[^\d,]/g, '').replace(',', '.')) || 0;
}

function calcularPorcentagem(de, por) {
    const valorDe = moedaParaNumero(de);
    const valorPor = moedaParaNumero(por);

    if (valorDe > valorPor && valorPor > 0) {
        return Math.floor(((valorDe - valorPor) / valorDe) * 100);
    }

    return 0;
}

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

function isShopeeLink(texto) {
    const link = (texto || '').toLowerCase();
    return link.includes('shopee') ||
        link.includes('shp.ee') ||
        link.includes('collshp.com') ||
        link.includes('s.shopee.com.br');
}


function limparTituloProduto(produto) {
    return (produto || 'Oferta especial')
        .replace(/Amazon\.com\.br\s?:?\s?/gi, '')
        .replace(/\|\s?Mercado\s?Livre/gi, '')
        .replace(/- Mercado Livre/gi, '')
        .replace(/\|\s?Shopee Brasil/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function tituloCurto(produto) {
    return limparTituloProduto(produto).split(' ').slice(0, 8).join(' ').toUpperCase();
}

function beneficioProduto(produto) {
    const p = (produto || '').toLowerCase();

    if (p.includes('tv') || p.includes('smart')) {
        return 'Tela grande para assistir filmes, séries, jogos e apps de streaming com mais conforto.';
    }

    if (p.includes('notebook') || p.includes('laptop') || p.includes('inspiron') || p.includes('dell')) {
        return 'Ideal para trabalho, estudos, navegação e tarefas do dia a dia.';
    }

    if (p.includes('celular') || p.includes('smartphone') || p.includes('galaxy') || p.includes('iphone') || p.includes('motorola')) {
        return 'Ótimo para fotos, vídeos, redes sociais, apps e uso diário.';
    }

    if (p.includes('cadeira') && (p.includes('auto') || p.includes('carro') || p.includes('bebê') || p.includes('bebe'))) {
        return 'Mais segurança e conforto para transportar a criança no carro.';
    }

    if (p.includes('toalha') || p.includes('algodão') || p.includes('algodao') || p.includes('cama') || p.includes('banho')) {
        return 'Produto útil para renovar a casa e deixar a rotina mais confortável.';
    }

    if (p.includes('fone') || p.includes('headset') || p.includes('bluetooth')) {
        return 'Mais praticidade para ouvir músicas, ver vídeos e atender chamadas.';
    }

    if (p.includes('bolsa') || p.includes('mochila')) {
        return 'Ajuda a organizar seus itens com mais praticidade no dia a dia.';
    }

    if (p.includes('tenis') || p.includes('tênis') || p.includes('sapato') || p.includes('sandalia') || p.includes('sandália')) {
        return 'Mais conforto e estilo para usar na rotina, passeio ou trabalho.';
    }

    if (p.includes('omega') || p.includes('ômega') || p.includes('capsula') || p.includes('cápsula')) {
        return 'Produto prático para incluir na rotina de cuidados pessoais.';
    }

    return 'Produto selecionado para facilitar sua rotina e ajudar você a economizar.';
}

function montarMensagem() {
    const linkFinal = extrairLink(inputLink.value || '');
    const loja = detectarLoja(linkFinal);
    const produto = limparTituloProduto(displayProduto.value || 'Oferta especial');
    const desc = calcularPorcentagem(displayDe.value, displayPor.value);
    const beneficio = beneficioProduto(produto);
    const cupom = displayCupom.value.trim();
    const temDe = displayDe.value && displayDe.value !== 'R$ 0,00';
    const temPor = displayPor.value && displayPor.value !== 'R$ 0,00';
    const cupomEhFrete = /frete|gr[aá]tis/i.test(cupom);

    let msg = `🔥 *${tituloCurto(produto)}!*\n`;
    msg += `✅ ${beneficio}\n\n`;

    if (temDe) msg += `❌ De: ~${displayDe.value}~\n`;
    msg += `💰 *POR APENAS: ${temPor ? displayPor.value : 'Confira no site'}*\n`;
    if (desc >= 2) msg += `🔥 *${desc}% OFF!*\n`;

    if (cupom) {
        msg += cupomEhFrete
            ? `🚚 *Frete grátis:* ${cupom}\n`
            : `🎫 *Cupom:* ${cupom}\n`;
    }

    msg += `\n🔒 *Compre com segurança no site oficial:*\n`;
    msg += `🛒 *Link ${loja}:* ${linkFinal}`;

    return msg;
}

function setMensagem(texto) {
    ultimaMensagemGerada = texto;
    window.__ultimaMensagemAchouLevou = texto;
    if (messageBox) messageBox.innerText = texto || 'Aguardando geração...';
}

function obterMensagemAtual() {
    const texto = (messageBox?.innerText || '').trim();

    if (!texto || texto === 'Aguardando geração...') {
        return '';
    }

    return texto;
}

async function copiarParaAreaDeTransferencia(texto) {
    if (!texto) {
        alert('Gere uma mensagem primeiro!');
        return false;
    }

    try {
        await navigator.clipboard.writeText(texto);
        return true;
    } catch {
        const area = document.createElement('textarea');
        area.value = texto;
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        area.remove();
        return true;
    }
}

function atualizarBotao(botao, textoTemporario, textoOriginal) {
    if (!botao) return;
    botao.innerText = textoTemporario;
    setTimeout(() => {
        botao.innerText = textoOriginal;
    }, 1800);
}

btnPuxar?.addEventListener('click', async () => {
    const conteudo = inputLink.value.trim();
    if (!conteudo) return alert('Cole o link!');

    if (isShopeeLink(conteudo)) {
        const helper = document.getElementById('shopee-helper-box');
        if (helper) helper.style.display = 'block';

        displayProduto.value = displayProduto.value && displayProduto.value !== 'Buscando...'
            ? displayProduto.value
            : 'Oferta Shopee com desconto';
        displayDe.value = '';
        displayPor.value = '';
        displayCupom.value = displayCupom.value || '';

        alert('Link Shopee detectado. Deixei os campos prontos para edição manual.');
        return;
    }

    loader.style.display = 'flex';
    displayDe.value = 'R$ 0,00';
    displayPor.value = 'R$ 0,00';
    displayProduto.value = 'Buscando...';

    try {
        const urlMatch = conteudo.match(/https?:\/\/[^\s]+/);

        if (!urlMatch) {
            displayProduto.value = '';
            return alert('Não encontrei um link válido.');
        }

        const urlAlvo = urlMatch[0];
        const query = `https://api.microlink.io?url=${encodeURIComponent(urlAlvo)}&data.amz_por_r.selector=.a-price-whole&data.amz_por_c.selector=.a-price-fraction&data.amz_de.selector=.basisPrice .a-offscreen,.a-text-strike&data.ml_de_r.selector=.andes-money-amount--previous .andes-money-amount__fraction&data.ml_de_c.selector=.andes-money-amount--previous .andes-money-amount__cents&data.ml_por_r.selector=.andes-money-amount--cents-superscript .andes-money-amount__fraction,.ui-pdp-price--size-large .andes-money-amount__fraction&data.ml_por_c.selector=.andes-money-amount--cents-superscript .andes-money-amount__cents,.ui-pdp-price--size-large .andes-money-amount__cents&prerender=true`;

        const res = await fetch(query);
        const json = await res.json();

        if (json.data) {
            displayProduto.value = limparTituloProduto(json.data.title || '') || 'Produto encontrado';

            let vPor = 'R$ 0,00';
            let vDe = 'R$ 0,00';

            if (json.data.amz_por_r) {
                const rNum = parseInt(json.data.amz_por_r.toString().replace(/\D/g, ''));
                const c = json.data.amz_por_c ? json.data.amz_por_c.toString().replace(/\D/g, '') : '00';
                vPor = 'R$ ' + rNum.toLocaleString('pt-BR') + ',' + c;

                if (json.data.amz_de) {
                    const pDeStr = json.data.amz_de.toString();
                    const pDeNum = parseFloat(pDeStr.match(/[\d,.]+/)?.[0].replace(/\./g, '').replace(',', '.') || 0);
                    vDe = 'R$ ' + pDeNum.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                }
            } else if (json.data.ml_por_r || json.data.ml_de_r) {
                if (json.data.ml_por_r) {
                    const rNum = parseInt(json.data.ml_por_r.toString().replace(/\D/g, ''));
                    const c = json.data.ml_por_c ? json.data.ml_por_c.toString().replace(/\D/g, '') : '00';
                    vPor = 'R$ ' + rNum.toLocaleString('pt-BR') + ',' + c;
                }

                if (json.data.ml_de_r) {
                    const rNum = parseInt(json.data.ml_de_r.toString().replace(/\D/g, ''));
                    const c = json.data.ml_de_c ? json.data.ml_de_c.toString().replace(/\D/g, '') : '00';
                    vDe = 'R$ ' + rNum.toLocaleString('pt-BR') + ',' + c;
                }
            }

            if (vPor === 'R$ 0,00' && json.data.price) {
                vPor = 'R$ ' + Number(json.data.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
            }

            displayPor.value = vPor;
            displayDe.value = vDe;
        }
    } catch (e) {
        console.log('Erro no processamento:', e);
        alert('Não consegui puxar tudo automático. Você pode preencher produto e preço manualmente.');
    } finally {
        loader.style.display = 'none';
    }
});

if (btnGerar) {
    btnGerar.onclick = () => {
        if (!displayProduto.value || displayProduto.value === 'Buscando...') {
            alert('Puxe os dados primeiro ou preencha o produto manualmente!');
            return;
        }

        setMensagem(montarMensagem());
        atualizarBotao(btnGerar, '✅ Mensagem gerada', '🤖 Gerar mensagem com IA');
    };
}

if (btnCopiar) {
    btnCopiar.onclick = async () => {
        const texto = obterMensagemAtual() || ultimaMensagemGerada;
        const copiou = await copiarParaAreaDeTransferencia(texto);

        if (copiou) {
            atualizarBotao(btnCopiar, '✅ Copiado', '📋 Copiar texto');
        }
    };
}

btnSalvar?.addEventListener('click', () => {
    const texto = obterMensagemAtual() || ultimaMensagemGerada || montarMensagem();

    if (!texto) {
        alert('Nada para salvar!');
        return;
    }

    ofertasSet.unshift({
        id: Date.now(),
        texto,
        criadoEm: new Date().toISOString()
    });

    salvarOfertas();
    renderizarOfertas();
    atualizarBotao(btnSalvar, '✅ Salvo na fila', '💾 Salvar na fila');
});

btnEnviarAtualRobo?.addEventListener('click', () => {
    const texto = obterMensagemAtual() || ultimaMensagemGerada;

    if (!texto) {
        alert('Gere uma mensagem primeiro!');
        return;
    }

    enviarMensagensParaRobo([texto], btnEnviarAtualRobo, '🚀 Enviar atual ao robô');
});

btnEnviarTodasRobo?.addEventListener('click', () => {
    const mensagens = ofertasSet.map(oferta => oferta.texto).filter(Boolean);

    if (!mensagens.length) {
        alert('Não tem ofertas salvas para enviar.');
        return;
    }

    if (!confirm(`Enviar ${mensagens.length} oferta(s) para o robô?`)) return;

    enviarMensagensParaRobo(mensagens, btnEnviarTodasRobo, '🚀 Enviar todas ao robô');
});

btnAbrirPainelBot?.addEventListener('click', () => {
    if (window.AchouLevouBotQueue?.openPanel) {
        window.AchouLevouBotQueue.openPanel();
        return;
    }

    alert('Painel do bot ainda está carregando. Tente novamente em alguns segundos.');
});

btnLimparOfertas?.addEventListener('click', () => {
    if (!ofertasSet.length) {
        alert('A fila já está vazia.');
        return;
    }

    if (confirm('Tem certeza que deseja excluir todas as ofertas salvas?')) {
        ofertasSet = [];
        salvarOfertas();
        renderizarOfertas();
    }
});

btnLimparCampos?.addEventListener('click', () => {
    if (confirm('Deseja limpar os campos da oferta atual?')) {
        inputLink.value = '';
        displayProduto.value = '';
        displayDe.value = '';
        displayPor.value = '';
        displayCupom.value = '';
        ultimaMensagemGerada = '';
        window.__ultimaMensagemAchouLevou = '';
        if (messageBox) messageBox.innerText = 'Aguardando geração...';
    }
});

function resumoOferta(texto, index) {
    const linhas = String(texto || '').split('\n').map(l => l.trim()).filter(Boolean);
    const titulo = linhas[0]
        ?.replace(/[*_~`]/g, '')
        ?.replace(/^[^\wÀ-ÿ]+/, '')
        ?.slice(0, 70) || `Oferta ${index + 1}`;

    const preco = texto.match(/POR APENAS:\s*([^*\n]+)/i)?.[1]?.trim() ||
        texto.match(/Por apenas:\s*([^*\n]+)/i)?.[1]?.trim() ||
        '';

    const loja = texto.match(/Link\s+([^:]+):/i)?.[1]?.replace(/\*/g, '').trim() || 'Loja';

    return { titulo, preco, loja };
}

function renderizarOfertas() {
    if (!listaSalvas) return;

    listaSalvas.innerHTML = '';

    const totalLabel = document.getElementById('total-ofertas');
    if (totalLabel) {
        totalLabel.innerText = `${ofertasSet.length} salva(s)`;
    }

    if (!ofertasSet.length) {
        listaSalvas.innerHTML = '<div class="empty-state">Nenhuma oferta salva ainda.</div>';
        return;
    }

    ofertasSet.forEach((oferta, index) => {
        const resumo = resumoOferta(oferta.texto, index);
        const div = document.createElement('article');
        div.className = 'saved-card';

        const topo = document.createElement('div');
        topo.className = 'saved-card-top';

        const info = document.createElement('div');
        const titulo = document.createElement('strong');
        titulo.textContent = resumo.titulo;

        const meta = document.createElement('small');
        meta.textContent = [resumo.loja, resumo.preco].filter(Boolean).join(' • ');

        info.appendChild(titulo);
        info.appendChild(meta);

        const ordem = document.createElement('span');
        ordem.className = 'saved-index';
        ordem.textContent = String(index + 1).padStart(2, '0');

        topo.appendChild(info);
        topo.appendChild(ordem);

        const pre = document.createElement('pre');
        pre.textContent = oferta.texto;

        const actions = document.createElement('div');
        actions.className = 'saved-actions';

        const btnEnviar = document.createElement('button');
        btnEnviar.type = 'button';
        btnEnviar.className = 'btn-small primary';
        btnEnviar.textContent = 'Enviar ao robô';
        btnEnviar.addEventListener('click', () => {
            enviarMensagensParaRobo([oferta.texto], btnEnviar, 'Enviar ao robô');
        });

        const btnCopiarCard = document.createElement('button');
        btnCopiarCard.type = 'button';
        btnCopiarCard.className = 'btn-small neutral';
        btnCopiarCard.textContent = 'Copiar';
        btnCopiarCard.addEventListener('click', async () => {
            const copiou = await copiarParaAreaDeTransferencia(oferta.texto);
            if (copiou) atualizarBotao(btnCopiarCard, 'Copiado', 'Copiar');
        });

        const btnExcluir = document.createElement('button');
        btnExcluir.type = 'button';
        btnExcluir.className = 'btn-small danger';
        btnExcluir.textContent = 'Excluir';
        btnExcluir.addEventListener('click', () => apagarOferta(oferta.id));

        actions.appendChild(btnEnviar);
        actions.appendChild(btnCopiarCard);
        actions.appendChild(btnExcluir);

        div.appendChild(topo);
        div.appendChild(pre);
        div.appendChild(actions);

        listaSalvas.appendChild(div);
    });
}

function apagarOferta(id) {
    if (confirm('Deseja excluir esta oferta?')) {
        ofertasSet = ofertasSet.filter(o => o.id !== id);
        salvarOfertas();
        renderizarOfertas();
    }
}

async function enviarMensagensParaRobo(mensagens, botao, textoOriginal) {
    try {
        if (!window.AchouLevouBotQueue?.sendMessages) {
            throw new Error('Integração do robô ainda não carregou.');
        }

        if (botao) {
            botao.disabled = true;
            botao.innerText = 'Enviando...';
        }

        const json = await window.AchouLevouBotQueue.sendMessages(mensagens);
        const adicionadas = json?.added ?? mensagens.length;

        if (botao) {
            atualizarBotao(botao, `✅ Enviado (${adicionadas})`, textoOriginal);
        }

        alert(`Oferta(s) enviada(s) para a fila do robô: ${adicionadas}`);
    } catch (error) {
        alert(`Erro ao enviar para o robô: ${error.message}`);
        if (botao) botao.innerText = textoOriginal;
    } finally {
        if (botao) botao.disabled = false;
    }
}
