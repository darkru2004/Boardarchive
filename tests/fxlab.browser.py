# 연출 시험장(#/fxlab)과 개발 중단 게임 숨김을 실제 크롬으로 점검한다.
import json, os, re, subprocess, sys, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8131; BASE = f"http://localhost:{PORT}/"
SHOTS = os.environ.get("SHOTS", "/tmp/shots"); os.makedirs(SHOTS, exist_ok=True)
IDX = json.load(open(os.path.join(ROOT, "games", "index.json"), encoding="utf-8"))["games"]
RETIRED = [g["id"] for g in IDX if g.get("retired")]; ACTIVE = [g["id"] for g in IDX if not g.get("retired")]
results = []
def check(name, fn):
    try: fn(); results.append((name, True, ""))
    except Exception as e: results.append((name, False, str(e)[:300]))

srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1"], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); errors = []
try:
    with sync_playwright() as pw:
        br = pw.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox", "--autoplay-policy=no-user-gesture-required"])
        ctx = br.new_context(viewport={"width": 390, "height": 844})
        ctx.route(re.compile(r"https://fonts\.(googleapis|gstatic)\.com/.*"), lambda r: r.fulfill(status=200, body="", content_type="text/css"))
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
        page.on("console", lambda m: errors.append("console.error: " + m.text) if m.type == "error" else None)

        # ---------- 개발 중단 게임 숨김 ----------
        page.goto(BASE + "?fast=1"); page.wait_for_selector(".gcard")
        def hidden_home():
            ids = page.eval_on_selector_all(".gcard[data-id]", "els => [...new Set(els.map(e => e.dataset.id))]")
            assert not set(ids) & set(RETIRED), f"홈에 중단 게임이 보임: {set(ids) & set(RETIRED)}"
            assert set(ids) == set(ACTIVE), f"홈 게임 목록이 다름: {sorted(ids)}"
        check("홈에서 중단 4종이 안 보이고 7종만 보인다", hidden_home)
        def hidden_settings():
            page.goto(BASE + "?fast=1#/settings"); page.wait_for_selector("#soundCard")
            ids = page.eval_on_selector_all("#soundCard [data-bg]", "els => els.map(e => e.dataset.bg)")
            assert not set(ids) & set(RETIRED) and len(ids) == len(ACTIVE), ids
        check("설정 BGM 게임 목록에도 중단 게임이 없다", hidden_settings)
        def retired_records():
            page.goto(BASE + "?fast=1#/records/nothanks"); page.wait_for_selector("#retiredNote")
            page.goto(BASE + "?fast=1#/records"); page.wait_for_selector("#recGames")
            ids = page.eval_on_selector_all("#recGames [data-id]", "els => els.map(e => e.dataset.id)")
            assert not set(ids) & set(RETIRED), "기록이 없는 중단 게임이 기록 목록에 보임"
        check("중단 게임 기록 페이지는 열리고 '개발 중단' 안내가 나온다", retired_records)
        def retired_with_records():
            page.evaluate("""async () => { const s = window.__ba.storage; await s.put('records', 'r-retired-test', {id:'r-retired-test', gameId:'nothanks', gameVersion:'1.9.0', playedAt:new Date().toISOString(), players:[{seat:0,human:true,rank:1,score:10},{seat:1,human:false,characterId:'x',rank:2,score:20}]}); }""")
            page.reload(); page.wait_for_selector("#recGames .recg.retired[data-id=nothanks]")
            assert "개발 중단" in page.inner_text("#recGames .recg[data-id=nothanks]")
            page.evaluate("window.__ba.storage.del('records', 'r-retired-test')")
        check("기록이 있는 중단 게임은 기록 목록에 '개발 중단'으로 남는다", retired_with_records)
        def show_switch():
            page.evaluate("localStorage.setItem('ba_showretired','1')"); page.goto(BASE + "?fast=1"); page.wait_for_selector(".gcard[data-id=nothanks]")
            page.evaluate("localStorage.removeItem('ba_showretired')")
        check("점검용 스위치(ba_showretired)를 켜면 다시 보인다", show_switch)

        # ---------- 연출 시험장 ----------
        def lab_open():
            page.goto(BASE + "#/settings"); page.wait_for_selector("#settabs"); page.click("#settabs [data-st=general]")
            page.click("#fxLabLink"); page.wait_for_selector("#fxlBoard")
            assert page.evaluate("location.hash") == "#/fxlab"
            assert page.locator("#nav a[data-tab=settings].on").count() == 1, "아래 탭이 설정으로 표시되지 않음"
        check("설정 > 연출 시험장 열기로 들어간다", lab_open)
        def lab_buttons():
            n = page.evaluate("window.__fxlab.scenes.length")
            assert page.locator("[data-run]").count() == n == page.locator("[data-weak]").count(), "장면 목록과 버튼 수가 다름"
            groups = page.eval_on_selector_all("#fxlList [data-g]", "els => els.map(e => e.dataset.g)")
            assert groups == ["부품", "장면", "v2 신규", "효과음"], groups
            assert page.locator("[data-run^='snd.']").count() == 20
            assert page.evaluate("window.__fxlab.ver") == "v2", "기본은 새 엔진(v2)"
        check("버튼이 장면 목록에서 자동으로 만들어진다 (부품·장면·v2 신규·효과음 20)", lab_buttons)
        def lab_run_each():
            ids = page.evaluate("window.__fxlab.scenes.map(s => s.id)")
            bad = []
            for i, sid in enumerate(ids):
                page.click(f"[data-run='{sid}']")
                if i == 0 or sid in ("s.win", "s.hit", "s.deal"):
                    page.wait_for_timeout(180); page.screenshot(path=f"{SHOTS}/fxlab_{sid}.png")
                page.wait_for_timeout(2000)
                page.wait_for_timeout(900)
                left = page.evaluate("[document.querySelectorAll('.fx-ghost,.fx-float,.fx-spark,.fx-glint,.fx-banner,.fx-flash,.fx-lock').length, [...document.querySelectorAll('#fxlBoard *')].filter(e => e.style.visibility === 'hidden').length]")
                if left != [0, 0]: bad.append(f"{sid}:{left}")
            assert not bad, "연출이 끝나도 남은 조각/숨은 자리: " + ", ".join(bad)
        check("v2: 모든 장면을 하나씩 실제로 재생해도 조각이 남지 않고 숨긴 자리도 돌아온다", lab_run_each)
        def lab_v1():
            page.click("[data-ver=v1]"); page.wait_for_selector("#fxlBoard")
            assert page.evaluate("window.__fxlab.ver") == "v1"
            assert page.locator("[data-run^='n.']:disabled").count() == page.locator("[data-run^='n.']").count() > 0, "v1에서 v2 신규 장면이 막혀 있지 않음"
            for sid in ["p.fly", "s.hit", "s.win"]:
                page.click(f"[data-run='{sid}']"); page.wait_for_timeout(1800)
            assert page.evaluate("document.querySelectorAll('.fx-ghost,.fx-float,.fx-spark').length") == 0
            page.click("[data-ver=v2]"); page.wait_for_selector("#fxlCtl")
        check("v1/v2 스위치로 예전 엔진과 비교할 수 있다", lab_v1)
        def lab_ghost_hides_target():
            page.click("[data-run='s.play']"); page.wait_for_timeout(180)
            st = page.evaluate("[document.querySelectorAll('.fx-ghost').length, getComputedStyle(document.getElementById('fxlPlay')).visibility]")
            assert st == [1, "hidden"], f"날아가는 동안 도착 자리가 숨지 않음: {st}"
            page.wait_for_timeout(1500)
            assert page.evaluate("getComputedStyle(document.getElementById('fxlPlay')).visibility") == "visible"
        check("v2 날리기: 날아가는 동안 도착 자리를 숨겼다가 도착하면 드러낸다 (두 장 문제)", lab_ghost_hides_target)
        def lab_controls():
            page.click("#fxlCtl [data-lv='1']"); assert page.evaluate("localStorage.getItem('ba_fxlv')") == "1"
            page.click("#fxlCtl [data-spd='1.3']"); assert page.evaluate("localStorage.getItem('ba_fxspd')") == "1.3"
            page.click("#fxlCtl [data-shake]"); assert page.evaluate("localStorage.getItem('ba_shake')") == "0"
            page.fill("#sfxVol", "40"); page.dispatch_event("#sfxVol", "change"); assert page.evaluate("localStorage.getItem('ba_sfxvol')") == "40"
            page.click("#fxlCtl [data-lv='0']"); page.click("[data-run='s.play']"); page.wait_for_timeout(120)
            assert page.evaluate("document.querySelectorAll('.fx-ghost').length") == 0, "세기 '끔'인데 움직임이 나옴"
            page.evaluate("['ba_fxlv','ba_fxspd','ba_shake','ba_sfxvol'].forEach(k => localStorage.removeItem(k))")
            page.reload(); page.wait_for_selector("#fxlCtl [data-lv='3'].on")
        check("연출 조절판: 세기·속도·흔들림·음량이 저장되고 '끔'이면 움직임이 멈춘다", lab_controls)
        def lab_run_all_fast():
            page.goto(BASE + "?fast=1#/fxlab"); page.wait_for_selector("#fxlBoard")
            page.evaluate("window.__fxlab.runAll(window.__fxlab.scenes)")
            page.wait_for_timeout(300)
            assert page.inner_text("#fxlAll").startswith("▶"), "전부 이어서가 안 끝남"
        check("빠른 모드에서 전부 이어서 재생이 오류 없이 끝난다", lab_run_all_fast)
        def lab_weak():
            page.click("[data-weak='p.flip']"); page.click("[data-weak='s.gain']")
            assert page.evaluate("localStorage.getItem('ba_fxlab_weak_v2')").split(",") == ["p.flip", "s.gain"]
            assert page.inner_text("#fxlWeakN") == "2"
            page.reload(); page.wait_for_selector("#fxlBoard")
            assert page.locator("[data-weak].on").count() == 2, "약함 표시가 기억되지 않음"
            page.click("#fxlCopy"); page.wait_for_timeout(200)
            v = page.input_value("#fxlOut"); assert "뒤집기 (p.flip)" in v and "이득 (s.gain)" in v, v
        check("약함 표시가 기억되고 목록으로 복사된다", lab_weak)
        def lab_warn():
            page.evaluate("localStorage.setItem('ba_fx','0')"); page.reload(); page.wait_for_selector("#fxlWarn")
            page.evaluate("localStorage.removeItem('ba_fx')")
        check("움직임이 꺼져 있으면 시험장에 안내가 나온다", lab_warn)
        br.close()
finally:
    srv.terminate()
for e in errors: results.append(("페이지 오류 없음", False, e))
ok = sum(1 for r in results if r[1])
for n, good, msg in results: print(("✅ " if good else "❌ ") + n + ("" if good else "  → " + msg))
print(f"연출 시험장: {ok}/{len(results)}")
sys.exit(0 if ok == len(results) else 1)
