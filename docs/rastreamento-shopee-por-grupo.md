# Rastreamento Shopee por grupo — desenho de produção

## Fluxo

1. A oferta original permanece salva na fila.
2. Imediatamente antes do envio, o robô identifica o grupo de destino.
3. O robô solicita ao Render um link com os cinco Sub_ids daquele grupo.
4. O Render assina a requisição usando o App ID e o Secret da Shopee.
5. A API de Afiliados devolve um link oficial `s.shopee.com.br`.
6. O robô substitui o link apenas na cópia destinada àquele grupo.
7. O resultado é salvo em `trackingByTarget`, evitando gerar outro link em uma
   tentativa repetida.

## Sub_ids

| Posição | Exemplo | Uso |
|---|---|---|
| 1 | `gfeiradabarganhaa1b2c3` | grupo real do WhatsApp |
| 2 | `of1785548415297abcd` | oferta da fila |
| 3 | `catgeral` | categoria do bot |
| 4 | `h0730` | horário efetivo do envio |
| 5 | `wa20260731` | canal e data |

A API brasileira aceita somente letras e números nos Sub_ids; por isso os
marcadores são enviados sem espaços, sublinhados ou hífens.

## Segurança e continuidade

- Somente domínios oficiais da Shopee são aceitos na entrada.
- Somente respostas no domínio `s.shopee.com.br` são aplicadas à mensagem.
- O Secret da Shopee existe apenas no Render.
- A rota exige autenticação e tem limite de requisições.
- Falha de rede, limite ou erro da Shopee não para a fila: o link original é
  enviado e o evento fica marcado como `fallback`.
- Nenhum nome, telefone ou identidade de participante do grupo é coletado.
