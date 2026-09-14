import fs from 'node:fs/promises';

const links = [
  // Shopee 55
  'https://s.shopee.com.br/3qN5HrtUez','https://s.shopee.com.br/3LQogwvOfu','https://s.shopee.com.br/3VkEtFulKx','https://s.shopee.com.br/70K73ghREe','https://s.shopee.com.br/7AdXFzgnth',
  'https://s.shopee.com.br/4Vcm5N69gS','https://s.shopee.com.br/4LJLt46n1R','https://s.shopee.com.br/4Azvgl7QMQ','https://s.shopee.com.br/40gVUS83hP','https://s.shopee.com.br/1BMK7FIqRs',
  'https://s.shopee.com.br/6q0grsDkEJ','https://s.shopee.com.br/6L4QGxFeFE','https://s.shopee.com.br/6VNqTGF0uH','https://s.shopee.com.br/60RZsLGuvC','https://s.shopee.com.br/6Al04eGHaF',
  'https://s.shopee.com.br/6Al057QqFE','https://s.shopee.com.br/60RZsoRTaD','https://s.shopee.com.br/6VNqTjPZZK','https://s.shopee.com.br/6L4QHQQCuJ','https://s.shopee.com.br/5VVJHtTNbA',
  'https://s.shopee.com.br/2qUY7NlR4M','https://s.shopee.com.br/2gB7v4m4PL','https://s.shopee.com.br/3qN5JDhd2a','https://s.shopee.com.br/3g3f6uiGNZ','https://s.shopee.com.br/3VkEubitiY',
  'https://s.shopee.com.br/9AObf9BE1q','https://s.shopee.com.br/905BSqBrMp','https://s.shopee.com.br/8AW4TJF23g','https://s.shopee.com.br/80CeH0FfOf','https://s.shopee.com.br/8V8urvDlNm',
  'https://s.shopee.com.br/2qUY7ZkiIj','https://s.shopee.com.br/30nyJsk4xm','https://s.shopee.com.br/3B7OWBjRcp','https://s.shopee.com.br/3LQoiUioHs','https://s.shopee.com.br/3VkEuniAwv',
  'https://s.shopee.com.br/70K75Hydwx','https://s.shopee.com.br/7VGNgCwjw4','https://s.shopee.com.br/7KwxTtxNH3','https://s.shopee.com.br/7ptE4ovTGA','https://s.shopee.com.br/7fZnsVw6b9',
  'https://s.shopee.com.br/8KpUfon4z3','https://s.shopee.com.br/8AW4TVniK2','https://s.shopee.com.br/80CeHCoLf1','https://s.shopee.com.br/9AObfLjuIG','https://s.shopee.com.br/905BT2kXdF',
  'https://s.shopee.com.br/9AObfQZ9mp','https://s.shopee.com.br/1LfkL22ygK','https://s.shopee.com.br/1VzAXL2LLN','https://s.shopee.com.br/1gIaje1i0Q','https://s.shopee.com.br/1qc0vx14fT',
  'https://s.shopee.com.br/8pllGxNmjf','https://s.shopee.com.br/9fKsGUKc2q','https://s.shopee.com.br/9peISnJyht','https://s.shopee.com.br/9Ki1rsLsio','https://s.shopee.com.br/9V1S4BLFNr',
  // Mercado Livre 27
  'https://meli.la/33vCDqb','https://meli.la/14XY5Pw','https://meli.la/1Day7Ga','https://meli.la/2pHYrtA','https://meli.la/2V4Z2pv','https://meli.la/1DN1ucJ','https://meli.la/1eaZ9in','https://meli.la/1AxaZSy','https://meli.la/2hgs7zg',
  'https://meli.la/259bnM8','https://meli.la/1dAdwyB','https://meli.la/2tPNsMf','https://meli.la/1BzjHso','https://meli.la/2Qg9ifj','https://meli.la/1TKPkSm','https://meli.la/2ia3AQL','https://meli.la/2rDiJJy','https://meli.la/2XJ1LNf','https://meli.la/2ruaM3D','https://meli.la/2UztGx8',
  'https://meli.la/27aemax','https://meli.la/1Jg2f4E','https://meli.la/2oNewqb','https://meli.la/2kT3Ben','https://meli.la/2AC9J9E','https://meli.la/2q1CnFe','https://meli.la/1fGyVi2'
];

function clean(s='') { return String(s).replace(/\s+/g,' ').trim(); }
function decodeHtml(s='') {
  return s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
}

async function resolveOne(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 18000);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 Chrome/128.0 Safari/537.36',
        'accept-language': 'pt-BR,pt;q=0.9,en;q=0.7',
        'accept': 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8'
      }
    });
    let text = '';
    try { text = (await res.text()).slice(0, 350000); } catch {}
    const title = decodeHtml(clean((text.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i)?.[1] || text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '')));
    const canonical = decodeHtml(clean((text.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i)?.[1] || '')));
    return { input:url, status:res.status, finalUrl:res.url, canonical, title };
  } catch (e) {
    return { input:url, error:String(e?.name || e) + ': ' + String(e?.message || '') };
  } finally { clearTimeout(timer); }
}

const results = new Array(links.length);
let next = 0;
async function worker() {
  while (true) {
    const i = next++;
    if (i >= links.length) return;
    results[i] = await resolveOne(links[i]);
    console.log(JSON.stringify({ index:i+1, ...results[i] }));
  }
}
await Promise.all(Array.from({length:8}, worker));
await fs.mkdir('tmp', {recursive:true});
await fs.writeFile('tmp/resolved-offer-links.json', JSON.stringify(results, null, 2));
console.log(`RESOLVED=${results.filter(r=>r?.finalUrl).length}/${results.length}`);
