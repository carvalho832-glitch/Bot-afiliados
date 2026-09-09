# Deploy dos bots no Render Free

Esta pasta contém dois Blueprints independentes para o mesmo repositório:

- `render/render-julio.yaml`
- `render/render-renata.yaml`

Use um Blueprint por workspace do Render para que cada bot tenha sua própria franquia mensal do plano Free.

## Júlio

No Render:

1. New > Blueprint.
2. Conecte o repositório `carvalho832-glitch/Bot-afiliados`.
3. Branch: `feat/render-free-dual-bot`.
4. Blueprint path: `render/render-julio.yaml`.
5. Preencha as variáveis marcadas como segredo quando o Render solicitar:
   - `R2_ACCOUNT_ID`
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `SHOPEE_TRACKING_TOKEN`
6. O bucket esperado é `achou-levou-bot-backups`.
7. Aguarde o deploy e abra `/qr-page` no endereço do serviço para o primeiro login do WhatsApp.

## Renata

Repita em outro workspace:

1. New > Blueprint.
2. Mesmo repositório e branch.
3. Blueprint path: `render/render-renata.yaml`.
4. Use as mesmas credenciais do bucket R2, mas o token Shopee exclusivo da Renata.
5. O backup fica separado automaticamente pelo `BOT_PROFILE`.

## Como a persistência funciona

O Render Free possui filesystem efêmero. Antes de iniciar, `start-render-free.sh` tenta restaurar do Cloudflare R2:

- `.wwebjs_auth/` (sessão WhatsApp)
- `data/` (fila, configurações e runtime)

Enquanto o serviço está ligado, um snapshot é enviado ao R2 a cada 600 segundos. Ao receber encerramento, o script também tenta um snapshot final.

Após a restauração, apenas travas temporárias do Chromium (`SingletonLock`, `SingletonSocket`, `SingletonCookie` e `DevToolsActivePort`) são removidas. A sessão do WhatsApp não é apagada.

## Keep-alive programado

O diretório `cloudflare-render-keeper/` contém o Worker do Cloudflare. Ele faz ping nos dois serviços a cada 10 minutos durante a janela configurada e para fora desse horário, permitindo que o Render Free entre em spin-down.

Depois que os dois serviços forem criados, substitua no `wrangler.jsonc`:

- `JULIO_RENDER_URL`
- `RENATA_RENDER_URL`

Por padrão o Worker mantém os serviços acordados de 07:00 até 22:20, horário de São Paulo, e não mantém domingo acordado quando `RUN_SUNDAY=false`.

## Validação antes de migrar o painel

Faça primeiro o piloto do Júlio:

1. Login por QR.
2. Aguarde pelo menos um backup R2.
3. Confirme `/status` como conectado.
4. Reinicie o serviço no Render.
5. Confirme que volta conectado sem novo QR.
6. Teste uma fila pequena.
7. Somente depois repita para Renata e altere os domínios do painel.
