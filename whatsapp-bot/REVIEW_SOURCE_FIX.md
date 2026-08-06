# Correção da rota de revisão

A rota `/queue/review-source` é registrada diretamente com `app.route(...).get(...)`.

Ela é somente leitura, não altera a fila e devolve os itens pendentes. Quando não há item pendente, devolve apenas o item mais recente como fallback para recuperar a mensagem que ainda aparece no painel.
