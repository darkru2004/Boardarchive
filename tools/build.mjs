// 배포 전에 실행: precache.json(오프라인 저장 파일 목록)을 새로 만든다. node tools/build.mjs
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(fileURLToPath(import.meta.url), '..', '..');
const SKIP = new Set(['tests', 'tools', 'node_modules', 'precache.json', 'sw.js', '.git']);
const out = [];
(function walk(d) {
  for (const n of readdirSync(d)) {
    if (SKIP.has(n) || n.startsWith('.')) continue;
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p); else out.push(relative(root, p).split('\\').join('/'));
  }
})(root);
out.sort();
writeFileSync(join(root, 'precache.json'), JSON.stringify({ files: ['./', ...out] }, null, 1) + '\n');
console.log(`precache.json: ${out.length}개 파일`);
