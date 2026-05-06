// Service Worker super leve apenas para habilitar a instalação do PWA no celular
self.addEventListener('install', (event) => {
    console.log('Robô Achou Levou instalado com sucesso!');
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('Robô Achou Levou ativado!');
});

self.addEventListener('fetch', (event) => {
    // Vazio de propósito para NÃO fazer cache. 
    // Assim, toda mudança que você fizer no Acode atualiza no celular na mesma hora.
    return;
});
