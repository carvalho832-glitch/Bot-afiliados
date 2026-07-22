# Achou Levou WhatsApp Bot em produção

Este diretório possui uma inicialização protegida para evitar a repetição dos problemas que derrubaram o painel.

## Proteções incluídas

- Reaplica automaticamente a correção da rota `/groups` após qualquer `git pull`.
- Protege o JavaScript interno do painel para que a lista de grupos carregue corretamente.
- Instala automaticamente o Chrome exigido pelo Puppeteer quando ele não existir.
- Mantém apenas uma instância do bot na porta `3010`.
- Reinicia o processo automaticamente com PM2.
- Configura rotação dos logs do PM2 para evitar que o disco fique cheio.
- Remove os processos antigos `fiscal-grupos-observador` e `achou-levou-timer`.

## Instalação ou reparo no servidor

```bash
cd /home/carvalho832/Bot-afiliados
git pull origin main
cd whatsapp-bot
bash setup-server.sh
```

O script inicia o processo usando `ecosystem.config.cjs` e salva a lista no PM2.

## Inicialização após reiniciar a VM

Execute uma única vez no servidor:

```bash
sudo env PATH="$PATH" pm2 startup systemd -u "$USER" --hp "$HOME"
pm2 save
```

## Verificações

```bash
pm2 list
curl -s http://127.0.0.1:3010/status | python3 -m json.tool
curl -s http://127.0.0.1:3010/groups | python3 -m json.tool
```

Resultados esperados:

- processo `achou-levou-whatsapp` com status `online`;
- `/status` com `"status": "conectado"`;
- `/groups` com `"ok": true` e a lista de grupos.

## Comandos úteis

```bash
pm2 logs achou-levou-whatsapp --lines 100 --nostream
pm2 restart achou-levou-whatsapp
pm2 save
df -h /
```

Não apague a pasta `.wwebjs_auth`, pois ela contém a sessão conectada do WhatsApp.
