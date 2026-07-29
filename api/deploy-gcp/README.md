# Migração da API Achou Levou para Google Cloud

Este procedimento instala apenas a API de consultas em uma nova VM. A VM do WhatsApp, a sessão, os grupos, a fila e os envios não são alterados.

## Arquitetura durante a migração

- GitHub Pages: painel do Achou Levou
- Render: API atual, permanece ligada como produção
- Google Cloud VM nova: API candidata, instalada e testada em paralelo
- Google Cloud VM existente: bot do WhatsApp, permanece intocada

A troca do painel para a nova API só acontece depois dos testes.

## VM recomendada para começar

- Nome: `achou-levou-api`
- Região: `southamerica-east1`
- Zona: qualquer zona disponível nessa região
- Série: E2
- Tipo: `e2-standard-2` ou superior
- Sistema: Debian 12
- Disco: 30 GB ou mais
- Permitir tráfego HTTP e HTTPS
- Usar IP externo estático

O Chromium e o Playwright usam bastante memória. Evite máquinas com apenas 1 GB ou 2 GB.

## 1. Criar a VM

No Google Cloud Console:

1. Acesse **Compute Engine → Instâncias de VM**.
2. Clique em **Criar instância**.
3. Use as configurações recomendadas acima.
4. Marque **Permitir tráfego HTTP** e **Permitir tráfego HTTPS**.
5. Crie a VM.
6. Reserve o IP externo como estático.

## 2. Conectar por SSH

Abra o botão **SSH** da nova VM.

Execute:

```bash
sudo apt-get update
sudo apt-get install -y curl
curl -fsSL https://raw.githubusercontent.com/carvalho832-glitch/Bot-afiliados/main/api/deploy-gcp/bootstrap.sh -o /tmp/achou-levou-bootstrap.sh
sudo DOMAIN=api.achoulevoubot.uk bash /tmp/achou-levou-bootstrap.sh
```

O instalador solicitará:

- endereço do painel do bot, normalmente `https://bot.achoulevoubot.uk`;
- usuário do painel;
- senha do painel.

A senha fica somente na VM em `/etc/achou-levou-api.env`, com permissão restrita.

## 3. Apontar o domínio

Crie ou altere o registro DNS:

```text
Tipo: A
Nome: api
Valor: IP estático da nova VM
```

O domínio esperado será:

```text
api.achoulevoubot.uk
```

## 4. Ativar HTTPS

Depois que o DNS apontar para a VM:

```bash
sudo certbot --nginx -d api.achoulevoubot.uk
```

Teste:

```bash
curl -i https://api.achoulevoubot.uk/health
```

O resultado deve conter `"ok":true`.

## 5. Testes antes da troca

Testar diretamente na nova VM:

```bash
curl -sS https://api.achoulevoubot.uk/health
curl -sS https://api.achoulevoubot.uk/bot/status
curl -sS https://api.achoulevoubot.uk/bot/queue
```

Depois testar no navegador:

- Shopee
- Magalu
- Magazine Você
- Mercado Livre
- Amazon
- leitura do status do WhatsApp
- leitura da fila

Não desligar o Render nesta etapa.

## 6. Troca sem interrupção

Somente depois dos testes:

1. Alterar `API_URL` do painel para `https://api.achoulevoubot.uk`.
2. Publicar uma nova versão do Service Worker.
3. Testar novamente.
4. Manter o Render ativo como reserva por alguns dias.
5. Desligar o Render apenas após a estabilidade estar comprovada.

## Operação da VM

Status:

```bash
sudo systemctl status achou-levou-api
```

Logs ao vivo:

```bash
sudo journalctl -u achou-levou-api -f
```

Reiniciar:

```bash
sudo systemctl restart achou-levou-api
```

Atualizar o código no futuro:

```bash
sudo achou-levou-update
```

Testar Nginx:

```bash
sudo nginx -t
```

Acompanhar uso de recursos:

```bash
htop
```

## Retorno rápido ao Render

Enquanto o Render estiver ligado, basta restaurar o endereço antigo no painel:

```text
https://bot-afiliados-1fwi.onrender.com
```

A VM do WhatsApp não precisa ser reiniciada em nenhum momento desta migração.
