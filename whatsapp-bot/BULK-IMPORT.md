# Importação em lote de ofertas

A importação em lote é uma rota adicional. Ela não substitui nem altera o fluxo existente de `/queue/add`.

## Segurança

Defina no `.env` do robô:

```txt
BULK_IMPORT_TOKEN=use-um-valor-longo-e-aleatorio
```

Se `BULK_IMPORT_TOKEN` não estiver configurado, a rota responde `503` e não grava nada.

A chamada deve enviar o mesmo valor no cabeçalho `X-Import-Token`.

## Endpoint

`POST /queue/import-batch`

Exemplo de corpo JSON:

```json
{
  "messages": [
    "Mensagem completa da oferta 1",
    "Mensagem completa da oferta 2"
  ],
  "settings": {
    "windowStart": "07:45",
    "windowEnd": "21:45",
    "intervalMinutes": 40,
    "offersPerBatch": 3,
    "dailyLimit": 55
  },
  "start": false
}
```

Também é aceito `text`, separando as mensagens por uma linha contendo apenas `---`.

## Comportamento

- até 200 ofertas por importação;
- cada mensagem pode ter até 20.000 caracteres;
- horários precisam estar em `HH:MM`;
- `intervalMinutes`: 1 a 1440;
- `offersPerBatch`: 1 a 20;
- `dailyLimit`: 1 a 1000;
- as novas ofertas são acrescentadas à fila, sem apagar itens existentes;
- os grupos continuam sendo escolhidos pela lógica de categoria já usada pelo bot;
- `start: false` apenas importa e configura;
- `start: true` habilita o bot e tenta iniciar a fila;
- se houver falha durante a gravação da importação, fila e configurações anteriores são restauradas;
- se a importação for concluída mas o início da fila falhar, as ofertas permanecem salvas e a resposta informa o problema.

## Exemplo com curl no próprio servidor

```bash
curl -X POST http://127.0.0.1:3010/queue/import-batch \
  -H 'Content-Type: application/json' \
  -H "X-Import-Token: $BULK_IMPORT_TOKEN" \
  --data @pacote-ofertas.json
```

O token não deve ser colocado em arquivos versionados, mensagens de oferta ou código do front-end.
