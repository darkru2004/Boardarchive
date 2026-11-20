# 에이전트 데커 실제 크롬 점검: 시작 → 봇 수로 끝까지(화면 갱신 포함) → 결과 → 협력 기록 저장 + 이어하기 확인
import re, subprocess, sys, time, os
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); PORT = 8125; BASE = f"http://localhost:{PORT}/"
SHOTS = os.environ.get("SHOTS", "/tmp/adshots"); os.makedirs(SHOTS, exist_ok=True)
srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1"], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
errors, results = [], []
def check(name, fn):
    try: fn(); results.append((name, True, ""))
    except Exception as e: results.append((name, False, str(e)[:300]))
DRIVE = """async (stopAt) => {
  const mod = (await import('/games/agentdecker.js')).default;
  const root = document.querySelector('.g-ad').parentElement._ad; let n = 0;
  while (!root.state.over && n < 700 && (stopAt == null || n < stopAt)) { const m = mod.botChoose(root.state, {}, {next:Math.random,int:k=>Math.floor(Math.random()*k),pick:a=>a[Math.floor(Math.random()*a.length)],shuffle:a=>a}).move; root.run(m); n++; }
  return {n, over: root.state.over};
}"""
try:
    with sync_playwright() as pw:
        br = pw.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])
        ctx = br.new_context(viewport={"width": 390, "height": 844})
        ctx.route(re.compile(r"https://fonts\.(googleapis|gstatic)\.com/.*"), lambda r: r.fulfill(status=200, body="", content_type="text/css"))
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
        page.on("console", lambda m: errors.append("console.error: " + m.text) if m.type == "error" else None)
        page.goto(BASE + "?fast=1"); page.wait_for_selector("#nav a")
        def start():
            page.click(".gcard[data-id=agentdecker]"); page.wait_for_selector("#btnStart"); page.click("#btnStart"); page.wait_for_selector(".g-ad .ad-line .ad-card")
        check("게임 카드가 홈에 보이고 시작된다", start)
        def click_play():
            page.locator(".g-ad [data-act=hand]").first.click(); page.wait_for_timeout(100)
            page.locator(".g-ad [data-act=line]").first.click(); page.wait_for_selector(".ad-sh"); page.screenshot(path=f"{SHOTS}/sheet.png"); page.click(".ad-sh [data-act=close]")
            w = page.evaluate("document.documentElement.scrollWidth"); assert w <= 392, f"가로 넘침 {w}"
        check("손패·줄 카드 클릭 동작", click_play)
        def resume():
            page.evaluate(DRIVE, 6); page.wait_for_timeout(400)
            page.click(".gmenu .gm"); page.click(".gmenu .gp button:last-child"); page.click(".gmenu .gp button:last-child"); page.wait_for_selector(".gcard[data-id=agentdecker]")
            page.click(".gcard[data-id=agentdecker]"); page.wait_for_selector("#btnResume")
            page.click("#btnResume"); page.wait_for_selector(".g-ad .ad-line .ad-card")
        check("중간에 나갔다가 이어하기", resume)
        def finish():
            r = page.evaluate(DRIVE, None); assert r["over"], "한 판이 끝나지 않음"
            page.wait_for_selector("[data-act=finish]", timeout=5000); page.screenshot(path=f"{SHOTS}/over.png"); page.click("[data-act=finish]")
            page.wait_for_selector("text=홈으로", timeout=8000); page.locator("button:has-text(\"홈으로\")").first.dispatch_event("click"); page.wait_for_selector(".gcard[data-id=agentdecker]")
        check("끝까지 → 결과 → 홈", finish)
        check("협력 기록으로 저장", lambda: (lambda r: None if r and r["mode"] == "coop" and r["gameId"] == "agentdecker" else (_ for _ in ()).throw(AssertionError(str(r))))(page.evaluate("window.__ba.storage.all('records').then(a => a.map(x=>x.value).find(v=>v.gameId==='agentdecker')||null)")))
        check("콘솔 오류 없음", lambda: (_ for _ in ()).throw(AssertionError("; ".join(errors[:3]))) if errors else None)
        br.close()
finally:
    srv.terminate()
bad = [r for r in results if not r[1]]
for n, ok, e in results: print(("✅ " if ok else "❌ ") + n + ("" if ok else "\n    → " + e))
print(f"합계: {len(results) - len(bad)}/{len(results)} 통과"); sys.exit(1 if bad else 0)
