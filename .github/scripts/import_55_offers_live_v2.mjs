import fs from 'node:fs/promises';

const source=await fs.readFile('.github/scripts/import_55_offers_live.mjs','utf8');
const start=source.indexOf('const offers=')+'const offers='.length;
const end=source.indexOf(';\n\nconst hooks=',start);
if(start<13||end<start) throw new Error('Não foi possível ler o pacote de ofertas.');
const offers=JSON.parse(source.slice(start,end));

const hooks=['🔥 PREÇO QUE CHAMA ATENÇÃO!','👀 OLHA ESSE ACHADINHO!','⚡ OFERTA PRA APROVEITAR!','🛒 ACHADO DO DIA!','💥 BAIXOU E FICOU INTERESSANTE!','🚨 OPORTUNIDADE NA ÁREA!','✨ ACHADINHO ÚTIL!','📣 VALE DAR UMA OLHADA!','💸 ECONOMIA À VISTA!','🏃 CORRE CONFERIR!','🎯 OFERTA BOA PRA QUEM PRECISA!','🤩 ESSE MERECE UM CLIQUE!','🧡 ACHADO PRA FACILITAR O DIA!','🔎 GARIMPO ENCONTRADO!','⚡ DESCONTO EM DESTAQUE!','🛍️ MAIS UM ACHADO BOM!','💡 OLHA O QUE APARECEU NO GARIMPO!','📦 OFERTA INTERESSANTE AGORA!','🔥 ACHADO QUENTE DO DIA!','👛 PREÇO PRA COLOCAR NA PONTA DO LÁPIS!'];
const ctas=['👉 Confira enquanto a oferta estiver disponível:','👉 Dá uma olhada no anúncio:','👉 Aproveite e confira agora:','👉 Veja as opções no link:','👉 Garanta se fizer sentido pra você:','👉 Confira antes que o valor mude:','👉 Acesse o anúncio e veja os detalhes:','👉 Veja se ainda está nesse preço:'];
const brl=n=>'R$ '+Number(n).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const messages=offers.map((o,i)=>{
  const price=o.before!=null&&o.now!=null?`❌ Antes: ${brl(o.before)}\n✅ Agora: *${brl(o.now)}*`:o.now!=null?`✅ Agora: *${brl(o.now)}*`:'💰 Confira o valor atualizado direto no anúncio';
  return `${hooks[i%hooks.length]}\n\n*${o.title}*\n\n${price}\n\n✅ ${o.b1}\n✅ ${o.b2}\n\n${ctas[i%ctas.length]}\n🔗 ${o.platform}: ${o.link}`;
});
if(messages.length!==55) throw new Error(`Quantidade inválida: ${messages.length}`);
if(new Set(offers.map(o=>o.link)).size!==55) throw new Error('Há link duplicado no pacote.');

const base='https://bot.achoulevoubot.uk';
async function jsonFetch(url,opts={}){
  const r=await fetch(url,{...opts,headers:{Accept:'application/json',...(opts.headers||{})}});
  const text=await r.text();
  let data=null; try{data=JSON.parse(text)}catch{}
  if(!r.ok) throw new Error(`${url} HTTP ${r.status}: ${text.slice(0,300)}`);
  return data;
}

const before=await jsonFetch(`${base}/queue`);
const q=before?.queue||before;
console.log('BEFORE',JSON.stringify({total:q?.total,pending:q?.pending,running:q?.running,processing:q?.processing}));
if(Number(q?.total)!==0||q?.running===true||q?.processing===true) throw new Error('Fila não está limpa/parada. Importação cancelada sem alterar nada.');

const body=new URLSearchParams();
body.set('text',messages.join('\n---\n'));
const imported=await jsonFetch(`${base}/queue/add`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:body.toString()});
console.log('IMPORT',JSON.stringify({ok:imported?.ok,added:imported?.added}));
if(!imported?.ok||Number(imported?.added)!==55) throw new Error(`Importação retornou quantidade inesperada: ${JSON.stringify(imported)}`);

await new Promise(r=>setTimeout(r,1500));
const after=await jsonFetch(`${base}/queue`);
const qa=after?.queue||after;
console.log('AFTER',JSON.stringify({total:qa?.total,pending:qa?.pending,sent:qa?.sent,error:qa?.error,running:qa?.running,processing:qa?.processing}));
if(Number(qa?.total)!==55||Number(qa?.pending)!==55||qa?.running===true||qa?.processing===true) throw new Error('Fila não ficou no estado esperado 55/55 pendentes e parada. NÃO iniciar o robô.');
console.log('✅ IMPORTAÇÃO CONFIRMADA: 55 total, 55 pendentes, fila parada.');
