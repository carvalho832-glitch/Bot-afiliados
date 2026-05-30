(() => {
  const STORE = 'ofertas_achou_levou';
  const CFG = 'achou_levou_bot_whatsapp_config';
  const DEFAULT_URL = 'http://35.253.196.37:3010';

  const $ = id => document.getElementById(id);

  function cfg() {
    try {
      return { url: DEFAULT_URL, user: 'julio', pass: '', ...JSON.parse(localStorage.getItem(CFG) || '{}') };
    } catch {
      return { url: DEFAULT_URL, user: 'julio', pass: '' };
    }
  }

  function