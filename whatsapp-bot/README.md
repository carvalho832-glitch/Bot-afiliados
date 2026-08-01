# Achou Levou — robô do WhatsApp

O robô envia a fila de ofertas aos grupos selecionados e gera um link oficial
da Shopee diferente para cada grupo no momento da entrega.

## Rastreamento por Sub_id

Para ofertas da Shopee, o robô troca somente o endereço da mensagem por outro
endereço oficial `https://s.shopee.com.br/...`. Não existe página intermediária,
encurtador próprio ou coleta de dados pessoais. O clique abre a Shopee.

Cada link recebe cinco marcadores:

1. grupo do WhatsApp (nome normalizado + hash do ID real);
2. oferta da fila;
3. categoria;
4. horário real do envio;
5. canal e data.

O hash diferencia grupos que tenham nomes iguais. Se o Render ou a API da
Shopee não responder, a mensagem é enviada com o link original e o painel
registra `Fallback com link original`.

## Configuração

No `.env` deste servidor:

```txt
SHOPEE_TRACKING_API_URL=https://bot-afiliados-1fwi.onrender.com/shopee/rastrear
SHOPEE_TRACKING_TOKEN=mesmo_token_configurado_no_render
SHOPEE_TRACKING_TIMEOUT_MS=45000
SHOPEE_TRACKING_TIME_ZONE=America/Sao_Paulo
```

Depois de atualizar o código, execute `npm run check`, `npm test` e o processo
normal de instalação/reinício (`bash setup-server.sh`).
