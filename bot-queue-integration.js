(() => {
  const STORAGE_OFERTAS = 'ofertas_achou_levou';
  const STORAGE_CONFIG = 'achou_levou_bot_whatsapp_config';
  const DEFAULT_BOT_URL = 'http://35.253.196.37:3010';

  function getConfig() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_CONFIG) || '{}');
      return {
        url: saved.url || DEFAULT_BOT_URL,
        user: saved.user || 'julio',
        pass: saved.pass || ''
      };
    } catch {
      return { url: DEFAULT_BOT_URL, user: 'julio', pass: '' };
    }
  }

  function saveConfig(config) {
    localStorage.setItem(STORAGE_CONFIG, JSON.stringify(config));
  }

  function getOfertas() {
    try