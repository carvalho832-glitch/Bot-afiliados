import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const links = [
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
'https://s.shopee.com.br/8pllGxNmjf','https://s.shopee.com.br/9fKsGUKc2q','https://s.shopee.com.br/9peISnJyht','https://s.shopee.com.br/9Ki1rsLsio','https://s.shopee.com.br/9V1S4BLFNr'
];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  locale: 'pt-BR',
  timezoneId: 'America/Sao_Paulo',
  userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S901E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
  viewport: { width: 412, height: 915 }
});
await context.route(/\.(png|jpe?g|gif|webp|svg|woff2?|ttf)(\?|$)/i, route => route.abort());

async function resolveOne(input) {
  const page = await context.newPage();
  const seen = [];
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) seen.push(frame.url()); });
  try {
    await page.goto(input, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(()=>{});
    await page.waitForTimeout(6500);
    const title = await page.title().catch(()=> '');
    const url = page.url();
    const html = await page.content().catch(()=> '');
    const texts = await page.locator('body').innerText({timeout:3000}).catch(()=> '');
    const candidates = new Set();
    for (const m of html.matchAll(/https?:\\?\/\\?\/[^
"'<> ]+/g)) {
      const s = m[0].replace(/\\\//g,'/').replace(/&amp;/g,'&');
      if (/shopee\.com\.br/i.test(s)) candidates.add(s.slice(0,1000));
    }
    for (const m of html.matchAll(/shopee:\/\/[^"'<> ]+/g)) candidates.add(m[0].slice(0,1000));
    const itemPairs = [...html.matchAll(/(?:item_?id|itemid)["'\s:=\\]+(\d{5,})/ig)].map(m=>m[1]).slice(0,20);
    const shopPairs = [...html.matchAll(/(?:shop_?id|shopid)["'\s:=\\]+(\d{5,})/ig)].map(m=>m[1]).slice(0,20);
    return {
      input, url, title, navigations:[...new Set(seen)], candidates:[...candidates].slice(0,30),
      itemIds:[...new Set(itemPairs)], shopIds:[...new Set(shopPairs)],
      bodyText: texts.replace(/\s+/g,' ').slice(0,1200)
    };
  } catch (e) {
    return { input, error:String(e?.stack || e) };
  } finally { await page.close().catch(()=>{}); }
}

const out = new Array(links.length);
let cursor = 0;
async function worker() {
  while (true) {
    const i = cursor++;
    if (i >= links.length) break;
    out[i] = await resolveOne(links[i]);
    console.log(JSON.stringify({index:i+1, ...out[i]}));
  }
}
await Promise.all(Array.from({length:4}, worker));
await browser.close();
await fs.mkdir('tmp',{recursive:true});
await fs.writeFile('tmp/resolved-shopee-browser.json', JSON.stringify(out,null,2));
