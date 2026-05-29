(() => {
    const STORAGE_OFERTAS = 'ofertas_achou_levou';
    const listaSalvas = document.getElementById('lista-salvas');
    const sectionTitle = document.querySelector('.section-title');

    if (!listaSalvas || !sectionTitle) return;

    function getOfertas() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_OFERTAS)) || [];
        } catch {
            return [];
        }
    }

    function abrirWhatsApp(texto) {
        if (!texto.trim()) {
            alert('Selecione pelo menos uma mensagem.');
            return;
        }

        const textoFinal = texto.trim();
        const textoCodificado = encodeURIComponent(textoFinal);

        if (textoCodificado.length > 6500) {
            alert('Você selecionou muitas mensagens. Tente enviar menos ofertas por vez para o WhatsApp abrir certinho.');
            return;
        }

        window.open(`https://wa.me/?text=${textoCodificado}`, '_blank');
    }

    function criarControles() {
        if (document.getElementById('bulk-whatsapp-bar')) return;

        const barra = document.createElement('div');
        barra.id = 'bulk-whatsapp-bar';
        barra.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 12px;width:100%;';

        barra.innerHTML = `
            <button id="btn-select-all-offers" type="button" style="flex:1;min-width:130px;margin:0;padding:10px;border-radius:10px;background:#2563eb;color:#fff;font-size:12px;font-weight:800;">☑️ Selecionar tudo</button>
            <button id="btn-send-selected-wa" type="button" style="flex:1;min-width:170px;margin:0;padding:10px;border-radius:10px;background:#16a34a;color:#fff;font-size:12px;font-weight:800;">💬 Enviar selecionadas</button>
            <button id="btn-clear-selection" type="button" style="flex:1;min-width:130px;margin:0;padding:10px;border-radius:10px;background:#64748b;color:#fff;font-size:12px;font-weight:800;">❌ Limpar seleção</button>`;

        const savedSection = document.querySelector('.saved-section');
        if (savedSection) savedSection.insertBefore(barra, listaSalvas);

        document.getElementById('btn-select-all-offers')?.addEventListener('click', () => {
            const checks = [...document.querySelectorAll('.bulk-offer-check')];
            const todosMarcados = checks.length && checks.every(c => c.checked);
            checks.forEach(c => c.checked = !todosMarcados);
            atualizarContador();
        });

        document.getElementById('btn-clear-selection')?.addEventListener('click', () => {
            document.querySelectorAll('.bulk-offer-check').forEach(c => c.checked = false);
            atualizarContador();
        });

        document.getElementById('btn-send-selected-wa')?.addEventListener('click', () => {
            const ids = [...document.querySelectorAll('.bulk-offer-check:checked')]
                .map(c => Number(c.dataset.id));

            if (!ids.length) {
                alert('Selecione pelo menos uma oferta para enviar.');
                return;
            }

            const ofertas = getOfertas();
            const selecionadas = ids
                .map(id => ofertas.find(o => Number(o.id) === id))
                .filter(Boolean);

            const texto = selecionadas
                .map((oferta, index) => `*OFERTA ${index + 1}*\n\n${oferta.texto || oferta}`)
                .join('\n\n━━━━━━━━━━━━━━\n\n');

            abrirWhatsApp(texto);
        });
    }

    function atualizarContador() {
        const btn = document.getElementById('btn-send-selected-wa');
        if (!btn) return;

        const total = document.querySelectorAll('.bulk-offer-check:checked').length;
        btn.innerText = total ? `💬 Enviar ${total} selecionada${total > 1 ? 's' : ''}` : '💬 Enviar selecionadas';
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
