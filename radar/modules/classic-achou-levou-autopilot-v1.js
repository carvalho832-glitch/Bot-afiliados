(() => {
'use strict';
const VERSION = '1.0.0';
const API_BASE = 'https://bot-afiliados-1fwi.onrender.com';
const RUNS_ENDPOINT = `${API_BASE}/phase24/autopilot/runs`;
const SHARED_ENDPOINT = `${API_BASE}/shared/offers`;
const SHOPEE_HOME = 'https://affiliate.shopee.com.br/offer/product_offer';
const MAX_OFFER_ATTEMPTS = 3;
const STATUS_ID = 'radar-autopilot-achou-status';
const root = window.RadarClassicRemote = window.RadarClassicRemote || {};
if (root.achouLevouAutopilotVersion === VERSION) return;
root.achouLevouAutopilotVersion = VERSION;
const state = { busy: false, timer: 0, lastError: '', completedRunId: '' };
const clean = value => String(value ?? '').replace(/\r\n/g, '\n').trim();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const byId = id => document.getElementById(id);
function showStatus(message, kind = 'working') {
let box = document.getElementById(STATUS_ID);
if (!box) {
box = document.createElement('div'); box.id = STATUS_ID;
box.style.cssText = 'position:fixed;left:12px;right:12px;bottom:178px;z-index:2147483647;padding:13px 16px;border-radius:15px;font:800 13px/1.45 system-ui;text-align:center;box-shadow:0 12px 36px #0009;backdrop-filter:blur(8px);';
document.documentElement.appendChild(box);
}
const palette = kind === 'error' ? 'background:#7f1d1dee;color:#fee2e2;border:1px solid #fb7185' : kind === 'done' ? 'background:#064e3bee;color:#d1fae5;border:1px solid #34d399' : kind === 'warning' ? 'background:#78350fee;color:#ffedd5;border:1px solid #fb923c' : 'background:#312e81ee;color:#eef2ff;border:1px solid #818cf8';
box.style.cssText = `${box.style.cssText};${palette}`; box.textContent = message;
}
async function request(url, options = {}, timeoutMs = 45000) {
const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
try {
const response = await fetch(url, { ...options, mode: 'cors', cache: 'no-store', credentials: 'omit', signal: controller.signal, headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
const text = await response.text(); let body = null; try { body = JSON.parse(text); } catch {}
if (!response.ok || !body?.ok) throw new Error(body?.error || body?.detalhe || `HTTP ${response.status}`);
return body;
} catch (error) { if (error?.name === 'AbortError') throw new Error('A operação demorou demais para responder.'); throw error; } finally { clearTimeout(timer); }
}
async function currentRun() { const body = await request(`${RUNS_ENDPOINT}?active=1&t=${Date.now()}`, {}, 25000); return body.run || null; }
async function patchRun(run, data) { const body = await request(`${RUNS_ENDPOINT}/${encodeURIComponent(run.id)}`, { method: 'PATCH', body: JSON.stringify(data) }); return body.run; }
async function patchItem(run, item, data) { return request(`${RUNS_ENDPOINT}/${encodeURIComponent(run.id)}/items/${encodeURIComponent(item.id)}`, { method: 'PATCH', body: JSON.stringify(data) }); }
function openShopee() { if (window.RadarNative?.openUrl) window.RadarNative.openUrl(SHOPEE_HOME); else location.href = SHOPEE_HOME; }
function setValue(id, value) { const element = byId(id); if (!element) return; element.value = value || ''; element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true })); }
function setMessage(message) { const preview = byId('msg-preview'); if (preview) { preview.innerText = message || 'Aguardando geração...'; preview.dispatchEvent(new Event('input', { bubbles: true })); } window.__ultimaMensagemAchouLevou = message || ''; }
function fillScreen(item, product, message = '') {
setValue('input-link', item.affiliateUrl); setValue('display-produto', product.title); setValue('display-de', product.oldPrice); setValue('display-por', product.price); setValue('display-cupom', product.coupon);
const store = byId('select-loja'); if (store) { const option = [...store.options].find(entry => /shopee/i.test(entry.value || entry.textContent || '')); if (option) store.value = option.value; store.dispatchEvent(new Event('change', { bubbles: true })); }
window.__produtoImagemAtual = product.image || item.image || ''; window.__achouLevouOriginalShortUrl = item.affiliateUrl; window.__achouLevouResolvedUrl = product.resolvedUrl || ''; window.__radarCurrentQueueItemId = `phase24-auto:${item.id}`; if (message) setMessage(message);
}
async function pullProduct(item) {
showStatus(`🔎 Puxando os dados do produto: ${clean(item.title).slice(0, 62)}...`);
const params = new URLSearchParams({ url: item.affiliateUrl }); const data = await request(`${API_BASE}/shopee/produto?${params.toString()}`, {}, 130000);
const title = clean(data.produto || item.title); if (!title || /buscando na shopee/i.test(title)) throw new Error('A Shopee não devolveu o nome do produto.');
return { title, oldPrice: clean(data.precoDe), price: clean(data.precoPor || item.priceText), coupon: clean(data.cupom || data.desconto), image: clean(data.imagem || data.image || item.image), shopId: clean(data.shopId), itemId: clean(data.itemId), resolvedUrl: clean(data.linkCompleto || data.linkOferta), origin: clean(data.origem) };
}
async function generateMessage(item, product) {
showStatus(`✨ Gemini gerando a mensagem da oferta ${item.position + 1}...`);
const response = await request(`${API_BASE}/gerar-mensagem`, { method: 'POST', body: JSON.stringify({ produto: product.title, precoDe: product.oldPrice, precoPor: product.price, cupom: product.coupon, loja: 'Shopee', link: item.affiliateUrl }) }, 110000);
const message = clean(response.mensagem); if (!message) throw new Error('O Gemini não devolveu uma mensagem válida.'); if (!message.includes(item.affiliateUrl)) throw new Error('A mensagem gerada não preservou o link afiliado.');
return { message, fallback: Boolean(response.fallback), warning: clean(response.warning) };
}
async function saveVerified(run, item, product, message) {
showStatus(`☁️ Salvando e verificando a oferta ${run.successCount + 1}/${run.target}...`);
const sourceId = `phase24-auto:${run.id}:${item.id}`;
const saved = await request(SHARED_ENDPOINT, { method: 'POST', body: JSON.stringify({ source: 'radar-phase24-autopilot', sourceId, title: product.title, price: product.price, oldPrice: product.oldPrice, coupon: product.coupon, image: product.image, link: item.affiliateUrl, message }) }, 50000);
const offerId = clean(saved.offer?.id); if (!offerId) throw new Error('A fila compartilhada não devolveu o ID da oferta.');
const individual = await request(`${SHARED_ENDPOINT}/${encodeURIComponent(offerId)}?t=${Date.now()}`, {}, 35000);
if (clean(individual.offer?.id) !== offerId || clean(individual.offer?.sourceId) !== sourceId) throw new Error('A consulta individual não confirmou a oferta salva.');
const list = await request(`${SHARED_ENDPOINT}?t=${Date.now()}`, {}, 35000); const offers = Array.isArray(list.offers) ? list.offers : [];
if (!offers.some(offer => clean(offer.id) === offerId && clean(offer.sourceId) === sourceId)) throw new Error('A oferta não apareceu na fila compartilhada após a gravação.');
return { offerId, sourceId, offers };
}
async function syncSavedOffers() { try { if (window.AchouLevouSharedOffers?.load) await window.AchouLevouSharedOffers.load({ apply: true }); } catch (error) { console.warn('[RADAR-AUTOPILOT] A oferta foi salva, mas a lista visual não atualizou:', error.message); } }
function pendingItem(run) { const items = Array.isArray(run.items) ? run.items : []; const usable = items.filter(item => item.decision === 'approved' && item.affiliateUrl && item.stage !== 'saved-verified' && !/^failed-/.test(item.stage)); return usable.find(item => item.id === run.currentItemId) || usable[0] || null; }
function completionPanel(run) { state.completedRunId = run.id; showStatus(`🎉 Produção concluída: ${run.successCount}/${run.target} ofertas salvas e verificadas. Falhas ignoradas: ${run.failureCount}. Agora você assume o envio manual ao robô.`, 'done'); document.documentElement.dataset.radarAutopilotCompleted = 'true'; }
async function continueWithNext(run) {
if (run.status === 'completed' || run.successCount >= run.target) { completionPanel(run); return; }
await patchRun(run, { status: 'running', stage: 'link', currentItemId: '', lastError: '', event: { type: 'cycle', message: `Oferta ${run.successCount}/${run.target} concluída. Voltando para gerar o próximo link.` } });
showStatus(`✅ Oferta salva com sucesso. Progresso: ${run.successCount}/${run.target}. Voltando ao garimpo...`, 'done'); await sleep(1000); openShopee();
}
async function failAndContinue(run, item, error) {
const attempts = Number(item.attempts?.offer || 0) + 1; const message = clean(error?.message || error);
if (attempts < MAX_OFFER_ATTEMPTS) {
await patchItem(run, item, { stage: 'affiliate-ready', attempts: { ...(item.attempts || {}), offer: attempts }, lastError: message, reason: `A criação da oferta será tentada novamente. Tentativa ${attempts}/${MAX_OFFER_ATTEMPTS}.`, event: { type: 'retry', message: `Falha temporária ao criar a oferta: ${message}` } });
showStatus(`⚠️ ${message} Nova tentativa automática em instantes.`, 'warning'); await sleep(1800); state.busy = false; return schedule(0);
}
const result = await patchItem(run, item, { stage: 'failed-offer', attempts: { ...(item.attempts || {}), offer: attempts }, lastError: message, reason: 'Produto ignorado após falhar ao puxar, gerar ou salvar a oferta.', failedAt: new Date().toISOString(), event: { type: 'failure', message: `Produto ignorado após ${attempts} tentativas: ${message}` } });
const updatedRun = await patchRun(result.run, { status: 'running', stage: 'link', currentItemId: '', lastError: message, event: { type: 'cycle', message: 'A falha não contou na meta. Seguindo para outro produto.' } });
showStatus(`⚠️ Produto ignorado. ${updatedRun.successCount}/${updatedRun.target} salvas, ${updatedRun.failureCount} falha(s). Buscando outro...`, 'warning'); await sleep(1100); openShopee();
}
async function processOffer(run, item) {
showStatus(`🤖 Produção automática: ${run.successCount}/${run.target} salvas • ${run.failureCount} falha(s).`);
await patchRun(run, { status: 'running', stage: 'achou-levou', currentItemId: item.id });
await patchItem(run, item, { stage: 'product-pulling', reason: 'Puxando dados oficiais do produto no Achou Levou.' });
try {
const product = await pullProduct(item); fillScreen(item, product);
await patchItem(run, item, { stage: 'message-generating', productData: product, reason: 'Dados do produto puxados. Gerando mensagem com IA.' });
const generated = await generateMessage(item, product); fillScreen(item, product, generated.message);
await patchItem(run, item, { stage: 'saving-offer', message: generated.message, productData: product, reason: 'Mensagem gerada. Salvando e verificando na fila compartilhada.' });
const saved = await saveVerified(run, item, product, generated.message);
const result = await patchItem(run, item, { stage: 'saved-verified', message: generated.message, savedOfferId: saved.offerId, productData: product, lastError: '', reason: generated.fallback ? 'Oferta salva e verificada usando mensagem local segura.' : 'Oferta salva e verificada com mensagem do Gemini.', completedAt: new Date().toISOString(), event: { type: 'success', message: 'Oferta salva e confirmada na fila compartilhada.' } });
await syncSavedOffers(); await continueWithNext(result.run);
} catch (error) { console.error('[RADAR-AUTOPILOT-ACHOU]', error); await failAndContinue(run, item, error); }
}
async function waitForPage() { for (let attempt = 0; attempt < 80; attempt += 1) { if (byId('input-link') && byId('display-produto') && byId('msg-preview')) return true; await sleep(250); } return false; }
async function main() {
if (state.busy || !document.documentElement) return; state.busy = true;
try {
if (!await waitForPage()) throw new Error('A tela do Achou Levou não terminou de carregar.');
const run = await currentRun(); if (!run) { showStatus('Radar automático aguardando uma nova produção.', 'warning'); return; }
if (run.status === 'completed') { completionPanel(run); return; }
if (['cancelled', 'failed', 'paused'].includes(run.status)) { showStatus(run.lastError || `Execução ${run.status}.`, run.status === 'paused' ? 'warning' : 'error'); return; }
if (run.stage !== 'achou-levou') { showStatus(`🔗 Retomando a geração dos links. Progresso: ${run.successCount}/${run.target}.`); await sleep(500); openShopee(); return; }
const item = pendingItem(run);
if (!item) { await patchRun(run, { status: 'running', stage: 'link', currentItemId: '', event: { type: 'recovery', message: 'Nenhum item pendente no Achou Levou. Retornando ao garimpo.' } }); openShopee(); return; }
await processOffer(run, item);
} catch (error) { state.lastError = clean(error?.message || error); console.error('[RADAR-AUTOPILOT-ACHOU]', error); showStatus(`❌ ${state.lastError}`, 'error'); } finally { state.busy = false; }
}
function schedule(delay = 500) { clearTimeout(state.timer); state.timer = setTimeout(main, delay); }
window.addEventListener('pageshow', () => schedule(300)); window.addEventListener('load', () => schedule(300)); document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(200); });
const observer = new MutationObserver(() => { if (!state.busy && !state.completedRunId) schedule(500); }); observer.observe(document.documentElement, { childList: true, subtree: true });
setInterval(() => { if (!document.hidden && !state.busy && !state.completedRunId) schedule(0); }, 5000);
root.achouLevouAutopilot = { version: VERSION, automatic: true, verifiedSuccessOnly: true, sendsWhatsapp: false, autoTransfer: false, start: main, endpoint: RUNS_ENDPOINT, loadedAt: Date.now() };
schedule(0);
})();
