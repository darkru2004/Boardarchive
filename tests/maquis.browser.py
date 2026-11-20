# 마키 실제 크롬 점검: 시작 화면 → 난이도 선택 → 배치/행동 화면 클릭 → 봇 수로 끝까지 → 결과 → 협력 기록 + 이어하기 + 세 가지 화면 크기
import re, subprocess, sys, time, os
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); PORT = 8126; BASE = f"http://localhost:{PORT}/"
SHOTS = os.environ.get("SHOTS", "/tmp/mqshots"); os.makedirs(SHOTS, exist_ok=True)
srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1"], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
errors, results = [], []
def check(name, fn):
    try: fn(); results.append((name, True, ""))
    except Exception as e: results.append((name, False, str(e)[:300]))
RNG = "const R={next:Math.random,int:k=>Math.floor(Math.random()*k),pick:a=>a[Math.floor(Math.random()*a.length)],shuffle(a){const x=a.slice();for(let i=x.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[x[i],x[j]]=[x[j],x[i]]}return x}};"
DRIVE = "async (stopAt) => {const mod=(await import('/games/maquis.js')).default; const r=document.querySelector('.g-maquis')._mq;" + RNG + """
  let n=0; while(!r.s.over && n<600 && (stopAt==null||n<stopAt)){ const c=mod.botChoose(r.s,{},R); r.run(c.move); await new Promise(z=>setTimeout(z,8)); n++; }
  return {n, over:r.s.over, turn:r.s.turn}}"""
