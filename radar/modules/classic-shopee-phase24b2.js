(() => {
  'use strict';
  const VERSION='1.1.0', API='https://bot-afiliados-1fwi.onrender.com';
  const LINK_ID='radar-phase24-link-button', CAPTURE_ID='radar-phase24-capture-button';
  const RESUME_KEY='radar_phase24_link_resume_v2';
  const root=window.RadarClassicRemote=window.RadarClassicRemote||{};
  if(root.shopeeLinksVersion===VERSION)return;
  root.shopeeLinksVersion=VERSION;

  const state={batch:null,busy:false,clipboard:'',confirmed:false};
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const norm=v=>clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const wait=ms=>new Promise(r=>setTimeout(r,ms));

  function toast(message,kind='ok',time=8000){
    document.getElementById('radar-phase24-toast')?.remove();
    const el=document.createElement('div'); el.id='radar-phase24-toast'; el.textContent=message;
    el.style.cssText=`position:fixed;left:50%;bottom:188px;transform:translateX(-50%);z-index:2147483647;max-width:calc(100% - 28px);padding:12px 16px;border-radius:14px;font:700 13px system-ui;text-align:center;box-shadow:0 12px 36px #0008;${
      kind==='error'?'background:#7f1d1d;color:#fee2e2;border:1px solid #fb7185':
      kind==='warning'?'background:#78350f;color:#ffedd5;border:1px solid #fb923c':
      'background:#e6fff5;color:#052e21;border:1px solid #34d399'}`;
    document.documentElement.appendChild(el); setTimeout(()=>el.remove(),time);
  }

  async function api(path,options={}){
    const ctl=new AbortController(), timer=setTimeout(()=>ctl.abort(),25000);
    try{
      const res=await fetch(API+path,{...options,mode:'cors',cache:'no-store',signal:ctl.signal,headers:{
        Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})
      }});
      const text=await res.text(); let body=null; try{body=JSON.parse(text)}catch{}
      if(!res.ok||!body?.ok)throw new Error(body?.error||`HTTP ${res.status}`);
      return body;
    }finally{clearTimeout(timer)}
  }

  const buttons=()=>[...document.querySelectorAll('button,[role="button"],a')]
    .filter(el=>/obter\s*link/i.test(clean(el.innerText||el.textContent)));
  const approved=()=>state.batch?.items?.filter(x=>x.decision==='approved')||[];
  const pending=()=>approved().filter(x=>!x.affiliateUrl);
  const ready=()=>approved().filter(x=>x.affiliateUrl);

  function resumeRead(){
    try{
      const r=JSON.parse(sessionStorage.getItem(RESUME_KEY)||'null');
      if(!r?.batchId||!r?.itemId||Date.now()-Number(r.at||0)>3600000){sessionStorage.removeItem(RESUME_KEY);return null}
      return r;
    }catch{sessionStorage.removeItem(RESUME_KEY);return null}
  }
  function resumeSave(item,stage){
    sessionStorage.setItem(RESUME_KEY,JSON.stringify({
      batchId:state.batch.id,itemId:item.id,title:item.title,originalUrl:item.url,stage,at:Date.now()
    }));
  }
  const resumeClear=()=>sessionStorage.removeItem(RESUME_KEY);
  function resumeItem(){
    const r=resumeRead(); if(!r||r.batchId!==state.batch?.id)return null;
    const item=state.batch.items.find(x=>x.id===r.itemId);
    if(!item||item.affiliateUrl||item.decision!=='approved'){resumeClear();return null}
    return item;
  }

  async function loadBatch(show=true){
    const out=await api(`/phase24/batches?profile=julio&current=1&t=${Date.now()}`);
    state.batch=out.batch||null;
    if(!state.batch){if(show)toast('Nenhum lote da Fase 24B foi encontrado.','warning');update();return null}
    const r=resumeItem();
    if(!approved().length){if(show)toast('O lote não possui produtos aprovados.','warning')}
    else if(!['approved','processing'].includes(state.batch.status)){if(show)toast('Confirme o lote no Painel antes de gerar links.','warning')}
    else if(show&&r)toast(`Produto preparado: ${clean(r.title).slice(0,65)}. Toque novamente para continuar.`)
    else if(show)toast(`Lote carregado: ${ready().length} link(s) pronto(s) e ${pending().length} pendente(s).`);
    update(); return state.batch;
  }

  function words(title){return norm(title).replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(x=>x.length>=3).slice(0,18)}
  function card(button){
    let n=button;
    for(let i=0;n&&i<8;i++,n=n.parentElement){
      const t=clean(n.innerText||n.textContent);
      if(t.length>=25&&t.length<=1800&&/R\$|vendas?|comiss|produto|detalhes/i.test(t))return n;
    }
    return button.closest('[class*="card"],[class*="item"],li,article,section,div')||document.body;
  }
  function match(item){
    const list=buttons(); if(!list.length)return null;
    const ranked=list.map(button=>{
      const c=card(button), text=norm(c.innerText||c.textContent), hrefs=[...c.querySelectorAll?.('a[href]')||[]].map(a=>a.href).join(' ');
      let score=words(item.title).reduce((n,w)=>n+(text.includes(w)?1:0),0);
      if(item.sourceId&&hrefs.includes(item.sourceId))score+=30;
      const p=norm(item.title).slice(0,34); if(p&&text.includes(p))score+=15;
      return {button,score};
    }).sort((a,b)=>b.score-a.score);
    const ws=words(item.title), min=Math.min(4,Math.max(2,ws.length/3));
    if(ranked[0]?.score>=min)return ranked[0].button;
    if(list.length===1){
      const page=norm(`${document.title} ${document.body?.innerText||''}`);
      if(ws.filter(w=>page.includes(w)).length>=min)return list[0];
    }
    return null;
  }
  function next(){
    const r=resumeItem(), rb=r&&match(r); if(rb)return {item:r,button:rb,resumed:true};
    for(const item of pending()){const b=match(item);if(b)return {item,button:b,resumed:false}}
    return null;
  }

  function num(v){
    const m=clean(v).toLowerCase().match(/(\d+(?:[.,]\d+)?)\s*(mil|k|mi|m)?/i); if(!m)return null;
    let n=Number(m[1].replace(/\./g,'').replace(',','.'));
    if(m[2]==='mil'||m[2]==='k')n*=1000; if(m[2]==='mi'||m[2]==='m')n*=1000000;
    return Number.isFinite(n)?n:null;
  }
  function extract(){
    const seen=new Set(), out=[];
    buttons().forEach((button,position)=>{
      if(out.length>=40)return; const c=card(button); if(!c||c===document.body)return;
      const anchors=[...c.querySelectorAll('a[href]')], a=anchors.find(x=>/product|offer|item/i.test(x.href))||anchors[0], url=a?.href||'';
      let title='';
      for(const e of c.querySelectorAll('h1,h2,h3,h4,[class*="title"],[class*="name"],a[href]')){
        if(e===button||e.contains(button))continue;
        const v=clean(e.getAttribute('title')||e.innerText||e.textContent);
        if(v.length>=8&&v.length<=300&&!/obter\s*link|comiss(?:ã|a)o/i.test(v)){title=v;break}
      }
      if(!title)title=clean(c.innerText||c.textContent).replace(/obter\s*link/ig,'').split(/R\$|vendid|comiss/i)[0].slice(0,300);
      if(!title||!url||seen.has(url))return; seen.add(url);
      const t=clean(c.innerText||c.textContent), price=t.match(/R\$\s*([\d.]+(?:,\d{1,2})?)/i);
      const sold=t.match(/([\d.,]+\s*(?:mil|k|mi|m)?)\s*(?:vendid[oa]s?|vendas?)/i);
      const rating=norm(t).match(/(?:nota|avaliacao|rating)\s*[:\-]?\s*([0-5](?:[.,]\d)?)/i);
      const commission=t.match(/(?:comiss(?:ã|a)o|ganhe)\s*[:\-]?\s*(R\$\s*[\d.,]+|\d+(?:[.,]\d+)?%)/i);
      const pv=price?Number(price[1].replace(/\./g,'').replace(',','.')):null;
      out.push({
        sourceId:url.match(/(?:product|item|offer)[^\d]*(\d{4,})/i)?.[1]||'',position,title,url,
        image:c.querySelector('img')?.currentSrc||c.querySelector('img')?.src||'',
        priceText:price?`R$ ${price[1]}`:'',priceValue:Number.isFinite(pv)?pv:null,
        soldText:sold?clean(sold[0]):'',soldCount:sold?num(sold[1]):null,
        rating:rating?Number(rating[1].replace(',','.')):null,
        commissionText:commission?clean(commission[1]):'',decision:'pending',stage:'captured'
      });
    });
    return out;
  }

  async function capture(button){
    const items=extract(); if(!items.length){toast('Nenhum conjunto de produtos foi encontrado.','error');return}
    const old=button.textContent; button.disabled=true; button.textContent=`⏳ Enviando ${items.length}...`;
    try{
      const out=await api('/phase24/batches',{method:'POST',body:JSON.stringify({
        profile:'julio',source:'radar-classic-shopee-direct',sourceUrl:location.href,replaceCurrent:true,
        filters:{maxItems:15,minSold:0,minRating:0},items
      })});
      resumeClear(); state.batch=out.batch||null;
      toast(`✅ Fase 24B: ${out.batch?.summary?.total||items.length} produtos salvos. Volte ao Painel.`);
    }catch(e){toast(`Fase 24B não salvou o lote: ${e.message}`,'error')}
    finally{button.disabled=false;button.textContent=old;update()}
  }

  function strip(v){return clean(v).replace(/^[\s"'(<\[]+/,'').replace(/[\s"')>\],.;:]+$/,'')}
  const urls=v=>[...String(v||'').matchAll(/https?:\/\/[^\s"'<>]+/gi)].map(m=>strip(m[0]));
  function affiliate(v,original=''){
    let u; try{u=new URL(strip(v))}catch{return false}
    const h=u.hostname.toLowerCase();
    if(['s.shopee.com.br','shope.ee','br.shp.ee','shp.ee'].includes(h))return true;
    return h.endsWith('shopee.com.br')&&strip(v)!==strip(original)&&
      /affiliate|uls_trackid|share_channel|an_[a-z0-9]|utm_campaign|smtt=|af_siteid/i.test(`${u.pathname}?${u.searchParams}`);
  }
  function scopes(){
    const d=[...document.querySelectorAll('[role="dialog"],[aria-modal="true"],[class*="modal"],[class*="dialog"],[class*="popup"]')]
      .filter(x=>{const s=getComputedStyle(x);return s.display!=='none'&&s.visibility!=='hidden'});
    return d.length?d:[document.body];
  }
  function candidates(original){
    const set=new Set(state.clipboard?[state.clipboard]:[]);
    for(const s of scopes()){
      for(const e of s.querySelectorAll('input,textarea,a,[data-clipboard-text],[data-copy],[data-url],[value]')){
        [e.value,e.href,e.textContent,e.getAttribute('data-clipboard-text'),e.getAttribute('data-copy'),e.getAttribute('data-url'),e.getAttribute('value')]
          .flatMap(urls).forEach(x=>set.add(x));
      }
      urls(s.innerText||s.textContent).forEach(x=>set.add(x));
    }
    return [...set].filter(x=>affiliate(x,original)).sort((a,b)=>a.length-b.length);
  }
  function copyClick(){
    const b=[...document.querySelectorAll('button,[role="button"],a')].find(x=>{
      const l=norm(x.innerText||x.textContent||x.getAttribute('aria-label'));return l.includes('copiar link')||l==='copiar'
    }); b?.click(); return !!b;
  }
  async function outcome(original,start){
    let copied=false;
    for(let i=0;i<34;i++){
      const direct=candidates(original)[0]; if(direct)return {url:direct,navigated:false};
      if(!copied&&i>=3)copied=copyClick();
      if(copied&&i>=4)try{
        const v=await navigator.clipboard?.readText?.(); if(affiliate(v,original))return {url:strip(v),navigated:false}
      }catch{}
      if(i>=4&&location.href!==start&&(buttons().length===1||match(resumeItem()||{})))return {url:'',navigated:true};
      await wait(500);
    }
    return {url:'',navigated:false};
  }
  try{
    const cb=navigator.clipboard;
    if(cb&&typeof cb.writeText==='function'){
      const original=cb.writeText.bind(cb);
      Object.defineProperty(cb,'writeText',{configurable:true,value:async text=>{
        if(affiliate(text))state.clipboard=strip(text); return original(text)
      }});
    }
  }catch{}

  async function patch(item,data){
    const out=await api(`/phase24/batches/${encodeURIComponent(state.batch.id)}/items/${encodeURIComponent(item.id)}`,{
      method:'PATCH',body:JSON.stringify(data)
    }); state.batch=out.batch||state.batch;
  }
  async function processing(){
    if(state.batch.status==='processing')return;
    const out=await api(`/phase24/batches/${encodeURIComponent(state.batch.id)}`,{
      method:'PATCH',body:JSON.stringify({status:'processing'})
    }); state.batch=out.batch||state.batch;
  }
  function closeModal(){
    [...document.querySelectorAll('button,[role="button"],[aria-label]')].find(x=>{
      const l=norm(x.innerText||x.textContent||x.getAttribute('aria-label'));
      return l==='fechar'||l==='close'||l==='cancelar'||l.includes('fechar')
    })?.click();
  }

  async function generate(button){
    if(state.busy)return; state.busy=true; state.clipboard=''; button.disabled=true;
    try{
      if(!state.batch)await loadBatch(false);
      if(!state.batch)throw new Error('Nenhum lote aprovado foi encontrado.');
      if(!['approved','processing'].includes(state.batch.status))throw new Error('Confirme o lote no Painel antes de gerar links.');
      if(!pending().length){toast(`✅ Todos os ${ready().length} links já estão prontos.`);return}
      if(!state.confirmed&&!resumeRead()){
        if(!confirm(`Gerar somente 1 link afiliado agora?\n\nPendentes: ${pending().length}\nNenhuma oferta será enviada ao WhatsApp.`))return;
        state.confirmed=true;
      }
      const found=next();
      if(!found)throw new Error(resumeRead()?'O produto preparado não foi reconhecido nesta página.':'Nenhum aprovado foi localizado nesta página.');
      const {item,button:obtain,resumed}=found;
      button.textContent=`⏳ ${clean(item.title).slice(0,22)}...`; resumeSave(item,resumed?'detail_ready':'opening_detail');
      await processing();
      await patch(item,{stage:resumed?'link_generating_detail':'link_opening',reason:resumed?'Gerando na página de detalhes.':'Abrindo o produto aprovado.'});
      obtain.scrollIntoView({block:'center',inline:'center',behavior:'smooth'}); await wait(350);
      const start=location.href; obtain.click();
      toast(resumed?`🔗 Gerando link de: ${clean(item.title).slice(0,60)}`:`🔎 Abrindo produto: ${clean(item.title).slice(0,60)}`);
      const result=await outcome(item.url,start);
      if(result.navigated){
        resumeSave(item,'detail_ready');
        await patch(item,{stage:'link_detail_ready',reason:'Página de detalhes aberta; aguardando novo toque.'});
        toast('Página de detalhes aberta. Toque no botão verde novamente.','warning',9000); return;
      }
      if(!result.url){
        await patch(item,{stage:'link_error',reason:'Link não confirmado nesta tentativa.'});
        throw new Error('O link não foi confirmado. Tente novamente no mesmo produto.');
      }
      await patch(item,{stage:'link_ready',affiliateUrl:result.url,reason:'Link afiliado capturado e verificado.'});
      resumeClear(); closeModal();
      toast(`✅ Link salvo. Prontos: ${ready().length}. Restam: ${pending().length}.`,'ok',9000);
    }catch(e){toast(`Fase 24B.2: ${e.message}`,'error',9000)}
    finally{state.busy=false;button.disabled=false;update()}
  }

  function update(){
    const b=document.getElementById(LINK_ID); if(!b)return;
    const r=state.batch&&resumeItem();
    b.textContent=!state.batch?'🔗 Carregar lote aprovado':
      !approved().length?'🔗 Nenhum aprovado':
      r?`🔗 Continuar link (${pending().length})`:
      !pending().length?`✅ Links prontos (${ready().length})`:`🔗 Gerar próximo link (${pending().length})`;
  }
  function mount(){
    const list=buttons(), oldCapture=document.getElementById(CAPTURE_ID);
    if(list.length<2)oldCapture?.remove();
    if(list.length>=2&&!oldCapture){
      const c=document.createElement('button'); c.id=CAPTURE_ID;c.type='button';c.textContent='📦 Enviar à revisão 24B';
      c.style.cssText='position:fixed;right:12px;bottom:182px;z-index:2147483646;border:1px solid #55e8ff99;border-radius:15px;padding:12px 15px;background:linear-gradient(135deg,#0e7490,#2563eb);color:#fff;font:800 13px system-ui;box-shadow:0 12px 32px #0008';
      c.onclick=e=>{e.preventDefault();e.stopPropagation();capture(c)}; document.documentElement.appendChild(c);
    }
    if(!document.body||document.getElementById(LINK_ID)||!list.length)return;
    const b=document.createElement('button'); b.id=LINK_ID;b.type='button';b.textContent='🔗 Carregar lote aprovado';
    b.style.cssText='position:fixed;left:12px;bottom:182px;z-index:2147483646;border:1px solid #a5f3fcaa;border-radius:15px;padding:12px 15px;background:linear-gradient(135deg,#047857,#16a34a);color:#fff;font:800 13px system-ui;box-shadow:0 12px 32px #0009;max-width:235px';
    b.onclick=async e=>{
      e.preventDefault();e.stopPropagation();
      if(!state.batch){b.disabled=true;b.textContent='⏳ Buscando aprovados...';try{await loadBatch(true)}catch(err){toast(`Não foi possível carregar o lote: ${err.message}`,'error')}finally{b.disabled=false;update()}}
      else generate(b);
    };
    document.documentElement.appendChild(b);
  }

  mount();
  if(resumeRead())loadBatch(false).catch(()=>{});
  let timer=0;
  new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(()=>{mount();update()},250)})
    .observe(document.documentElement,{childList:true,subtree:true});

  root.shopeeLinks={version:VERSION,supervised:true,oneAtATime:true,autoLoop:false,whatsappAutoStart:false,
    directCaptureButton:true,detailPageResume:true,loadBatch:()=>loadBatch(true),loadedAt:Date.now()};
})();