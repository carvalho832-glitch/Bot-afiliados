'use strict';

const fs = require('fs');
const crypto = require('crypto');

function replaceOnce(file, before, after) {
  const source = fs.readFileSync(file, 'utf8');
  if (!source.includes(before)) {
    throw new Error(`Trecho esperado não encontrado em ${file}. Nenhuma alteração foi aplicada.`);
  }
  fs.writeFileSync(file, source.replace(before, after));
  console.log(`[PATCH] ${file} atualizado.`);
}

const serverBefore = `app.post('/send-controlado', async (req, res) => {
  try {
    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ ok: false, error: 'Mensagem vazia.' });
    const category = normalizarCategoria(req.body?.category || req.body?.categoria);
    const result = await sendMessageToConfiguredGroups(message, category || null);
    res.status(result.ok ? 200 : 400).json(result);
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
});`;

const serverAfter = `app.post('/send-controlado', async (req, res) => {
  const requestId = crypto.randomUUID().slice(0, 8);
  const startedAt = Date.now();
  try {
    const message = String(req.body?.message || '').trim();
    const connection = getConnectionState();
    const selectedGroups = getSettings().selectedGroups.length;
    console.log(\`[ENVIO-HTTP][\${requestId}] Recebido. status=\${connection.status} grupos=\${selectedGroups} chars=\${message.length}\`);
    if (!message) {
      console.warn(\`[ENVIO-HTTP][\${requestId}] Rejeitado: mensagem vazia.\`);
      return res.status(400).json({ ok: false, requestId, error: 'Mensagem vazia.' });
    }
    const category = normalizarCategoria(req.body?.category || req.body?.categoria);
    const result = await sendMessageToConfiguredGroups(message, category || null);
    const elapsedMs = Date.now() - startedAt;
    console.log(\`[ENVIO-HTTP][\${requestId}] Concluído em \${elapsedMs} ms. ok=\${result.ok} sucessos=\${result.results?.filter(item => item.ok).length || 0} falhas=\${result.results?.filter(item => !item.ok).length || 0}\`);
    res.status(result.ok ? 200 : 400).json({ ...result, requestId, elapsedMs });
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    console.error(\`[ENVIO-HTTP][\${requestId}] Erro após \${elapsedMs} ms:\`, error?.stack || error);
    res.status(500).json({ ok: false, requestId, elapsedMs, error: String(error?.message || error) });
  }
});`;

const panelBefore = `async function enviarMensagem(){const message=document.getElementById('mensagem').value.trim();if(!message)return;const r=await fetch('/send-controlado',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message})});const j=await r.json();document.getElementById('resultado').textContent=j.ok?'✅ Enviada para: '+j.groupName:'Erro: '+(j.error||'falha')}`;

const panelAfter = `async function enviarMensagem(){const message=document.getElementById('mensagem').value.trim();const box=document.getElementById('resultado');const button=document.querySelector('button[onclick="enviarMensagem()"]');if(!message){box.textContent='Digite uma mensagem.';return}if(button.disabled){box.textContent='Envio já está em andamento. Aguarde.';return}button.disabled=true;button.textContent='Enviando...';box.textContent='Solicitando envio ao servidor...';const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),45000);try{const r=await fetch('/send-controlado',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message}),signal:controller.signal});const text=await r.text();let j;try{j=JSON.parse(text)}catch{throw new Error('Resposta inválida do servidor: '+text.slice(0,180))}const id=j.requestId?' [ID '+j.requestId+']':'';box.textContent=j.ok?'✅ Enviada para: '+j.groupName+id:'Erro: '+(j.error||'falha')+id}catch(error){box.textContent=error.name==='AbortError'?'Erro: o servidor não respondeu em 45 segundos. Não clique novamente; verifique os logs.':'Erro de comunicação: '+error.message}finally{clearTimeout(timeout);button.disabled=false;button.textContent='Enviar aos grupos selecionados'}}`;

replaceOnce('server.js', serverBefore, serverAfter);
replaceOnce('panel.html', panelBefore, panelAfter);

// O novo bloco do servidor usa crypto.randomUUID().
const server = fs.readFileSync('server.js', 'utf8');
if (!server.includes("import crypto from 'crypto';")) {
  fs.writeFileSync('server.js', server.replace("import cors from 'cors';", "import cors from 'cors';\nimport crypto from 'crypto';"));
  console.log('[PATCH] Import de crypto adicionado ao server.js.');
}

console.log('[PATCH] Diagnóstico do envio instalado com sucesso.');
