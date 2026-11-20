# Quests Over Coffee 실제 크롬 점검: PC·폰 화면 → 설정 → 클릭으로 한 퀘스트 → 팝업 → 봇 수로 끝까지 → 결과 → 기록 + 이어하기
import re, subprocess, sys, time, os
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); PORT = 8127; BASE = f"http://localhost:{PORT}/"
SHOTS = os.environ.get("SHOTS", "/tmp/qocshots"); os.makedirs(SHOTS, exist_ok=True)
srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1"], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
errors, results = [], []
def check(name, fn):
    try: fn(); results.append((name, True, ""))
    except Exception as e: results.append((name, False, str(e)[:300]))
DRIVE = """async (stopAt) => {
  const mod = (await import('/games/qoc.js')).default;
  const root = document.querySelector('.g-qoc').parentElement._qoc; let n = 0;
  const rr = {next:Math.random,int:k=>Math.floor(Math.random()*k),pick:a=>a[Math.floor(Math.random()*a.length)],shuffle:a=>a.slice()};
  while (!root.state.over && n < 400 && (stopAt == null || n < stopAt)) { const m = mod.botChoose(root.state, {}, rr).move; root.run(m); n++; }
  return {n, over: root.state.over};
}"""
def run(viewport, tag):
    with sync_playwright() as pw:
        br = pw.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])
        ctx = br.new_context(viewport=viewport)
        ctx.route(re.compile(r"https://fonts\.(googleapis|gstatic)\.com/.*"), lambda r: r.fulfill(status=200, body="", content_type="text/css"))
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
        page.on("console", lambda m: errors.append("console.error: " + m.text) if m.type == "error" else None)
        page.goto(BASE + "?fast=1"); page.wait_for_selector("#nav a")
        def start():
            page.click(".gcard[data-id=qoc]"); page.wait_for_selector("#btnStart"); page.click("#btnStart"); page.wait_for_selector(".g-qoc .qc-setup .qc-sh")
            page.screenshot(path=f"{SHOTS}/{tag}-setup.png")
            page.click("[data-act=start]"); page.wait_for_selector(".g-qoc .qc-sheet .qc-pc")   # 시작 아이템 고르기
        check(f"[{tag}] 홈 → 설정창 → 시작 → 시작 아이템 선택창", start)
        def keep():
            page.screenshot(path=f"{SHOTS}/{tag}-keep.png")
            page.locator(".qc-sheet [data-act=mv]").first.click(); page.wait_for_selector(".g-qoc .qc-qrow .qc-card")
            page.screenshot(path=f"{SHOTS}/{tag}-pick.png")
            n = page.locator(".qc-qrow .qc-card").count(); assert n == 5, f"퀘스트 카드 {n}장"
        check(f"[{tag}] 시작 아이템 선택 → 퀘스트 5장", keep)
        def quest():
            page.locator(".qc-qrow .qc-card").first.click(); page.wait_for_selector(".qc-sh .qc-fr"); page.screenshot(path=f"{SHOTS}/{tag}-qsheet.png")
            page.locator(".qc-sh [data-act=mv]").first.click(); page.wait_for_selector(".qc-dice .qc-die"); page.wait_for_timeout(150)
            assert page.locator(".qc-die").count() >= 2
            page.locator(".qc-die").first.click(); page.screenshot(path=f"{SHOTS}/{tag}-roll.png")
            assert "sel" in (page.locator(".qc-die").first.get_attribute("class") or ""), "주사위 선택 안 됨"
        check(f"[{tag}] 퀘스트 카드 → 한글 팝업 → 도전 → 주사위 선택", quest)
        def overflow():
            w = page.evaluate("document.documentElement.scrollWidth"); assert w <= viewport["width"] + 2, f"가로 넘침 {w}"
            if tag == "pc":
                h = page.evaluate("document.documentElement.scrollHeight"); assert h <= viewport["height"] + 4, f"세로 넘침 {h}"
        check(f"[{tag}] 화면 넘침 없음", overflow)
        def done_and_menu():
            page.locator("[data-act=done]").click(); page.wait_for_timeout(300)
            while page.locator(".qc-sheet:not([hidden]) .qc-back:not([data-act])").count():   # 반응창 등 → 첫 선택지
                page.locator(".qc-sheet [data-act=mv]").last.click(); page.wait_for_timeout(120)
            page.click("[data-act=rules]"); page.wait_for_selector(".qc-rules"); page.click(".qc-sh [data-act=close]")
            page.click("[data-act=cards]"); page.wait_for_selector(".qc-li"); page.screenshot(path=f"{SHOTS}/{tag}-cards.png"); page.click(".qc-sh [data-act=close]")
        check(f"[{tag}] 결과 확정 · 규칙 · 카드 목록", done_and_menu)
        if tag == "pc":
            def resume():
                page.evaluate(DRIVE, 10); page.wait_for_timeout(400)
                page.click(".gmenu .gm"); page.click(".gmenu .gp button:last-child"); page.click(".gmenu .gp button:last-child"); page.wait_for_selector(".gcard[data-id=qoc]")
                page.click(".gcard[data-id=qoc]"); page.wait_for_selector("#btnResume"); page.click("#btnResume"); page.wait_for_selector(".g-qoc .qc-c .qc-h, .g-qoc .qc-c .qc-roll")
            check("중간에 나갔다가 이어하기", resume)
            def finish():
                r = page.evaluate(DRIVE, None); assert r["over"], "한 판이 끝나지 않음"
                page.wait_for_selector("[data-act=quit]", timeout=5000); page.screenshot(path=f"{SHOTS}/{tag}-over.png"); page.click("[data-act=quit]")
                page.wait_for_selector("text=홈으로", timeout=8000); page.locator("button:has-text(\"홈으로\")").first.dispatch_event("click"); page.wait_for_selector(".gcard[data-id=qoc]")
            check("끝까지 → 결과 → 홈", finish)
            check("협력 기록으로 저장", lambda: (lambda r: None if r and r["mode"] == "coop" and r["gameId"] == "qoc" else (_ for _ in ()).throw(AssertionError(str(r))))(page.evaluate("window.__ba.storage.all('records').then(a => a.map(x=>x.value).find(v=>v.gameId==='qoc')||null)")))
        br.close()
try:
    run({"width": 1920, "height": 1080}, "pc")
    run({"width": 390, "height": 844}, "mobile")
    check("콘솔 오류 없음", lambda: (_ for _ in ()).throw(AssertionError("; ".join(errors[:3]))) if errors else None)
finally:
    srv.terminate()
bad = [r for r in results if not r[1]]
for n, ok, e in results: print(("✅ " if ok else "❌ ") + n + ("" if ok else "\n    → " + e))
print(f"합계: {len(results) - len(bad)}/{len(results)} 통과"); sys.exit(1 if bad else 0)
