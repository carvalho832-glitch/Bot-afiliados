const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const panelPath = path.join(root, 'panel.html');
const modulePath = path.join(root, 'phase22-control.js');
const startMarker = '<!-- PHASE22_GUIDED_CONTROL_START -->';
const endMarker = '<!-- PHASE22_GUIDED_CONTROL_END -->';

if (!fs.existsSync(panelPath)) {
  throw new Error(`Painel não encontrado: ${panelPath}`);
}
if (!fs.existsSync(modulePath)) {
  throw new Error(`Módulo da Fase 22 não encontrado: ${modulePath}`);
}

let html = fs.readFileSync(panelPath, 'utf8');
const source = fs.readFileSync(modulePath, 'utf8')
  .replace(/<\/script/gi, '<\\/script');

const oldBlock = new RegExp(
  `${startMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${endMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`,
  'g'
);
html = html.replace(oldBlock, '');

const block = `\n${startMarker}\n<script>\n${source}\n</script>\n${endMarker}\n`;
if (!html.includes('</body>')) {
  throw new Error('O painel não contém a tag </body>.');
}
html = html.replace('</body>', `${block}</body>`);
fs.writeFileSync(panelPath, html, 'utf8');

const finalHtml = fs.readFileSync(panelPath, 'utf8');
const markerCount = (finalHtml.match(/PHASE22_GUIDED_CONTROL_START/g) || []).length;
if (markerCount !== 1 || !finalHtml.includes("const VERSION = '22.0.0'")) {
  throw new Error('A injeção da Fase 22 não foi validada.');
}

console.log('✅ Assistente guiado da Fase 22 injetado no Painel WhatsApp.');
