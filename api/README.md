# Achou Levou API

Backend seguro para gerar mensagens de venda com a Clara pela OpenAI.

## Deploy no Render

1. Acesse o Render.
2. Clique em **New +**.
3. Escolha **Web Service**.
4. Conecte este repositório do GitHub.
5. Configure:

- **Root Directory:** `api`
- **Build Command:** `npm install`
- **Start Command:** `npm start`

6. Em **Environment Variables**, adicione:

```txt
OPENAI_API_KEY=sua_chave_openai
OPENAI_MODEL=gpt-5.6-luna
SHOPEE_APP_ID=app_id_usado_nas_consultas_gerais
SHOPEE_SECRET=secret_usado_nas_consultas_gerais
SHOPEE_JULIO_APP_ID=app_id_do_julio
SHOPEE_JULIO_SECRET=secret_do_julio
SHOPEE_TRACKING_TOKEN_JULIO=token_exclusivo_do_bot_julio
SHOPEE_RENATA_APP_ID=app_id_da_renata
SHOPEE_RENATA_SECRET=secret_da_renata
SHOPEE_TRACKING_TOKEN_RENATA=token_exclusivo_do_bot_renata
```

7. Faça o deploy.

## Teste

Abra no navegador:

```txt
https://sua-api.onrender.com/health
```

Se aparecer:

```json
{"ok":true}
```

A API está funcionando.

## Rastreamento oficial da Shopee por grupo

O endpoint protegido `POST /shopee/rastrear` usa a API oficial de Afiliados da
Shopee para gerar um endereço `https://s.shopee.com.br/...` com até cinco
Sub_ids. Cada robô envia seu próprio token; o servidor usa esse token para
selecionar as credenciais de Júlio ou Renata. APP_ID e SECRET ficam somente no
Render e nunca são enviados ao navegador ou ao WhatsApp.

O robô chama essa rota automaticamente no momento de entregar a oferta a cada
grupo. No `.env` do robô do Júlio, configure o valor de
`SHOPEE_TRACKING_TOKEN_JULIO` como `SHOPEE_TRACKING_TOKEN`. No robô da Renata,
use o valor de `SHOPEE_TRACKING_TOKEN_RENATA`. Assim cada conta recebe seus
próprios Sub_ids, mesmo usando o mesmo serviço no Render.

## Endpoint

POST `/gerar-mensagem`

Exemplo de body:

```json
{
  "produto": "Multivitamínico 120 cápsulas",
  "precoDe": "R$ 89,90",
  "precoPor": "R$ 49,90",
  "desconto": "44% OFF",
  "cupom": "FRETE GRÁTIS",
  "loja": "Shopee",
  "link": "https://s.shopee.com.br/exemplo"
}
```
