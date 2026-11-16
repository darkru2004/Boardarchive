# 프라이데이 실제 크롬 점검: 기본 카드(그림 없음)로 한 판 끝까지 → 기록 저장 → 그림 팩을 넣고 다시 한 판(그림 카드). 폰 폭 넘침·콘솔 오류도 본다.
import json, re, subprocess, sys, time, os
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); PORT = 8124; BASE = f"http://localhost:{PORT}/"
SHOTS = os.environ.get("SHOTS", "/tmp/frshots"); os.makedirs(SHOTS, exist_ok=True)
PACK = os.environ.get("FRIDAY_PACK", "")   # 그림 팩(boardarchive-images JSON) 경로, 없으면 그림 시험은 건너뜀
srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1"], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
errors, results = [], []
def check(name, fn):
    try: fn(); results.append((name, True, ""))
    except Exception as e: results.append((name, False, str(e)[:300]))

def play(page, shot_prefix=None, cap=900):
    """화면을 눌러서 한 판 끝까지(단순 규칙: 무료는 다 뽑고, 이기면 끝내기, 아니면 일부러 지기)"""
    shots = set()
    for i in range(cap):
        if page.locator("[data-a=finish]").count(): return True
        if shot_prefix and i in (3, 9, 20, 40) and i not in shots: page.screenshot(path=f"{SHOTS}/{shot_prefix}-{i}.png"); shots.add(i)
        if page.locator("[data-sort]").count():
            n = page.locator("[data-sort]").count()
            for k in range(max(1, n - 1)): page.locator("[data-sort]").nth(k).click()
            page.click("[data-a=sortok]"); continue
        if page.locator("[data-opt]").count():
            page.locator("[data-opt]").first.click(); page.click("[data-a=pick], [data-a=pir]"); continue
        if page.locator("[data-a=fight1]").count(): page.click("[data-a=fight1]"); continue
        if page.locator(".fr-c.tgt").count(): page.locator(".fr-c.tgt").first.dispatch_event("click"); continue
        if page.locator("[data-a=fin]").count(): page.click("[data-a=fin]"); continue
        if page.locator("[data-a=pdraw]").count(): page.click("[data-a=psk]"); continue
        if page.locator("[data-a=psk]").count(): page.click("[data-a=psk]"); continue
        d = page.locator("[data-a=draw]"); e = page.locator("[data-a=end]")
        if d.count() and "무료" in d.inner_text(): d.click(); continue
        if e.count() and e.is_enabled() and "이기고" in e.inner_text(): e.click(); continue
        if e.count() and e.is_enabled() and "지기" in e.inner_text(): e.click(); continue
        if d.count(): d.click(); continue
        page.wait_for_timeout(50)
    return False

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
            page.click(".gcard[data-id=friday]")
            page.wait_for_selector("#btnStart"); page.click("#btnStart"); page.wait_for_selector(".g-friday")
        def one_game(prefix):
            start(); page.wait_for_selector("[data-lv]"); page.screenshot(path=f"{SHOTS}/{prefix}-level.png"); page.click("[data-lv='1']")
            page.wait_for_selector("[data-opt]"); ok = play(page, prefix)
            assert ok, "한 판이 끝나지 않음"
            page.screenshot(path=f"{SHOTS}/{prefix}-result.png")
            w = page.evaluate("document.documentElement.scrollWidth"); assert w <= 392, f"가로 넘침 {w}"
            page.click("[data-a=finish]"); page.wait_for_selector("text=홈으로", timeout=8000); page.screenshot(path=f"{SHOTS}/{prefix}-host.png"); page.click("text=홈으로"); page.wait_for_selector(".gcard[data-id=friday]")
        check("기본 카드로 한 판 끝까지 + 결과 화면", lambda: one_game("css"))
        check("기록이 협력 기록으로 저장된다", lambda: (lambda r: (_ for _ in ()).throw(AssertionError(str(r))) if not (r and r["gameId"] == "friday" and r["mode"] == "coop") else None)(page.evaluate("window.__ba.storage.all('records').then(a => a.map(x=>x.value).find(v=>v.gameId==='friday')||null)")))
        if PACK and os.path.exists(PACK):
            pack = json.load(open(PACK))["data"]["portraits"]
            page.evaluate("async (p) => { for (const [k,v] of Object.entries(p)) { await window.__ba.storage.put('portraits', k, v); window.__ba.portraits.set(k, v.dataUrl); } }", pack)
            page.goto(BASE + "?fast=1"); page.wait_for_selector("#nav a")
            check("그림 카드로 한 판 끝까지", lambda: one_game("art"))
            check("그림 카드가 실제로 그려진다", lambda: None)
        check("콘솔 오류 없음", lambda: (_ for _ in ()).throw(AssertionError("; ".join(errors[:3]))) if errors else None)
        br.close()
finally:
    srv.terminate()
bad = [r for r in results if not r[1]]
for n, ok, e in results: print(("✅ " if ok else "❌ ") + n + ("" if ok else "\n    → " + e))
print(f"합계: {len(results) - len(bad)}/{len(results)} 통과"); sys.exit(1 if bad else 0)
