(() => {
  const STORAGE_OFERTAS = 'ofertas_achou_levou';
  const STORAGE_BOT_CONFIG = 'achou_levou_bot_whatsapp_config';
  const DEFAULT_BOT_URL = 'http://35.253.196.37:3010';

  function carregarConfigBot() {
    try {
      const salvo = JSON.parse(localStorage.getItem(STORAGE_BOT_CONFIG) || '{}');
      return {
        url: salvo.url || DEFAULT_BOT_URL,
        user: salvo.user || 'julio',
        pass: salvo.pass || ''
      };
    } catch {
      return {
        url: DEFAULT_BOT_URL,
        user: 'julio',
        pass: ''
      };
    }
  }

  function salvarConfigBot(config) {
    localStorage.setItem(STORAGE_BOT_CONFIG, JSON.stringify