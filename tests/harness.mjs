// 아주 작은 테스트 하네스: 한글 요약을 출력한다.
export const results = [];
export async function test(group, name, fn) {
  try { await fn(); results.push({ group, name, ok: true }); }
  catch (e) { results.push({ group, name, ok: false, err: String(e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e) }); }
}
export function assert(c, msg) { if (!c) throw new Error(msg || '검증 실패'); }
export function eq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg || '값 불일치'}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`); }
export async function throws(fn, re, msg) {
  try { await fn(); } catch (e) { if (re && !re.test(String(e.message))) throw new Error(`${msg || '예외 메시지 불일치'}: ${e.message}`); return; }
  throw new Error(msg || '예외가 나야 하는데 안 났음');
}
export function report(title) {
  const groups = {};
  for (const r of results) { (groups[r.group] ||= []).push(r); }
  let fail = 0;
  console.log(`\n===== ${title} =====`);
  for (const [g, rs] of Object.entries(groups)) {
    const ok = rs.filter(r => r.ok).length;
    console.log(`\n[${g}] ${ok}/${rs.length} 통과`);
    for (const r of rs) { console.log(`  ${r.ok ? '✅' : '❌'} ${r.name}${r.ok ? '' : '\n      → ' + r.err}`); if (!r.ok) fail++; }
  }
  console.log(`\n합계: ${results.length - fail}/${results.length} 통과${fail ? `, 실패 ${fail}` : ''}`);
  return fail;
}
