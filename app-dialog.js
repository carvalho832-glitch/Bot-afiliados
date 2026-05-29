(() => {
    const STORAGE_OFERTAS = 'ofertas_achou_levou';
    const alertOriginal = window.alert?.bind(window);

    function criarModal() {
        if (document.getElementById('app-confirm-overlay')) return;

        const style = document.createElement('style');
        style.textContent = `
            .app-confirm-overlay {
                align-items: center;
                background: rgba(2, 6, 23, 0.78);
                backdrop-filter: blur(8px);
                display: none;
                inset: 0;
                justify-content: center;
                padding: 18px;
                position: fixed;
                z-index: 99999;
            }

            .app-confirm-overlay.active {
                display: flex;
            }

            .app-confirm-card {
                background:
                    radial-gradient(circle at top left, rgba(249, 115, 22, 0.18), transparent 12rem),
                    var(--card, #161b22);
                border: 1px solid var(--border, #30363d);
                border-radius: 24px;
                box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
                color: var(--text, #e6edf3);
                max-width: 360px;
                overflow: hidden;
                padding: 20px;
                position: relative;
                transform: scale(0.96);
                transition: transform 0.16s ease;
                width: 100%;
            }

            .app-confirm-overlay.active .app-confirm-card {
                transform: scale(1);
            }

            .app-confirm-badge {
                align-items: center;
                background: rgba(249, 115, 22, 0.12);
                border: 1px solid rgba(249, 115, 22, 0.28);
                border-radius: 999px;
                color: var(--primary, #f97316);
                display: inline-flex;
                font-size: 12px;
                font-weight: 900;
                gap: 8px;
                margin-bottom: 14px;
                padding: 8px 12px;
                text-transform: uppercase;
            }

            .app-confirm-title {
                color: var(--text, #e6edf3);
                font-size: 21px;
                font-weight: 900;
                line-height: 1.15;
                margin: 0 0 8px;
            }

            .app-confirm-message {
                color: var(--muted, #8b949e);
                font-size: 14px;
                font-weight: 700;
                line-height: 1.45;
                margin: 0 0 16px;
                white-space: pre-wrap;
            }

            .app-confirm-actions {
                display: grid;
                gap: 10px;
                grid-template-columns: 1fr 1fr;
            }

            .app-confirm-actions.single-action {
                grid-template-columns: 1fr;
            }

            .app-confirm-actions button {
                border: 0;
                border-radius: 13px;
                color: #ffffff;
                font-size: 14px;
                font-weight: 900;
                margin: 0;
                padding: 14px 12px;
                width: 100%;
            }

            .app-confirm-cancel {
                background: linear-gradient(135deg, #64748b, #475569);
            }

            .app-confirm-ok {
                background: linear-gradient(135deg, #ef4444, #dc2626);
            }

            .app-confirm-ok.success {
                background: linear-gradient(135deg, #22c55e, #16a34a);
            }

            .app-confirm-ok.info {
                background: linear-gradient(135deg, #2563eb, #4f46e5);
            }
        `;

        const overlay = document.createElement('div');
        overlay.id = 'app-confirm-overlay';
        overlay.className = 'app-confirm-overlay';
        overlay.innerHTML = `
            <div class="app-confirm-card" role="dialog" aria-modal="true" aria-labelledby="app-confirm-title">
                <div class="app-confirm-badge" id="app-confirm-badge">⚠️ Confirmação</div>
                <h3 class="app-confirm-title" id="app-confirm-title">Tem certeza?</h3>
                <p class="app-confirm-message" id="app-confirm-message">Essa ação não pode ser desfeita.</p>
                <div class="app-confirm-actions" id="app-confirm-actions">
                    <button type="button" class="app-confirm-cancel" id="app-confirm-cancel">Cancelar</button>
                    <button type="button" class="app-confirm-ok" id="app-confirm-ok">Apagar</button>
                </div>
            </div>`;

        document.head.appendChild(style);
        document.body.appendChild(overlay);
    }

    function appConfirm({ badge = '⚠️ Confirmação', title = 'Tem certeza?', message = 'Essa ação não pode ser desfeita.', okText = 'Apagar', cancelText = 'Cancelar', mode = 'danger', showCancel = true } = {}) {
        criarModal();

        const overlay = document.getElementById('app-confirm-overlay');
        const badgeEl = document.getElementById('app-confirm-badge');
        const titleEl = document.getElementById('app-confirm-title');
        const messageEl = document.getElementById('app-confirm-message');
        const actionsEl = document.getElementById('app-confirm-actions');
        const okBtn = document.getElementById('app-confirm-ok');
        const cancelBtn = document.getElementById('app-confirm-cancel');

        badgeEl.innerText = badge;
        titleEl.innerText = title;
        messageEl.innerText = message;
        okBtn.innerText = okText;
        cancelBtn.innerText = cancelText;

        okBtn.className = `app-confirm-ok ${mode === 'success' ? 'success' : mode === 'info' ? 'info' : ''}`.trim();
        cancelBtn.style.display = showCancel ? 'block' : 'none';
        actionsEl.classList.toggle('single-action', !showCancel);

        overlay.classList.add('active');

        return new Promise(resolve => {
            function fechar(valor) {
                overlay.classList.remove('active');
                okBtn.onclick = null;
                cancelBtn.onclick = null;
                overlay.onclick = null;
                document.removeEventListener('keydown', escHandler);
                resolve(valor);
            }

            function escHandler(event) {
                if (event.key === 'Escape') fechar(false);
            }

            okBtn.onclick = () => fechar(true);
            cancelBtn.onclick = () => fechar(false);
            overlay.onclick = event => {
                if (event.target === overlay && showCancel) fechar(false);
            };
            document.addEventListener('keydown', escHandler);
        });
    }

    function tipoAlerta(mensagem) {
        const texto = mensagem.toLowerCase();
        if (texto.includes('salv') || texto.includes('copiad') || texto.includes('sucesso')) return 'success';
        if (texto.includes('erro') || texto.includes('falha') || texto.includes('não consegui') || texto.includes('inválido')) return 'danger';
        return 'info';
    }

    function tituloAlerta(mensagem, tipo) {
        const texto = mensagem.toLowerCase();
        if (texto.includes('salv')) return 'Oferta salva!';
        if (texto.includes('copiad')) return 'Copiado com sucesso!';
        if (texto.includes('link')) return 'Atenção ao link';
        if (tipo === 'danger') return 'Ops, algo não saiu como esperado';
        return 'Aviso do Achou Levou';
    }

    async function appAlert(mensagem = '') {
        const texto = String(mensagem || '').trim() || 'Tudo certo.';
        const tipo = tipoAlerta(texto);

        return appConfirm({
            badge: tipo === 'success' ? '✅ Achou Levou' : tipo === 'danger' ? '⚠️ Achou Levou' : 'ℹ️ Achou Levou',
            title: tituloAlerta(texto, tipo),
            message: texto,
            okText: 'OK',
            mode: tipo === 'success' ? 'success' : tipo === 'danger' ? 'danger' : 'info',
            showCancel: false
        });
    }

    function getOfertas() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_OFERTAS)) || [];
        } catch {
            return [];
        }
    }

    function setOfertas(ofertas) {
        localStorage.setItem(STORAGE_OFERTAS, JSON.stringify(ofertas));
    }

    function limparCampos() {
        const ids = ['input-link', 'display-produto', 'display-de', 'display-por', 'display-cupom'];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });

        const preview = document.getElementById('msg-preview');
        if (preview) preview.innerText = 'Aguardando geração...';

        window.__produtoImagemAtual = '';
        const imgPreview = document.getElementById('product-image-preview');
        if (imgPreview) imgPreview.style.display = 'none';
    }

    function removerOfertaPorId(id, botao) {
        const ofertas = getOfertas().filter(oferta => Number(oferta.id) !== Number(id));
        setOfertas(ofertas);

        const card = botao.closest('.saved-card');
        if (card) card.remove();

        const lista = document.getElementById('lista-salvas');
        if (lista && !lista.querySelector('.saved-card')) {
            lista.innerHTML = '<div class="empty-state">Nenhuma oferta salva ainda.</div>';
        }
    }

    function limparHistorico() {
        setOfertas([]);
        const lista = document.getElementById('lista-salvas');
        if (lista) lista.innerHTML = '<div class="empty-state">Nenhuma oferta salva ainda.</div>';

        const painel = document.getElementById('bulk-send-panel');
        if (painel) painel.style.display = 'none';
    }

    window.appConfirm = appConfirm;
    window.appAlert = appAlert;
    window.alert = mensagem => {
        try {
            appAlert(mensagem);
        } catch (erro) {
            if (alertOriginal) alertOriginal(mensagem);
        }
    };

    document.addEventListener('click', async event => {
        const botao = event.target.closest('button');
        if (!botao) return;

        const isDeleteOffer = botao.dataset && botao.dataset.rm;
        const isClearHistory = botao.innerText?.toLowerCase().includes('limpar histórico');
        const isClearFields = botao.id === 'btn-limpar-campos';

        if (!isDeleteOffer && !isClearHistory && !isClearFields) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        if (isDeleteOffer) {
            const ok = await appConfirm({
                badge: '🗑️ Remover oferta',
                title: 'Apagar esta oferta?',
                message: 'Ela será removida do seu histórico salvo no celular.',
                okText: 'Sim, apagar',
                cancelText: 'Manter'
            });
            if (ok) removerOfertaPorId(botao.dataset.rm, botao);
            return;
        }

        if (isClearHistory) {
            const ok = await appConfirm({
                badge: '🧹 Limpar histórico',
                title: 'Apagar todas as ofertas?',
                message: 'Seu histórico salvo no celular ficará vazio. Essa ação não pode ser desfeita.',
                okText: 'Limpar tudo',
                cancelText: 'Cancelar'
            });
            if (ok) limparHistorico();
            return;
        }

        if (isClearFields) {
            const ok = await appConfirm({
                badge: '🧽 Limpar campos',
                title: 'Limpar a tela atual?',
                message: 'O link, produto, preços, cupom e prévia da mensagem serão apagados.',
                okText: 'Limpar',
                cancelText: 'Cancelar'
            });
            if (ok) limparCampos();
        }
    }, true);
})();
