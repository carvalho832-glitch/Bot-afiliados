(function(){
  const q=s=>document.querySelector(s);
  const el=(tag,cls,html)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(html!==undefined)n.innerHTML=html;return n};
  function auth(config){return 'Basic '+btoa(`${config.username}:${config.password}`)}
  function config(){return window.AchouLevouBotQueue?.loadConfig?.()||{botUrl:'https://bot.achoulevoubot.uk',username:'julio',password:'AchouLevou2026'}}

  const ALVA={
    idle:'assets/alva/alva-standby.mp4',
    analyzing:'assets/alva/alva-analisando.mp4',
    preparing:'assets/alva/alva-preparando.mp4',
    generating:'assets/alva/alva-gerando-ia.mp4',
    sending:'assets/alva/alva-enviando.mp4',
    success:'assets/alva/alva-sucesso.mp4',
    offline:'assets/alva/alva-offline.mp4'
  };
  const LABELS={
    idle:['ALVA em stand-by','Aguardando para iniciar uma nova tarefa'],
    analyzing:['ALVA analisando produto','Lendo e conferindo os dados da oferta'],
    preparing:['ALVA preparando a oferta','Organizando as informações encontradas'],
    generating:['ALVA gerando mensagem','Criando a mensagem com inteligência artificial'],
    sending:['ALVA enviando ofertas','Distribuindo as mensagens para os grupos'],
    success:['Missão concluída','A tarefa foi finalizada com sucesso'],
    offline:['ALVA desconectada','Reconecte a sessão pelo QR Code']
  };
  let robotMode='idle',temporaryTimer=null,nextRun=null;

  function mount(){
    const shell=q('.app-shell'),header=q('.app-header'),main=q('.main-flow'),saved=q('.saved-section');
    if(!shell||!header||!main||q('.v2-metrics'))return;
    const qr=el('button','v2-qr-btn','▦ Visualizar QR Code');qr.type='button';qr.onclick=()=>window.open(config().botUrl+'/qr-page','_blank');q('.header-actions')?.prepend(qr);
    const nav=el('div','v2-nav','<button class="active">⌂ Painel</button><button>▤ Fila de ofertas</button><button>◉ Histórico</button><button>⚙ Configurações</button><button>⌁ Estatísticas</button>');header.after(nav);
    const metrics=el('section','v2-metrics','<article class="v2-metric"><small>Status do robô</small><strong id="v2-status">Verificando</strong><p>WhatsApp Web</p><i>⌁</i></article><article class="v2-metric"><small>Fila de ofertas</small><strong id="v2-fila">0 / 0</strong><p id="v2-fila-txt">Aguardando envio</p><i>▤</i></article><article class="v2-metric"><small>Enviadas hoje</small><strong id="v2-hoje">0</strong><p>Mensagens enviadas</p><i>➤</i></article><article class="v2-metric"><small>Próximo envio</small><strong id="v2-proximo">—</strong><p id="v2-proximo-txt">Aguardando fila</p><i>◷</i></article>');
    nav.after(metrics);
    const progress=el('section','v2-progress','<div class="v2-progress-top"><span>Progresso geral das ofertas</span><strong id="v2-progress-label">0%</strong></div><div class="v2-progress-track"><div id="v2-progress-bar" class="v2-progress-bar"></div></div><small id="v2-progress-copy">0 de 0 ofertas enviadas</small>');metrics.after(progress);
    const workspace=el('section','v2-workspace'),left=el('div','v2-left'),right=el('aside','v2-right');main.parentNode.insertBefore(workspace,main);left.appendChild(main);workspace.append(left,right);
    right.innerHTML='<section class="v2-robot-card"><div class="v2-card-title">Execução do robô</div><div class="v2-robot-stage" data-mode="idle"><div class="v2-video-glow"></div><video id="v2-alva-video" class="v2-alva-video" muted playsinline loop autoplay preload="auto" poster=""><source src="'+ALVA.idle+'" type="video/mp4"></video><div class="v2-video-loading"><span></span><small>Carregando ALVA...</small></div></div><div class="v2-status-copy"><strong id="v2-robot-title">ALVA em stand-by</strong><span id="v2-robot-subtitle">Aguardando para iniciar uma nova tarefa</span></div><div id="v2-system" class="v2-system-ok">● Sistema funcionando normalmente</div></section><section class="v2-current-card"><div class="v2-card-title">Progresso atual</div><div class="v2-current-empty"><div class="v2-pulse">☷</div><strong id="v2-current-title">Nenhuma oferta em processamento</strong><p id="v2-current-copy">As ofertas aparecerão aqui quando o envio iniciar.</p></div></section>';
    if(saved)workspace.after(saved);
    preloadVideos();bindVisualStates();setRobot('idle');poll();setInterval(poll,10000);setInterval(tick,1000);
  }

  function preloadVideos(){Object.values(ALVA).forEach(src=>{const v=document.createElement('video');v.preload='auto';v.muted=true;v.src=src})}

  function setRobot(mode,text,force=false){
    const video=q('#v2-alva-video'),stage=q('.v2-robot-stage'),title=q('#v2-robot-title'),sub=q('#v2-robot-subtitle');
    if(!video||!stage||!title||!sub)return;
    const selected=ALVA[mode]?mode:'idle';
    if(selected!==robotMode||force){
      robotMode=selected;stage.dataset.mode=selected;stage.classList.add('is-switching');
      const swap=()=>{video.src=ALVA[selected];video.load();const p=video.play();if(p?.catch)p.catch(()=>{});requestAnimationFrame(()=>stage.classList.remove('is-switching'))};
      setTimeout(swap,150);
    }
    const copy=LABELS[selected]||LABELS.idle;title.textContent=copy[0];sub.textContent=text||copy[1];
  }

  function temporaryState(mode,duration=6500,next='idle'){
    clearTimeout(temporaryTimer);setRobot(mode);temporaryTimer=setTimeout(()=>{if(robotMode===mode)setRobot(next)},duration);
  }

  function bindVisualStates(){
    q('#btn-puxar')?.addEventListener('click',()=>{temporaryState('analyzing',4200,'preparing');setTimeout(()=>{if(robotMode==='preparing')temporaryState('preparing',3500,'idle')},4300)});
    q('#btn-gerar')?.addEventListener('click',()=>temporaryState('generating',8000,'success'));
    q('#btn-salvar')?.addEventListener('click',()=>temporaryState('success',3500,'idle'));
    q('#btn-enviar-atual-robo')?.addEventListener('click',()=>temporaryState('sending',9000,'success'));
    q('#btn-enviar-todas-robo')?.addEventListener('click',()=>temporaryState('sending',9000,'success'));
    const video=q('#v2-alva-video');
    video?.addEventListener('canplay',()=>q('.v2-video-loading')?.classList.add('is-hidden'));
    video?.addEventListener('error',()=>{q('.v2-video-loading small').textContent='Vídeo do ALVA não encontrado';q('.v2-video-loading')?.classList.remove('is-hidden')});
  }

  async function poll(){
    const c=config();
    try{
      const headers={Authorization:auth(c),Accept:'application/json'};
      const [sr,qr]=await Promise.all([fetch(c.botUrl+'/status?t='+Date.now(),{headers,cache:'no-store'}),fetch(c.botUrl+'/queue?t='+Date.now(),{headers,cache:'no-store'})]);
      if(!sr.ok||!qr.ok)throw new Error('Falha HTTP');
      const s=await sr.json(),qj=await qr.json(),qu=qj.queue||{},connected=String(s.status||'').toLowerCase().includes('conect');
      q('#v2-status').textContent=connected?'Conectado':(s.status||'Offline');q('#v2-status').style.color=connected?'var(--v2-green)':'var(--v2-red)';
      const total=Number(qu.total)||0,sent=Number(qu.sent)||0,pending=Number(qu.pending)||0,pct=total?Math.round(sent/total*100):0;
      q('#v2-fila').textContent=`${pending} / ${total}`;q('#v2-fila-txt').textContent=qu.running?'Fila em execução':'Aguardando envio';q('#v2-hoje').textContent=qu.sentToday||0;q('#v2-progress-label').textContent=pct+'%';q('#v2-progress-bar').style.width=pct+'%';q('#v2-progress-copy').textContent=`${sent} de ${total} ofertas enviadas`;nextRun=qu.nextRunAt||s.nextRunAt||null;
      if(!connected){clearTimeout(temporaryTimer);setRobot('offline');q('#v2-current-title').textContent='WhatsApp desconectado';q('#v2-current-copy').textContent='Use o botão Visualizar QR Code para reconectar.'}
      else if(qu.processing||qu.running&&pending>0){clearTimeout(temporaryTimer);setRobot('sending',`Processando a fila com ${pending} oferta${pending===1?'':'s'} pendente${pending===1?'':'s'}`);q('#v2-current-title').textContent='Envio em andamento';q('#v2-current-copy').textContent=`${sent} de ${total} ofertas concluídas.`}
      else if(robotMode==='offline'||robotMode==='sending'){setRobot(total>0&&sent===total?'success':'idle');q('#v2-current-title').textContent='Nenhuma oferta em processamento';q('#v2-current-copy').textContent='As ofertas aparecerão aqui quando o envio iniciar.'}
      q('#v2-system').textContent=connected?'● Sistema funcionando normalmente':'● WhatsApp desconectado';q('#v2-system').style.color=connected?'#65efb0':'#ff8b99';tick();
    }catch(e){q('#v2-status').textContent='Offline';q('#v2-status').style.color='var(--v2-red)';clearTimeout(temporaryTimer);setRobot('offline','Não foi possível consultar o robô');q('#v2-system').textContent='● Falha de comunicação com o robô';q('#v2-system').style.color='#ff8b99'}
  }

  function tick(){const out=q('#v2-proximo'),txt=q('#v2-proximo-txt');if(!out)return;if(!nextRun){out.textContent='—';txt.textContent='Aguardando fila';return}const d=new Date(nextRun).getTime()-Date.now();if(d<=0){out.textContent='Agora';txt.textContent='Verificando fila';return}const t=Math.floor(d/1000),h=Math.floor(t/3600),m=Math.floor((t%3600)/60),s=t%60;out.textContent=(h?String(h).padStart(2,'0')+':':'')+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');txt.textContent='Até a próxima verificação'}
  document.addEventListener('DOMContentLoaded',mount);
})();