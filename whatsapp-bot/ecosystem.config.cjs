const os = require('os');
const path = require('path');

module.exports = {
  apps: [
    {
      name: 'achou-levou-whatsapp',
      cwd: __dirname,
      script: 'start-production.sh',
      interpreter: '/bin/bash',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      min_uptime: '20s',
      max_restarts: 10,
      restart_delay: 5000,
      exp_backoff_restart_delay: 100,
      kill_timeout: 20000,
      max_memory_restart: '500M',
      time: true,
      merge_logs: true,
      env: {
        NODE_ENV: 'production',
        PORT: '3010',
        TZ: 'America/Sao_Paulo',
        PUPPETEER_CACHE_DIR: path.join(os.homedir(), '.cache', 'puppeteer')
      }
    }
  ]
};
