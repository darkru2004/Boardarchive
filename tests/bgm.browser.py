# BGM 점검: 설정에서 공용 BGM 넣기 → 게임 시작 시 자동 재생 → 껐다 켜기 → 나가면 멈춤 → 지우기
import re, subprocess, sys, time, os
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); PORT = 8132; BASE = f"http://localhost:{PORT}/"
WAV = os.environ.get("BGM_WAV", "/tmp/test_bgm.wav")
srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1"], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
results, errors = [], []
def check(name, fn):
    try: fn(); results.append((name, True, ""))
    except Exception as e: results.append((name, False, str(e)[:300]))
STATE = "async () => { const m = await import('/src/bgm.js'); const b = m.lastBgm; return b ? {playing: b.playing, slot: b.slot} : null; }"
with sync_playwright() as pw:
    br = pw.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox", "--autoplay-policy=no-user-gesture-required"])
    ctx = br.new_context(viewport={"width": 1280, "height": 800})
    ctx.route(re.compile(r"https://fonts\.(googleapis|gstatic)\.com/.*"), lambda r: r.fulfill(status=200, body="", content_type="text/css"))
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
    page.goto(BASE + "#/settings"); page.wait_for_selector("#bgmCard")
    def upload():
        page.click("#bgmAll"); page.wait_for_selector("#bgmManager")
        page.set_input_files(".artg[data-s=main] input[type=file]", WAV); page.wait_for_selector(".artg[data-s=main] button:has-text('바꾸기')")
        assert "test_bgm.wav" in page.inner_text(".artg[data-s=main]")
        page.click(".artg[data-s=main] button:has-text('미리듣기')"); page.wait_for_timeout(300)
        page.click(".artg[data-s=main] button:has-text('멈춤')"); page.click("#bgmManager .btn.go")
    check("공용 BGM 올리기·미리듣기", upload)
    def play():
        page.goto(BASE); page.wait_for_selector(".gcard[data-id=regicide-inferno]")
        page.click(".gcard[data-id=regicide-inferno]"); page.wait_for_selector("#btnStart"); page.click("#btnStart")
        page.wait_for_selector(".g-regicide-inferno .ri-hand .ri-card"); page.wait_for_timeout(1200)
        st = page.evaluate(STATE); assert st and st["playing"] and st["slot"] == "main", st
    check("게임 시작 → main 자동 재생", play)
    def toggle():
        page.click(".gmenu .gm"); page.wait_for_selector("#menuBgm:visible"); page.click("#menuBgm"); page.wait_for_timeout(300)
        st = page.evaluate(STATE); assert not st["playing"], st
        page.click(".gmenu .gm"); page.click("#menuBgm"); page.wait_for_timeout(600)
        st = page.evaluate(STATE); assert st["playing"], st
    check("☰ 메뉴로 BGM 끄기·켜기", toggle)
    def leave():
        page.click(".gmenu .gm"); page.click(".gmenu .gp button:last-child"); page.click(".gmenu .gp button:last-child")
        page.wait_for_selector(".gcard[data-id=regicide-inferno]"); st = page.evaluate(STATE); assert not st["playing"], st
    check("나가면 멈춤", leave)
    def other():   # 게임 전용이 없는 다른 게임에서도(공용) 재생 + 일반 게임바 ♪ 버튼
        page.click(".gcard[data-id=loveletter]"); page.wait_for_selector("#setup .seat"); page.click("button[data-n='2']"); page.click("#btnStart"); page.wait_for_selector("#barBgm:visible"); page.wait_for_timeout(1200)
        st = page.evaluate(STATE); assert st["playing"], st
    check("다른 게임에서도 공용 BGM·♪ 버튼", other)
    def wipe():
        page.goto(BASE + "#/settings"); page.reload(); page.wait_for_selector("#bgmCard"); page.click("#bgmAll"); page.wait_for_selector("#bgmManager")
        page.click(".artg[data-s=main] button:has-text('지우기')"); page.wait_for_timeout(300)
        assert "비어 있음" in page.inner_text(".artg[data-s=main]")
    check("지우기", wipe)
    br.close()
srv.terminate()
bad = [r for r in results if not r[1]]
for n, ok, m in results: print(("✅ " if ok else "❌ ") + n + ("" if ok else " — " + m))
print("브라우저 오류:", errors or "없음"); sys.exit(1 if bad or errors else 0)
