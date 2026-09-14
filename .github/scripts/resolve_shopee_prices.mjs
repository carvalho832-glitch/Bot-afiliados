// Ferramenta temporária de conferência por shopid/itemid.
import fs from 'node:fs/promises';

const items = [
[2,'1025824477','23193562548'],[3,'944861960','41700778753'],[4,'1063282424','18397749164'],[5,'636527609','22897373033'],
[11,'526615488','23096726971'],[12,'1541994310','22398692227'],[13,'400269328','23692648379'],[14,'499859839','23197739367'],[15,'1547311235','58255783559'],[16,'1427494275','22898741888'],
[18,'375617330','7477276584'],[19,'372154717','22497355382'],[20,'611353651','20600373846'],[21,'500587950','22596946867'],[22,'728534865','23791065039'],[23,'579014758','23494396658'],
[26,'638380156','23797991628'],[28,'1291752853','48054773011'],[31,'589696155','58211510076'],[32,'299222557','22293103741'],[33,'1611027648','58211615477'],[34,'354464116','19997669103'],
[41,'427299943','23398541041'],[42,'378093609','10691988494'],[43,'1889420415','58214593635'],[44,'1581953432','58208295921'],[52,'1309493698','23694638717'],[54,'979730489','20097977275']
];

const headers = {
  'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',
  'accept':'application/json, text/plain, */*',
  'accept-language':'pt-BR,pt;q=0.9,en;q=0.8',
  'referer':'https://shopee.com.br/',
  'x-api-source':'pc'
};

function p(v){ if(v==null) return null; const n=Number(v); return Number.isFinite(n) ? n/100000 : null; }
function pick(data){
  const d=data?.data || data?.item || data;
  if(!d || typeof d !== 'object') return null;
  return {
    name:d.name || d.item_basic?.name || null,
    price:p(d.price ?? d.item_basic?.price),
    price_min:p(d.price_min ?? d.item_basic?.price_min),
    price_max:p(d.price_max ?? d.item_basic?.price_max),
    price_before_discount:p(d.price_before_discount ?? d.item_basic?.price_before_discount),
    historical_sold:d.historical_sold ?? d.item_basic?.historical_sold ?? null,
    rating:d.item_rating?.rating_star ?? d.item_basic?.item_rating?.rating_star ?? null,
    stock:d.stock ?? d.item_basic?.stock ?? null
  };
}

async function request(url){
  const c=new AbortController(); const t=setTimeout(()=>c.abort(),12000);
  try{
    const r=await fetch(url,{headers,signal:c.signal});
    const text=await r.text();
    let json=null; try{json=JSON.parse(text)}catch{}
    return {status:r.status, ok:r.ok, result:pick(json), raw:json?undefined:text.slice(0,300)};
  }catch(e){return {error:String(e?.message||e)}}finally{clearTimeout(t)}
}

const out=[];
for (const [index,shopid,itemid] of items){
  const urls=[
    `https://shopee.com.br/api/v4/item/get?itemid=${itemid}&shopid=${shopid}`,
    `https://shopee.com.br/api/v2/item/get?itemid=${itemid}&shopid=${shopid}`
  ];
  let best=null;
  for(const url of urls){ const r=await request(url); if(!best) best=r; if(r.result?.name){best=r;break;} }
  const row={index,shopid,itemid,...best}; out.push(row); console.log(JSON.stringify(row));
  await new Promise(r=>setTimeout(r,250));
}
await fs.mkdir('tmp',{recursive:true});
await fs.writeFile('tmp/resolved-shopee-prices.json',JSON.stringify(out,null,2));
