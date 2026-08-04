from pathlib import Path

root = Path(__file__).resolve().parents[2]
index_path = root / "index.html"
sw_path = root / "sw.js"

index = index_path.read_text(encoding="utf-8")
index = index.replace("const UI_VERSION = '87';", "const UI_VERSION = '88';")
index = index.replace("?v=87", "?v=88")
shared_tag = '    <script src="shared-offers-client.js?v=88"></script>\n'
anchor = '    <script src="achou-levou-v2.js?v=88"></script>\n'
if 'shared-offers-client.js' not in index:
    if anchor not in index:
        raise SystemExit("Âncora do Achou Levou v2 não encontrada no index.html")
    index = index.replace(anchor, shared_tag + anchor)
index_path.write_text(index, encoding="utf-8")

sw = sw_path.read_text(encoding="utf-8")
sw = sw.replace("achou-levou-v87-status", "achou-levou-v88-shared")
sw = sw.replace("interface v87", "interface v88")
sw = sw.replace("version: '87'", "version: '88'")
sw = sw.replace("set('v', '87')", "set('v', '88')")

shared_interceptor = """
    if (url.includes('shared-offers-client.js')) {
        requestUrl.searchParams.set('v', '88');
        event.respondWith(fetch(requestUrl.toString(), {
            cache: 'no-store',
            credentials: 'omit'
        }));
        return;
    }

"""
anchor_sw = "    if (url.includes('gemini-client.js')) {\n"
if "url.includes('shared-offers-client.js')" not in sw:
    if anchor_sw not in sw:
        raise SystemExit("Âncora do service worker não encontrada")
    sw = sw.replace(anchor_sw, shared_interceptor + anchor_sw)
sw_path.write_text(sw, encoding="utf-8")

print("index.html e sw.js preparados para a release 88 compartilhada")
