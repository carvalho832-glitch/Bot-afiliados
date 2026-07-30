(function () {
  const BRIDGE_BASE = 'https://bot-afiliados-1fwi.onrender.com';

  function instalarCompatibilidade() {
    if (!window.AchouLevouBotQueue) {
      setTimeout(instalarCompatibilidade, 100);
      return;
    }

    window.AchouLevouBotQueue.readBridgeUrl = BRIDGE_BASE;
    console.log('Ponte de compatibilidade carregada sem interceptar window.fetch.');
  }

  instalarCompatibilidade();
})();