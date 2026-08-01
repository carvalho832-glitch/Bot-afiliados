# Achou Levou API

Backend seguro para gerar mensagens de venda usando Gemini.

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
GEMINI_API_KEY=sua_chave_gemini
GEMINI_MODEL=gemini-3.6-flash
SHOPEE_APP_ID=seu_app_id
SHOPEE_SECRET=seu_app_secret
SHOPEE_TRACKING_TOKEN=um_token_longo_e_exclusivo
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
Sub_ids. As credenciais `SHOPEE_APP_ID` e `SHOPEE_SECRET` ficam somente no
Render e nunca são enviadas ao navegador ou ao WhatsApp.

O robô chama essa rota automaticamente no momento de entregar a oferta a cada
grupo. Configure o mesmo `SHOPEE_TRACKING_TOKEN` no Render e no `.env` do robô.
Se a API estiver indisponível, o robô mantém o link original e continua a fila.

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