try:
    with sync_playwright() as pw:
        br = pw.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])
        ctx = br.new_context(viewport={"width": 1920, "height": 1080})
        ctx.route(re.compile(r"https://fonts\.(googleapis|gstatic)\.com/.*"), lambda r: r.fulfill(status=200, body="", content_type="text/css"))
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
        page.on("console", lambda m: errors.append("console.error: " + m.text) if m.type == "error" else None)
        page.goto(BASE + "?fast=1"); page.wait_for_selector("#nav a")
        def start():
            page.click(".gcard[data-id=maquis]"); page.wait_for_selector("#btnStart"); page.click("#btnStart"); page.wait_for_selector(".g-maquis .mq-ov")
            page.click(".g-maquis [data-do='diff:tricky']"); page.click(".g-maquis [data-do=start]"); page.wait_for_selector(".g-maquis .mq-hot")
            assert page.evaluate("document.querySelector('.g-maquis')._mq.s.diff") == "tricky"
        check("게임 카드 → 난이도 선택 → 시작", start)
        def place_click():
            page.locator(".g-maquis .mq-hot[data-loc=grocer]").click(); page.wait_for_selector(".g-maquis .mq-pop [data-do='place:grocer']")
            page.click(".g-maquis .mq-pop [data-do='place:grocer']"); page.wait_for_timeout(300)
            assert page.evaluate("document.querySelector('.g-maquis')._mq.s.occ.grocer.t") == "r"
            assert page.evaluate("document.querySelector('.g-maquis')._mq.s.pool") == 1
        check("칸을 눌러 일꾼 배치(순찰이 응수)", place_click)
        def overlays():
            for k in ("rules", "opts"):
                page.click(f".g-maquis [data-do='ov:{k}']"); page.wait_for_selector(".g-maquis .mq-card"); page.keyboard.press("Escape"); page.wait_for_timeout(100)
                assert page.locator(".g-maquis .mq-card").count() == 0
            page.click(".g-maquis [data-do='ov:patrol']"); page.wait_for_selector(".g-maquis .mq-clip"); page.keyboard.press("Escape")
        check("규칙·옵션·순찰 카드 창이 열리고 닫힌다", overlays)
        def to_action():
            page.evaluate("async()=>{const mod=(await import('/games/maquis.js')).default; const r=document.querySelector('.g-maquis')._mq;" + RNG + " while(r.s.phase==='place'){const c=mod.botChoose(r.s,{},R); r.run(c.move); await new Promise(z=>setTimeout(z,8));}}")
            page.wait_for_timeout(200)
            loc = page.evaluate("Object.keys(document.querySelector('.g-maquis')._mq.s.occ).find(k=>document.querySelector('.g-maquis')._mq.s.occ[k].t==='r')")
            page.locator(f".g-maquis .mq-hot[data-loc={loc}]").click(); page.wait_for_selector(".g-maquis .mq-pop [data-do^='retrieve']")
            page.screenshot(path=f"{SHOTS}/action.png")
            assert page.locator(".g-maquis .mq-st").count() >= 1, "귀환 경로 안내가 없음"
        check("행동 단계: 일꾼을 누르면 행동·귀환 경로 안내", to_action)
        def undo():
            before = page.evaluate("JSON.stringify(document.querySelector('.g-maquis')._mq.s.occ)")
            page.evaluate("()=>{const r=document.querySelector('.g-maquis')._mq; const l=Object.keys(r.s.occ).find(k=>r.s.occ[k].t==='r'); r.run({a:'retrieve',loc:l});}"); page.wait_for_timeout(200)
            page.click(".g-maquis [data-do=undo]"); page.wait_for_timeout(200)
            assert page.evaluate("JSON.stringify(document.querySelector('.g-maquis')._mq.s.occ)") == before, "되돌리기가 상태를 못 되돌림"
        check("되돌리기(행동 단계)", undo)
        def resume():
            page.evaluate(DRIVE, 12); page.wait_for_timeout(400)
            page.click(".gmenu .gm"); page.click(".gmenu .gp button:last-child"); page.click(".gmenu .gp button:last-child"); page.wait_for_selector(".gcard[data-id=maquis]")
            page.click(".gcard[data-id=maquis]"); page.wait_for_selector("#btnResume"); page.click("#btnResume"); page.wait_for_selector(".g-maquis .mq-hot")
            assert page.evaluate("document.querySelector('.g-maquis')._mq.s.diff") == "tricky", "이어하기 상태 불일치"
        check("중간에 나갔다가 이어하기", resume)
        def finish():
            r = page.evaluate(DRIVE, None); assert r["over"], "한 판이 끝나지 않음"
            page.wait_for_selector("[data-do=finish]", timeout=6000); page.screenshot(path=f"{SHOTS}/over.png"); page.click("[data-do=finish]")
            page.wait_for_selector("text=홈으로", timeout=8000); page.locator("button:has-text(\"홈으로\")").first.dispatch_event("click"); page.wait_for_selector(".gcard[data-id=maquis]")
        check("끝까지 → 결과 → 홈", finish)
        check("협력 기록으로 저장(난이도·결과 상세 포함)", lambda: (lambda r: None if r and r["mode"] == "coop" and r["gameId"] == "maquis" and r.get("detail", {}).get("diff") == "tricky" and r.get("detail", {}).get("outcome") in ("win", "draw", "lose") else (_ for _ in ()).throw(AssertionError(str(r))))(page.evaluate("window.__ba.storage.all('records').then(a=>a.map(x=>x.value).filter(r=>r.gameId==='maquis').pop())")))
        for name, (w, h) in {"land": (844, 390), "port": (390, 844)}.items():
            def sizes(name=name, w=w, h=h):
                c2 = br.new_context(viewport={"width": w, "height": h}); c2.route(re.compile(r"https://fonts\.(googleapis|gstatic)\.com/.*"), lambda r: r.fulfill(status=200, body="", content_type="text/css"))
                p2 = c2.new_page(); p2.on("pageerror", lambda e: errors.append(name + " pageerror: " + str(e)))
                p2.goto(BASE + "?fast=1"); p2.wait_for_selector("#nav a"); p2.click(".gcard[data-id=maquis]"); p2.wait_for_selector("#btnStart"); p2.click("#btnStart"); p2.wait_for_selector(".g-maquis [data-do=start]")
                p2.click(".g-maquis [data-do=start]"); p2.wait_for_selector(".g-maquis .mq-hot"); p2.screenshot(path=f"{SHOTS}/{name}.png")
                ov = p2.evaluate("()=>{const s=document.querySelector('.mq-stage').getBoundingClientRect(); return [document.documentElement.scrollWidth, s.width, s.height]}")
                assert ov[0] <= w + 2, f"가로 넘침 {ov}"
                c2.close()
            check(f"{name} 화면에서 열린다(가로 넘침 없음)", sizes)
        check("콘솔 오류 없음", lambda: (_ for _ in ()).throw(AssertionError("; ".join(errors[:3]))) if errors else None)
        br.close()
finally:
    srv.terminate()
bad = [r for r in results if not r[1]]
for n, ok, e in results: print(("✅ " if ok else "❌ ") + n + ("" if ok else "\n    → " + e))
print(f"합계: {len(results) - len(bad)}/{len(results)} 통과"); sys.exit(1 if bad else 0)
