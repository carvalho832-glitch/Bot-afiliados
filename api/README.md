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
GEMINI_MODEL=gemini-1.5-flash
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
