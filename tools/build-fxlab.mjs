// 연출 시험장을 HTML 파일 하나로 뽑는다 (앱 없이 바로 열어 보기용). 앱 안 시험장과 같은 코드(src/fx.js + src/fxlab.js)를 쓴다.
// node tools/build-fxlab.mjs <출력 경로>
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(fileURLToPath(import.meta.url), '..', '..');
const out = process.argv[2] || join(root, 'fxlab.html');
const read = p => readFileSync(join(root, p), 'utf8');
const strip = src => src.replace(/^import .*$/gm, '').replace(/^export (const|function|async function|let)/gm, '$1');
const ui = `
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v; else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) e.setAttribute(k, ''); else e.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) { if (kid == null || kid === false) continue; e.append(kid.nodeType ? kid : document.createTextNode(String(kid))); }
  return e;
}
function toast(msg) { const d = h('div', {}, msg); document.getElementById('toast').append(d); setTimeout(() => d.remove(), 3200); }`;
const boot = `
const app = { fast: false, standalone: true, async render() { const r = h('div', {}); await fxLabView(app, r); document.getElementById('view').replaceChildren(r); } };
app.render();`;
const ver = (() => { try { return JSON.parse(read('games/index.json')).schemaVersion; } catch { return ''; } })();
const html = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>FX Lab — 연출 시험장</title>
<style>${read('src/style.css')}
#toast{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:6px}
#toast div{background:#2e2d29;color:#f3ead2;padding:8px 14px;border-radius:8px;font-size:13px}
#view{max-width:600px;margin:0 auto;padding:8px 10px 40px}
</style></head>
<body><main id="view"></main><div id="toast"></div>
<script>
${ui}
const { makeFx, fxPrefs } = (() => {
${strip(read('src/fx.js'))}
return { makeFx, fxPrefs };
})();
const { fxLabView } = (() => {
${strip(read('src/fxlab.js'))}
return { fxLabView };
})();
${boot}
</script></body></html>
`;
writeFileSync(out, html);
console.log('만듦:', out, (html.length / 1024).toFixed(0) + 'KB', ver ? '' : '');
