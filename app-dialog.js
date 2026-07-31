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

            #btn-limpar-ofertas-salvas {
                margin-top: 10px;
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

    function prepararBotoesLimpeza() {
        const btnCampos = document.getElementById('btn-limpar-campos');
        if (!btnCampos) return;

        btnCampos.innerText = '🧽 LIMPAR CAMPOS DA TELA';
        btnCampos.title = 'Limpa apenas o formulário atual';

        if (document.getElementById('btn-limpar-ofertas-salvas')) return;

        const btnHistorico = document.createElement('button');
        btnHistorico.id = 'btn-limpar-ofertas-salvas';
        btnHistorico.className = 'red-btn';
        btnHistorico.type = 'button';
        btnHistorico.innerText = '🧹 APAGAR OFERTAS SALVAS';
        btnHistorico.title = 'Apaga todas as ofertas do histórico';

        btnCampos.insertAdjacentElement('afterend', btnHistorico);
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

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', prepararBotoesLimpeza);
    } else {
        prepararBotoesLimpeza();
    }

    document.addEventListener('click', async event => {
        const botao = event.target.closest('button');
        if (!botao) return;

        const isDeleteOffer = botao.dataset && botao.dataset.rm;
        const isClearSavedOffers = botao.id === 'btn-limpar-ofertas-salvas';
        const isClearHistory = botao.innerText?.toLowerCase().includes('limpar histórico') || isClearSavedOffers;
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
                badge: '🧹 Ofertas salvas',
                title: 'Apagar todas as ofertas salvas?',
                message: 'Isso vai limpar todos os cards do histórico no celular. Os campos da tela atual não serão alterados.',
                okText: 'Apagar ofertas',
                cancelText: 'Cancelar'
            });
            if (ok) limparHistorico();
            return;
        }

        if (isClearFields) {
            const ok = await appConfirm({
                badge: '🧽 Limpar campos',
                title: 'Limpar somente os campos?',
                message: 'Isso apaga o link, produto, preços, cupom e prévia da mensagem. As ofertas salvas continuam no histórico.',
                okText: 'Limpar campos',
                cancelText: 'Cancelar'
            });
            if (ok) limparCampos();
        }
    }, true);
})();

(() => {
    const STYLE_ID = 'achou-levou-theme-light-v84';
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        body.dark {
            color-scheme: dark;
        }

        body:not(.dark) {
            --v2-bg: #edf6fb;
            --v2-panel: #f4f9fd;
            --v2-panel2: #ffffff;
            --v2-line: #c9d9e7;
            --v2-cyan: #0f766e;
            --v2-blue: #0284c7;
            --v2-green: #059669;
            --v2-purple: #7c3aed;
            --v2-red: #dc2626;
            --v2-text: #102033;
            --v2-muted: #607286;
            color-scheme: light;
            color: var(--v2-text) !important;
            background:
                radial-gradient(circle at 12% 0, rgba(20, 184, 166, .13), transparent 28%),
                radial-gradient(circle at 92% 8%, rgba(56, 189, 248, .12), transparent 25%),
                var(--v2-bg) !important;
        }

        body:not(.dark) .app-header {
            background: linear-gradient(145deg, rgba(255, 255, 255, .98), rgba(239, 247, 252, .98));
            border-color: var(--v2-line);
            box-shadow: 0 18px 48px rgba(30, 64, 92, .12);
        }

        body:not(.dark) .icon-action,
        body:not(.dark) .theme-toggle,
        body:not(.dark) .v2-qr-btn {
            background: #ffffff !important;
            color: var(--v2-text) !important;
            border-color: var(--v2-line) !important;
        }

        body:not(.dark) .v2-nav button {
            color: var(--v2-muted);
        }

        body:not(.dark) .v2-nav button.active {
            color: var(--v2-cyan);
            background: rgba(15, 118, 110, .09);
        }

        body:not(.dark) .v2-metric,
        body:not(.dark) .v2-progress,
        body:not(.dark) .v2-live-queue,
        body:not(.dark) .v2-robot-card,
        body:not(.dark) .v2-current-card {
            background: linear-gradient(145deg, #ffffff, #edf5fb);
            border-color: var(--v2-line);
            box-shadow: 0 14px 38px rgba(30, 64, 92, .10);
        }

        body:not(.dark) .card {
            background: linear-gradient(145deg, #ffffff, #f0f7fc) !important;
            border-color: var(--v2-line) !important;
            box-shadow: 0 14px 36px rgba(30, 64, 92, .10) !important;
        }

        body:not(.dark) .v2-progress-track {
            background: #dceaf4;
            border-color: #bfd1df;
        }

        body:not(.dark) .v2-queue-item {
            background: #f8fbfe;
            border-color: var(--v2-line);
        }

        body:not(.dark) .v2-queue-item.is-sent {
            background: #eefbf5;
            border-color: rgba(5, 150, 105, .28);
        }

        body:not(.dark) .v2-queue-item.has-error {
            background: #fff3f5;
            border-color: rgba(220, 38, 38, .28);
        }

        body:not(.dark) .v2-queue-empty {
            background: rgba(255, 255, 255, .55);
        }

        body:not(.dark) input,
        body:not(.dark) select,
        body:not(.dark) textarea,
        body:not(.dark) .message-editor {
            background: #ffffff !important;
            color: var(--v2-text) !important;
            border-color: var(--v2-line) !important;
        }

        body:not(.dark) input::placeholder,
        body:not(.dark) textarea::placeholder {
            color: #8191a3;
        }

        body:not(.dark) .v2-current-empty strong {
            color: var(--v2-text);
        }

        body,
        .app-header,
        .card,
        .v2-metric,
        .v2-progress,
        .v2-live-queue,
        .v2-robot-card,
        .v2-current-card,
        .v2-queue-item,
        input,
        select,
        textarea,
        .message-editor {
            transition: background .25s ease, color .25s ease, border-color .25s ease, box-shadow .25s ease;
        }
    `;

    document.head.appendChild(style);
})();
