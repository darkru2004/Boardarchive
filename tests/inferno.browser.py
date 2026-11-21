# 레지사이드 인페르노 실제 크롬 점검: PC·폰 → 시작 → 클릭으로 공격(추천) → 봇으로 끝까지 → 결과 → 기록, 이어하기
import re, subprocess, sys, time, os
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); PORT = 8131; BASE = f"http://localhost:{PORT}/"
SHOTS = os.environ.get("SHOTS", "/tmp/rishots"); os.makedirs(SHOTS, exist_ok=True)
srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1"], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
errors, results = [], []
def check(name, fn):
    try: fn(); results.append((name, True, ""))
    except Exception as e: results.append((name, False, str(e)[:300]))
DRIVE = """async (stopAt) => {
  const mod = (await import('/games/regicide-inferno.js')).default;
  const root = document.querySelector('.g-regicide-inferno').parentElement._ri; let n = 0;
  const rr = {next:Math.random,int:k=>Math.floor(Math.random()*k),pick:a=>a[Math.floor(Math.random()*a.length)],shuffle:a=>a.slice()};
  while (!root.state.over && n < 600 && (stopAt == null || n < stopAt)) { const m = mod.botChoose(JSON.parse(JSON.stringify(root.state)), {}, rr).move; root.run(m); n++; }
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
            page.click(".gcard[data-id=regicide-inferno]"); page.wait_for_selector("#btnStart"); page.click("#btnStart")
            page.wait_for_selector(".g-regicide-inferno .ri-hand .ri-card"); page.screenshot(path=f"{SHOTS}/{tag}-start.png")
            n = page.locator(".ri-hand .ri-card").count(); assert n == 8, f"손패 {n}장"
        check(f"[{tag}] 홈 → 시작 → 손패 8장", start)
        def click_play():
            page.click("[data-a=hint]"); page.wait_for_selector(".ri-hand .ri-card.sel"); page.screenshot(path=f"{SHOTS}/{tag}-sel.png")
            page.click("[data-a=atk]"); page.wait_for_timeout(300); page.screenshot(path=f"{SHOTS}/{tag}-after.png")
            assert page.locator(".ri-lg div").count() >= 2
        check(f"[{tag}] 추천 → 공격 → 기록", click_play)
        def overflow():
            w = page.evaluate("document.documentElement.scrollWidth"); assert w <= viewport["width"] + 2, f"가로 넘침 {w}"
            if tag == "pc":
                h = page.evaluate("document.documentElement.scrollHeight"); assert h <= viewport["height"] + 4, f"세로 넘침 {h}"
        check(f"[{tag}] 화면 넘침 없음", overflow)
        def sheets():
            if page.locator(".ri-ov:not([hidden]) [data-a=mage]").count(): page.locator(".ri-ov:not([hidden]) [data-a=mage]").first.click(); page.wait_for_timeout(200)   # 마법사 선택창이 떠 있으면 먼저 닫기(무작위 시작 패 때문)
            for a in ["rules", "log", "pCastle", "pDisc"]:
                page.click(f"[data-a={a}]"); page.wait_for_selector(".ri-sheet"); page.click(".ri-sheet [data-a=close]")
            page.click("[data-a=zoomE]"); page.wait_for_selector(".ri-card.zoom"); page.click(".ri-sheet [data-a=close]")
        check(f"[{tag}] 규칙·기록·성·버림·확대 시트", sheets)
        if tag == "pc":
            def resume():
                page.evaluate(DRIVE, 6); page.wait_for_timeout(400)
                page.click(".gmenu .gm"); page.click(".gmenu .gp button:last-child"); page.click(".gmenu .gp button:last-child"); page.wait_for_selector(".gcard[data-id=regicide-inferno]")
                page.click(".gcard[data-id=regicide-inferno]"); page.wait_for_selector("#btnStart"); page.screenshot(path=f"{SHOTS}/{tag}-resume.png")
            check(f"[{tag}] 중간 종료 → 홈", resume)
        def finish():
            if not page.locator(".g-regicide-inferno").count():
                page.click("#btnStart"); page.wait_for_selector(".g-regicide-inferno .ri-hand")
            r = page.evaluate(DRIVE, None); assert r["over"], r
            page.wait_for_selector("[data-a=finish]"); page.screenshot(path=f"{SHOTS}/{tag}-end.png")
            page.click("[data-a=finish]"); page.wait_for_timeout(500)
        check(f"[{tag}] 봇으로 끝까지 → 결과 저장", finish)
        br.close()
run({"width": 390, "height": 800}, "phone")
run({"width": 1440, "height": 900}, "pc")
srv.terminate()
for n, ok, m in results: print(("✅ " if ok else "❌ ") + n + (" — " + m if m else ""))
real = [e for e in errors if "favicon" not in e]
print("브라우저 오류:", real if real else "없음")
sys.exit(0 if all(r[1] for r in results) and not real else 1)
