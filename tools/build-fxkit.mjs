// 연출 엔진 이식용 묶음(fx-kit/ + fx-kit.zip)을 만든다. 앱의 src/fx.js, src/fxscenes.js를 그대로 복사하므로 앱과 어긋나지 않는다.
// node tools/build-fxkit.mjs [출력 폴더]
import { mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = join(fileURLToPath(import.meta.url), '..', '..');
const out = process.argv[2] || join(root, 'fx-kit');
rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
copyFileSync(join(root, 'src/fx.js'), join(out, 'fx.js'));
copyFileSync(join(root, 'src/fxscenes.js'), join(out, 'fxscenes.js'));
copyFileSync(join(root, 'tools/fxkit/README.md'), join(out, 'README.md'));
execFileSync('node', [join(root, 'tools/build-fxlab.mjs'), join(out, 'demo.html')], { stdio: 'inherit' });
writeFileSync(join(out, 'example.html'), `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FX Kit 예제</title>
<style>body{margin:0;background:#1f4d3a;color:#fff;font-family:sans-serif}#board{position:relative;height:100vh;display:grid;place-items:center;gap:20px;align-content:center}
.c{width:70px;height:100px;border-radius:8px;background:#f3ead2;color:#333;display:grid;place-items:center;font-size:28px}.row{display:flex;gap:10px}button{padding:10px 14px;font-size:16px}</style></head><body>
<div id="board"><div class="row" id="opp"><div class="c">적1</div><div class="c">적2</div></div>
<div class="row"><div class="c" id="deck">덱</div><div class="c" id="play">▢</div><div class="c" id="score">0</div></div>
<div class="row" id="hand"><div class="c">1</div><div class="c">2</div><div class="c">3</div></div>
<div class="row" id="btns"></div></div>
<script type="module">
import { makeFx } from './fx.js'; import { playScene, SCENE_NAMES } from './fxscenes.js';
const $ = id => document.getElementById(id), fx = makeFx().scope($('board'));
const t = () => ({ hand: [...$('hand').children], deck: $('deck'), play: $('play'), me: $('hand'), score: $('score'), opp: [...$('opp').children], pot: $('deck'), tile: $('play'), board: $('board') });
for (const n of SCENE_NAMES) { const b = document.createElement('button'); b.textContent = n; b.onclick = () => playScene(fx, n, t()); $('btns').append(b); }
</script></body></html>`);
execFileSync('zip', ['-qr', out + '.zip', '.'], { cwd: out });
console.log('만들었어요:', out, '+', out + '.zip');
