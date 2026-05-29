(() => {
    const STORAGE_OFERTAS = 'ofertas_achou_levou';
    const listaSalvas = document.getElementById('lista-salvas');
    const sectionTitle = document.querySelector('.section-title');

    if (!listaSalvas || !sectionTitle) return;

    let filaEnvio = [];
    let indiceAtual = 0;

    function getOfertas() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_OFERTAS)) || [];
        } catch {
            return [];
        }
    }

    function abrirWhatsApp(texto) {
        if (!texto || !texto.trim()) {
            alert('Selecione pelo menos uma mensagem.');
            return;
        }

        window.open(`https://wa.me/?text=${encodeURIComponent(texto.trim())}`, '_blank');
    }

    function criarControles() {
        if (document.getElementById('bulk-whatsapp-bar')) return;

        const barra = document.createElement('div');
        barra.id = 'bulk-whatsapp-bar';
        barra.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 12px;width:100%;';

        barra.innerHTML = `
            <button id="btn-select-all-offers" type="button" style="flex:1;min-width:130px;margin:0;padding:10px;border-radius:10px;background:#2563eb;color:#fff;font-size:12px;font-weight:800;">☑️ Selecionar tudo</button>
            <button id="btn-send-selected-wa" type="button" style="flex:1;min-width:170px;margin:0;padding:10px;border-radius:10px;background:#16a34a;color:#fff;font-size:12px;font-weight:800;">💬 Enviar uma por vez</button>
            <button id="btn-clear-selection" type="button" style="flex:1;min-width:130px;margin:0;padding:10px;border-radius:10px;background:#64748b;color:#fff;font-size:12px;font-weight:800;">❌ Limpar seleção</button>`;

        const savedSection = document.querySelector('.saved-section');
        if (savedSection) savedSection.insertBefore(barra, listaSalvas);

        const painel = document.createElement('div');
        painel.id = 'bulk-send-panel';
        painel.style.cssText = 'display:none;margin:0 0 12px;padding:12px;border:1px solid var(--border);border-radius:14px;background:var(--card);box-shadow:var(--shadow);';
        painel.innerHTML = `
            <div id="bulk-send-status" style="font-size:13px;font-weight:800;color:var(--text);margin-bottom:8px;">Fila de envio</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button id="btn-open-current-wa" type="button" style="flex:1;min-width:150px;margin:0;padding:10px;border-radius:10px;background:#16a34a;color:#fff;font-size:12px;font-weight:800;">💬 Abrir oferta atual</button>
                <button id="btn-next-wa" type="button" style="flex:1;min-width:120px;margin:0;padding:10px;border-radius:10px;background:#f97316;color:#fff;font-size:12px;font-weight:800;">➡️ Próxima</button>
                <button id="btn-cancel-wa-queue" type="button" style="flex:1;min-width:100px;margin:0;padding:10px;border-radius:10px;background:#dc2626;color:#fff;font-size:12px;font-weight:800;">Cancelar</button>
            </div>
            <small style="display:block;margin-top:8px;color:var(--muted);font-weight:700;line-height:1.4;">Toque em abrir, envie no WhatsApp, volte aqui e toque em próxima. Assim cada oferta sai em uma mensagem separada.</small>`;

        if (savedSection) savedSection.insertBefore(painel, listaSalvas);

        document.getElementById('btn-select-all-offers')?.addEventListener('click', () => {
            const checks = [...document.querySelectorAll('.bulk-offer-check')];
            const todosMarcados = checks.length && checks.every(c => c.checked);
            checks.forEach(c => c.checked = !todosMarcados);
            atualizarContador();
        });

        document.getElementById('btn-clear-selection')?.addEventListener('click', () => {
            document.querySelectorAll('.bulk-offer-check').forEach(c => c.checked = false);
            filaEnvio = [];
            indiceAtual = 0;
            painel.style.display = 'none';
            atualizarContador();
        });

        document.getElementById('btn-send-selected-wa')?.addEventListener('click', () => {
            prepararFilaSelecionada();
        });

        document.getElementById('btn-open-current-wa')?.addEventListener('click', () => {
            const item = filaEnvio[indiceAtual];
            if (!item) {
                alert('Nenhuma oferta na fila.');
                return;
            }
            abrirWhatsApp(item.texto || item);
        });

        document.getElementById('btn-next-wa')?.addEventListener('click', () => {
            if (!filaEnvio.length) return;

            if (indiceAtual < filaEnvio.length - 1) {
                indiceAtual++;
                atualizarPainelFila();
                abrirWhatsApp(filaEnvio[indiceAtual].texto || filaEnvio[indiceAtual]);
            } else {
                alert('Você chegou na última oferta selecionada.');
            }
        });

        document.getElementById('btn-cancel-wa-queue')?.addEventListener('click', () => {
            filaEnvio = [];
            indiceAtual = 0;
            painel.style.display = 'none';
        });
    }

    function prepararFilaSelecionada() {
        const ids = [...document.querySelectorAll('.bulk-offer-check:checked')]
            .map(c => Number(c.dataset.id));

        if (!ids.length) {
            alert('Selecione pelo menos uma oferta para enviar.');
            return;
        }

        const ofertas = getOfertas();
        filaEnvio = ids
            .map(id => ofertas.find(o => Number(o.id) === id))
            .filter(Boolean);

        if (!filaEnvio.length) {
            alert('Não encontrei as ofertas selecionadas.');
            return;
        }

        indiceAtual = 0;
        document.getElementById('bulk-send-panel').style.display = 'block';
        atualizarPainelFila();
        abrirWhatsApp(filaEnvio[0].texto || filaEnvio[0]);
    }

    function atualizarPainelFila() {
        const status = document.getElementById('bulk-send-status');
        const btnNext = document.getElementById('btn-next-wa');
        const btnOpen = document.getElementById('btn-open-current-wa');

        if (!status) return;

        const atual = filaEnvio[indiceAtual];
        const nome = atual?.produto || 'Oferta selecionada';
        status.innerText = `Oferta ${indiceAtual + 1} de ${filaEnvio.length}: ${nome}`;

        if (btnNext) btnNext.innerText = indiceAtual < filaEnvio.length - 1 ? '➡️ Próxima' : '✅ Finalizar';
        if (btnOpen) btnOpen.innerText = `💬 Abrir oferta ${indiceAtual + 1}`;
    }

    function atualizarContador() {
        const btn = document.getElementById('btn-send-selected-wa');
        if (!btn) return;

        const total = document.querySelectorAll('.bulk-offer-check:checked').length;
        btn.innerText = total ? `💬 Enviar ${total} uma por vez` : '💬 Enviar uma por vez';
    }

    function aplicarCheckboxNosCards() {
        const cards = [...listaSalvas.querySelectorAll('.saved-card')];

        cards.forEach(card => {
            if (card.querySelector('.bulk-offer-check')) return;

            const botaoReferencia = card.querySelector('[data-copy], [data-wa], [data-rm]');
            const id = botaoReferencia?.dataset.copy || botaoReferencia?.dataset.wa || botaoReferencia?.dataset.rm;
            if (!id) return;

            const label = document.createElement('label');
            label.style.cssText = 'display:flex;align-items:center;gap:8px;margin:0 0 10px 0;color:var(--muted);font-size:12px;font-weight:800;';
            label.innerHTML = `<input class="bulk-offer-check" type="checkbox" data-id="${id}" style="width:18px;height:18px;accent-color:#16a34a;"> Selecionar esta oferta`;

            card.insertBefore(label, card.firstChild);
        });
    }

    listaSalvas.addEventListener('change', (e) => {
        if (e.target.classList.contains('bulk-offer-check')) atualizarContador();
    });

    const observer = new MutationObserver(() => {
        aplicarCheckboxNosCards();
        atualizarContador();
    });

    criarControles();
    aplicarCheckboxNosCards();

    observer.observe(listaSalvas, {
        childList: true,
        subtree: true
    });
})();
