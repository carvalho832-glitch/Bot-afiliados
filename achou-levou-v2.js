(function(){
  const q=s=>document.querySelector(s);
  const el=(tag,cls,html)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(html!==undefined)n.innerHTML=html;return n};
  function auth(config){return 'Basic '+btoa(`${config.username}:${config.password}`)}
  function config(){return window.AchouLevouBotQueue?.loadConfig?.()||{botUrl:'https://bot.achoulevoubot.uk',username:'julio',password:'AchouLevou2026'}}
  function mount(){
    const shell=q('.app-shell'),header=q('.app-header'),main=q('.main-flow'),saved=q('.saved-section');
    if(!shell||!header||!main||q('.v2-metrics'))return;
    const qr=el('button','v2-qr-btn','▦ Visualizar QR Code');qr.type='button';qr.onclick=()=>window.open(config().botUrl+'/qr-page','_blank');q('.header-actions')?.prepend(qr);
    const nav=el('div','v2-nav','<button class="active">⌂ Painel</button><button>▤ Fila de ofertas</button><button>◉ Histórico</button><button>⚙ Configurações</button><button>⌁ Estatísticas</button>');header.after(nav);
    const metrics=el('section','v2-metrics',`
      <article class="v2-metric"><small>Status do robô</small><strong id="v2-status">Verificando</strong><p>WhatsApp Web</p><i>⌁</i></article>
      <article class="v2-metric"><small>Fila de ofertas</small><strong id="v2-fila">0 / 0</strong><p id="v2-fila-txt">Aguardando envio</p><i>▤</i></article>
      <article class="v2-metric"><small>Enviadas hoje</small><strong id="v2-hoje">0</strong><p>Mensagens enviadas</p><i>➤</i></article>
      <article class="v2-metric"><small>Próximo envio</small><strong id="v2-proximo">—</strong><p id="v2-proximo-txt">Aguardando fila</p><i>◷</i></article>`);
    nav.after(metrics);
    const progress=el('section','v2-progress',`<div class="v2-progress-top"><span>Progresso geral das ofertas</span><strong id="v2-progress-label">0%</strong></div><div class="v2-progress-track"><div id="v2-progress-bar" class="v2-progress-bar"></div></div><small id="v2-progress-copy">0 de 0 ofertas enviadas</small>`);metrics.after(progress);
    const workspace=el('section','v2-workspace');const left=el('div','v2-left');const right=el('aside','v2-right');
    main.parentNode.insertBefore(workspace,main);left.appendChild(main);workspace.append(left,right);
    right.innerHTML=`<section class="v2-robot-card"><div class="v2-card-title">Execução do robô</div><div class="v2-robot-stage"><div class="v2-robot"><div class="v2-head"><div class="v2-ear l"></div><div class="v2-ear r"></div><div class="v2-face"><span class="v2-eye left"></span><span class="v2-eye right"></span><span class="v2-mouth"></span></div></div><div class="v2-body"><span class="v2-core"></span></div><span class="v2-arm l"></span><span class="v2-arm r"></span></div></div><div class="v2-status-copy"><strong id="v2-robot-title">Robô em stand-by</strong><span id="v2-robot-subtitle">Aguardando para iniciar o envio das ofertas</span></div><div id="v2-system" class="v2-system-ok">● Sistema funcionando normalmente</div></section><section class="v2-current-card"><div class="v2-card-title">Progresso atual</div><div class="v2-current-empty"><div class="v2-pulse">☷</div><strong id="v2-current-title">Nenhuma oferta em processamento</strong><p id="v2-current-copy">As ofertas aparecerão aqui quando o envio iniciar.</p></div></section>`;
    if(saved)workspace.after(saved);
    poll();setInterval(poll,10000);setInterval(tick,1000)
  }
  let nextRun=null;
  function setRobot(mode,text){const title=q('#v2-robot-title'),sub=q('#v2-robot-subtitle'),stage=q('.v2-robot-stage');if(!title||!sub)return;stage.dataset.mode=mode;title.textContent=mode==='working'?'Robô trabalhando':mode==='offline'?'Robô desconectado':'Robô em stand-by';sub.textContent=text||''}
  async function poll(){
    const c=config();
    try{
      const headers={Authorization:auth(c),Accept:'application/json'};
      const [sr,qr]=await Promise.all([fetch(c.botUrl+'/status?t='+Date.now(),{headers,cache:'no-store'}),fetch(c.botUrl+'/queue?t='+Date.now(),{headers,cache:'no-store'})]);
      const s=await sr.json(),qj=await qr.json();const qu=qj.queue||{};const connected=String(s.status||'').toLowerCase().includes('conect');
      q('#v2-status').textContent=connected?'Conectado':(s.status||'Offline');q('#v2-status').style.color=connected?'var(--v2-green)':'var(--v2-red)';
      const total=Number(qu.total)||0,sent=Number(qu.sent)||0,pending=Number(qu.pending)||0,pct=total?Math.round(sent/total*100):0;
      q('#v2-fila').textContent=`${pending} / ${total}`;q('#v2-fila-txt').textContent=qu.running?'Fila em execução':'Aguardando envio';q('#v2-hoje').textContent=qu.sentToday||0;q('#v2-progress-label').textContent=pct+'%';q('#v2-progress-bar').style.width=pct+'%';q('#v2-progress-copy').textContent=`${sent} de ${total} ofertas enviadas`;nextRun=qu.nextRunAt||s.nextRunAt||null;
      if(qu.processing||qu.running&&pending>0){setRobot('working',`Processando a fila com ${pending} oferta${pending===1?'':'s'} pendente${pending===1?'':'s'}`);q('#v2-current-title').textContent='Envio em andamento';q('#v2-current-copy').textContent=`${sent} de ${total} ofertas concluídas.`}else{setRobot(connected?'idle':'offline',connected?'Aguardando para iniciar o envio das ofertas':'Conecte novamente pelo QR Code');q('#v2-current-title').textContent='Nenhuma oferta em processamento';q('#v2-current-copy').textContent='As ofertas aparecerão aqui quando o envio iniciar.'}
      q('#v2-system').textContent=connected?'● Sistema funcionando normalmente':'● WhatsApp desconectado';q('#v2-system').style.color=connected?'#65efb0':'#ff8b99';tick();
    }catch(e){q('#v2-status').textContent='Offline';setRobot('offline','Não foi possível consultar o robô');q('#v2-system').textContent='● Falha de comunicação com o robô'}
  }
  function tick(){const out=q('#v2-proximo'),txt=q('#v2-proximo-txt');if(!out)return;if(!nextRun){out.textContent='—';txt.textContent='Aguardando fila';return}const d=new Date(nextRun).getTime()-Date.now();if(d<=0){out.textContent='Agora';txt.textContent='Verificando fila';return}const t=Math.floor(d/1000),h=Math.floor(t/3600),m=Math.floor((t%3600)/60),s=t%60;out.textContent=(h?String(h).padStart(2,'0')+':':'')+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');txt.textContent='Até a próxima verificação'}
  document.addEventListener('DOMContentLoaded',mount);
})();
