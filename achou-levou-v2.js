(function () {
  const q = selector => document.querySelector(selector);
  const el = (tag, className, html) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (html !== undefined) node.innerHTML = html;
    return node;
  };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);

  function config() {
    return window.AchouLevouBotQueue?.loadConfig?.() || {
      botUrl: 'https://bot.achoulevoubot.uk'
    };
  }

  const VERSION = '81';
  const ALVA = {
    idle: `assets/alva/alva-standby.mp4?v=${VERSION}`,
    analyzing: `assets/alva/alva-analisando.mp4?v=${VERSION}`,
    preparing: `assets/alva/alva-preparando.mp4?v=${VERSION}`,
    generating: `assets/alva/alva-gerando-ia.mp4?v=${VERSION}`,
    sending: `assets/alva/alva-enviando.mp4?v=${VERSION}`,
    success: `assets/alva/alva-sucesso.mp4?v=${VERSION}`,
    offline: `assets/alva/alva-offline.mp4?v=${VERSION}`
  };
  const LABELS = {
    idle: ['ALVA em stand-by', 'Aguardando para iniciar uma nova tarefa'],
    analyzing: ['ALVA analisando produto', 'Lendo e conferindo os dados da oferta'],
    preparing: ['ALVA preparando a oferta', 'Organizando as informações encontradas'],
    generating: ['ALVA gerando mensagem', 'Criando a mensagem com inteligência artificial'],
    sending: ['ALVA enviando ofertas', 'Distribuindo as mensagens para os grupos'],
    success: ['Missão concluída', 'A tarefa foi finalizada com sucesso'],
    offline: ['ALVA desconectada', 'Reconecte a sessão pelo QR Code']
  };

  let robotMode = 'idle';
  let temporaryTimer = null;
  let nextRun = null;
  let whatsappConnected = null;
  let apiOnline = null;
  let queueOnline = null;

  function mount() {
    const header = q('.app-header');
    const main = q('.main-flow');
    const saved = q('.saved-section');
    if (!header || !main || q('.v2-metrics')) return;

    const qr = el('button', 'v2-qr-btn', '▦ Visualizar QR Code');
    qr.type = 'button';
    qr.onclick = () => window.open(`${config().botUrl}/qr-page`, '_blank');
    q('.header-actions')?.prepend(qr);

    const nav = el(
      'div',
      'v2-nav',
      '<button class="active" data-target="top">⌂ Painel</button>' +
      '<button data-target="v2-live-queue">▤ Fila de ofertas</button>' +
      '<button data-target="v2-history">◉ Histórico</button>' +
      '<button>⚙ Configurações</button>' +
      '<button>⌁ Estatísticas</button>'
    );
    header.after(nav);

    const metrics = el(
      'section',
      'v2-metrics',
      '<article class="v2-metric"><small>Status do robô</small><strong id="v2-status">Verificando</strong><p>WhatsApp Web</p><i>⌁</i></article>' +
      '<article class="v2-metric"><small>Fila de ofertas</small><strong id="v2-fila">—</strong><p id="v2-fila-txt">Consultando fila</p><i>▤</i></article>' +
      '<article class="v2-metric"><small>Enviadas hoje</small><strong id="v2-hoje">—</strong><p>Ofertas concluídas hoje</p><i>➤</i></article>' +
      '<article class="v2-metric"><small>Próximo envio</small><strong id="v2-proximo">—</strong><p id="v2-proximo-txt">Aguardando dados</p><i>◷</i></article>'
    );
    nav.after(metrics);

    const progress = el(
      'section',
      'v2-progress',
      '<div class="v2-progress-top"><span>Progresso geral das ofertas</span><strong id="v2-progress-label">—</strong></div>' +
      '<div class="v2-progress-track"><div id="v2-progress-bar" class="v2-progress-bar"></div></div>' +
      '<small id="v2-progress-copy">Aguardando dados da fila</small>'
    );
    metrics.after(progress);

    const liveQueue = el(
      'section',
      'v2-live-queue',
      '<div class="v2-queue-head"><div><div class="v2-card-title">Fila real do robô</div>' +
      '<p id="v2-queue-summary">Consultando as ofertas do WhatsApp...</p></div>' +
      '<span id="v2-queue-badge">Carregando</span></div>' +
      '<div id="v2-queue-items" class="v2-queue-items"><div class="v2-queue-empty">Aguardando dados da fila...</div></div>'
    );
    progress.after(liveQueue);

    const workspace = el('section', 'v2-workspace');
    const left = el('div', 'v2-left');
    const right = el('aside', 'v2-right');
    main.parentNode.insertBefore(workspace, main);
    left.appendChild(main);
    workspace.append(left, right);

    right.innerHTML =
      '<section class="v2-robot-card"><div class="v2-card-title">Execução do robô</div>' +
      '<div class="v2-robot-stage" data-mode="idle"><div class="v2-video-glow"></div>' +
      '<video id="v2-alva-video" class="v2-alva-video" muted playsinline loop autoplay preload="auto">' +
      `<source src="${ALVA.idle}" type="video/mp4"></video>` +
      '<div class="v2-video-loading"><span></span><small>Carregando ALVA...</small></div></div>' +
      '<div class="v2-status-copy"><strong id="v2-robot-title">ALVA em stand-by</strong>' +
      '<span id="v2-robot-subtitle">Aguardando para iniciar uma nova tarefa</span></div>' +
      '<div id="v2-system" class="v2-system-ok">◌ Verificando sistema...</div></section>' +
      '<section class="v2-current-card"><div class="v2-card-title">Progresso atual</div>' +
      '<div class="v2-current-empty"><div class="v2-pulse">☷</div>' +
      '<strong id="v2-current-title">Nenhuma oferta em processamento</strong>' +
      '<p id="v2-current-copy">As ofertas aparecerão aqui quando o envio iniciar.</p></div></section>';

    if (saved) {
      saved.id = 'v2-history';
      workspace.after(saved);
    }

    nav.querySelectorAll('[data-target]').forEach(button => {
      button.addEventListener('click', () => {
        const target = button.dataset.target === 'top'
          ? document.body
          : q(`#${button.dataset.target}`);
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    preloadVideos();
    bindVisualStates();
    bindBotEvents();
    setRobot('idle');
    updateDiagnostic();
    window.AchouLevouBotQueue?.getOverview?.({ force: true });
    setInterval(tick, 1000);
  }

  function preloadVideos() {
    Object.values(ALVA).forEach(src => {
      const video = document.createElement('video');
      video.preload = 'auto';
      video.muted = true;
      video.src = src;
    });
  }

  function setRobot(mode, text, force = false) {
    const video = q('#v2-alva-video');
    const stage = q('.v2-robot-stage');
    const title = q('#v2-robot-title');
    const subtitle = q('#v2-robot-subtitle');
    if (!video || !stage || !title || !subtitle) return;

    const selected = ALVA[mode] ? mode : 'idle';
    if (selected !== robotMode || force) {
      robotMode = selected;
      stage.dataset.mode = selected;
      stage.classList.add('is-switching');
      const nextSrc = ALVA[selected];
      const probe = document.createElement('video');
      probe.muted = true;
      probe.playsInline = true;
      probe.preload = 'auto';
      probe.src = nextSrc;
      const swap = () => {
        video.src = nextSrc;
        video.load();
        video.play().catch(() => {});
        requestAnimationFrame(() => stage.classList.remove('is-switching'));
      };
      probe.addEventListener('canplay', swap, { once: true });
      probe.addEventListener('error', () => stage.classList.remove('is-switching'), { once: true });
    }

    const copy = LABELS[selected] || LABELS.idle;
    title.textContent = copy[0];
    subtitle.textContent = text || copy[1];
  }

  function temporaryState(mode, duration = 6500, next = 'idle') {
    clearTimeout(temporaryTimer);
    setRobot(mode);
    temporaryTimer = setTimeout(() => {
      if (robotMode === mode && whatsappConnected !== false) setRobot(next);
    }, duration);
  }

  function bindVisualStates() {
    q('#btn-puxar')?.addEventListener('click', () => {
      temporaryState('analyzing', 4200, 'preparing');
      setTimeout(() => {
        if (robotMode === 'preparing') temporaryState('preparing', 3500, 'idle');
      }, 4300);
    });
    q('#btn-gerar')?.addEventListener('click', () => temporaryState('generating', 8000, 'success'));
    q('#btn-salvar')?.addEventListener('click', () => temporaryState('success', 3500, 'idle'));
    q('#btn-enviar-atual-robo')?.addEventListener('click', () => temporaryState('sending', 9000, 'success'));
    q('#btn-enviar-todas-robo')?.addEventListener('click', () => temporaryState('sending', 9000, 'success'));

    const video = q('#v2-alva-video');
    video?.addEventListener('canplay', () => q('.v2-video-loading')?.classList.add('is-hidden'));
    video?.addEventListener('error', () => {
      const label = q('.v2-video-loading small');
      if (label) label.textContent = 'Vídeo da ALVA não encontrado';
      q('.v2-video-loading')?.classList.remove('is-hidden');
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) video?.play().catch(() => {});
    });
  }

  function bindBotEvents() {
    window.addEventListener('achoulevou:bot-status', event => {
      applyWhatsappStatus(event.detail || {});
    });
    window.addEventListener('achoulevou:bot-overview', event => {
      applyOverview(event.detail || {});
    });
  }

  function applyWhatsappStatus(status) {
    const output = q('#v2-status');
    if (!output) return;

    if (status.connected === true) {
      apiOnline = true;
      whatsappConnected = true;
      output.textContent = status.label || 'Conectado';
      output.style.color = 'var(--v2-green)';
      if (robotMode === 'offline') {
        setRobot('idle');
        q('#v2-current-title').textContent = 'Nenhuma oferta em processamento';
        q('#v2-current-copy').textContent = 'As ofertas aparecerão aqui quando o envio iniciar.';
      }
      updateDiagnostic();
      return;
    }

    if (status.connecting) {
      apiOnline = true;
      whatsappConnected = null;
      output.textContent = status.label || 'Conectando...';
      output.style.color = 'var(--v2-cyan)';
      updateDiagnostic();
      return;
    }

    if (status.connected === false && status.explicit !== false && !status.unavailable) {
      apiOnline = true;
      whatsappConnected = false;
      output.textContent = status.label || 'Offline';
      output.style.color = 'var(--v2-red)';
      clearTimeout(temporaryTimer);
      setRobot('offline');
      q('#v2-current-title').textContent = 'WhatsApp desconectado';
      q('#v2-current-copy').textContent = 'Use o botão Visualizar QR Code para reconectar.';
      updateDiagnostic();
      return;
    }

    apiOnline = status.overview?.apiOnline === true ? true : false;
    whatsappConnected = null;
    output.textContent = status.label || 'Status indisponível';
    output.style.color = '#ffd27a';
    if (robotMode === 'offline') setRobot('idle');
    q('#v2-current-title').textContent = 'Aguardando leitura do servidor';
    q('#v2-current-copy').textContent = 'O WhatsApp não foi marcado como offline. A leitura será tentada novamente.';
    updateDiagnostic();
  }

  function applyOverview(overview) {
    apiOnline = overview.apiOnline === true;

    if (overview.queueOk && overview.queue) {
      queueOnline = true;
      updateQueue(overview.queue);
    } else {
      queueOnline = false;
      const queueText = q('#v2-fila-txt');
      const summary = q('#v2-queue-summary');
      const badge = q('#v2-queue-badge');
      if (queueText) queueText.textContent = 'Fila indisponível';
      if (summary) summary.textContent = 'Não foi possível atualizar a fila. Os últimos números foram mantidos.';
      if (badge) {
        badge.textContent = 'Sem leitura';
        badge.dataset.state = 'idle';
      }
    }

    updateDiagnostic();
    tick();
  }

  function updateDiagnostic() {
    const box = q('#v2-system');
    if (!box) return;
    const api = apiOnline === true ? 'API ✓' : apiOnline === false ? 'API instável' : 'API …';
    const whatsapp = whatsappConnected === true
      ? 'WhatsApp ✓'
      : whatsappConnected === false
        ? 'WhatsApp ✕'
        : 'WhatsApp ?';
    const queue = queueOnline === true ? 'Fila ✓' : queueOnline === false ? 'Fila instável' : 'Fila …';
    box.textContent = `${api}  •  ${whatsapp}  •  ${queue}`;
    const ok = whatsappConnected === true && queueOnline === true;
    box.style.color = ok ? '#65efb0' : whatsappConnected === false ? '#ff8b99' : '#ffd27a';
  }

  function offerTitle(item, index) {
    const text = String(item?.message || item?.text || item?.content || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) return `Oferta ${index + 1}`;
    return text.length > 125 ? `${text.slice(0, 125)}…` : text;
  }

  function itemTime(item) {
    const value = item?.sentAt || item?.completedAt || item?.lastAttemptAt || item?.createdAt;
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? ''
      : date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function renderQueue(queue) {
    const box = q('#v2-queue-items');
    const summary = q('#v2-queue-summary');
    const badge = q('#v2-queue-badge');
    if (!box || !summary || !badge) return;

    const items = Array.isArray(queue.items) ? queue.items : [];
    const pending = items.filter(item => item.status === 'pending');
    const sent = items.filter(item => item.status === 'sent');
    const failed = items.filter(item => item.error && item.status !== 'sent');

    const pendingCount = Number.isFinite(Number(queue.pending)) ? Number(queue.pending) : pending.length;
    const sentCount = Number.isFinite(Number(queue.sent)) ? Number(queue.sent) : sent.length;
    summary.textContent = `${pendingCount} pendente(s) • ${sentCount} concluída(s)${failed.length ? ` • ${failed.length} com atenção` : ''}`;
    badge.textContent = queue.processing ? 'Enviando agora' : queue.running ? 'Fila rodando' : 'Fila aguardando';
    badge.dataset.state = queue.processing ? 'sending' : queue.running ? 'running' : 'idle';

    if (!items.length) {
      box.innerHTML = '<div class="v2-queue-empty">Nenhuma oferta cadastrada na fila do bot.</div>';
      return;
    }

    const ordered = [...pending, ...sent.slice().reverse()].slice(0, 30);
    box.innerHTML = ordered.map((item, index) => {
      const isSent = item.status === 'sent';
      const hasError = Boolean(item.error) && !isSent;
      const status = isSent ? 'Concluída' : hasError ? 'Atenção' : 'Pendente';
      const targets = Array.isArray(item.targets) ? item.targets.length : 0;
      const sentTargets = Array.isArray(item.sentTargets) ? item.sentTargets.length : 0;
      const time = itemTime(item);
      return `<article class="v2-queue-item ${isSent ? 'is-sent' : hasError ? 'has-error' : 'is-pending'}">` +
        `<div class="v2-queue-item-top"><span>${status}</span><small>${time || `#${index + 1}`}</small></div>` +
        `<strong>${esc(offerTitle(item, index))}</strong>` +
        `<p>${isSent ? `${sentTargets || targets} grupo(s) concluído(s)` : hasError ? esc(item.error) : `${targets} grupo(s) programado(s)`}</p>` +
        '</article>';
    }).join('');
  }

  function updateQueue(queue) {
    const total = Number(queue.total) || 0;
    const sent = Number(queue.sent) || 0;
    const pending = Number(queue.pending) || 0;
    const percentage = total ? Math.round((sent / total) * 100) : 0;

    q('#v2-fila').textContent = `${pending} / ${total}`;
    q('#v2-fila-txt').textContent = queue.processing
      ? 'Enviando agora'
      : queue.running
        ? 'Fila em execução'
        : 'Aguardando envio';
    q('#v2-hoje').textContent = queue.sentToday ?? 0;
    q('#v2-progress-label').textContent = `${percentage}%`;
    q('#v2-progress-bar').style.width = `${percentage}%`;
    q('#v2-progress-copy').textContent = `${sent} de ${total} ofertas concluídas`;
    nextRun = queue.nextRunAt || queue.nextEligibleAt || null;
    renderQueue(queue);

    if (whatsappConnected === true && (queue.processing || (queue.running && pending > 0))) {
      clearTimeout(temporaryTimer);
      setRobot('sending', `Processando a fila com ${pending} oferta${pending === 1 ? '' : 's'} pendente${pending === 1 ? '' : 's'}`);
      q('#v2-current-title').textContent = queue.processing ? 'Envio em andamento' : 'Fila programada';
      q('#v2-current-copy').textContent = `${sent} de ${total} ofertas concluídas.`;
    } else if (whatsappConnected === true && robotMode === 'sending') {
      setRobot(total > 0 && sent === total ? 'success' : 'idle');
      q('#v2-current-title').textContent = 'Nenhuma oferta em processamento';
      q('#v2-current-copy').textContent = 'As ofertas aparecerão aqui quando o envio iniciar.';
    }
  }

  function tick() {
    const output = q('#v2-proximo');
    const text = q('#v2-proximo-txt');
    if (!output || !text) return;

    if (!nextRun) {
      output.textContent = '—';
      text.textContent = queueOnline === false ? 'Fila indisponível' : 'Aguardando fila';
      return;
    }

    const difference = new Date(nextRun).getTime() - Date.now();
    if (difference <= 0) {
      output.textContent = 'Agora';
      text.textContent = 'Verificando fila';
      return;
    }

    const totalSeconds = Math.floor(difference / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    output.textContent = `${hours ? `${String(hours).padStart(2, '0')}:` : ''}${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    text.textContent = 'Até o próximo lote';
  }

  document.addEventListener('DOMContentLoaded', mount);
})();