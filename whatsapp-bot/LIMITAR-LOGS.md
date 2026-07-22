# Limitar logs do servidor

O bot usa `pm2-logrotate` para os próprios logs. Para impedir que os logs do sistema e do Google Cloud voltem a ocupar o disco, aplique também os limites abaixo uma única vez.

## Limitar o journal do systemd

```bash
sudo mkdir -p /etc/systemd/journald.conf.d

sudo tee /etc/systemd/journald.conf.d/achou-levou-limits.conf >/dev/null <<'EOF'
[Journal]
SystemMaxUse=200M
RuntimeMaxUse=100M
SystemMaxFileSize=25M
RuntimeMaxFileSize=25M
MaxRetentionSec=7day
EOF

sudo systemctl restart systemd-journald
sudo journalctl --vacuum-size=200M
```

## Girar os logs do Google Cloud Ops Agent

```bash
sudo tee /etc/logrotate.d/google-cloud-ops-agent-subagents >/dev/null <<'EOF'
/var/log/google-cloud-ops-agent/subagents/*.log {
    daily
    size 50M
    rotate 5
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
EOF

sudo logrotate -f /etc/logrotate.d/google-cloud-ops-agent-subagents
```

## Conferência

```bash
df -h /
sudo du -h --max-depth=2 /var/log 2>/dev/null | sort -h | tail -20
```
