# 소리 체계(3단계) 점검: 칸 넣기 → 실제 파일 재생(합성음 아님) → 변형 번갈아 → 게임 전용 우선 → 목소리·덕킹·끄기 → BGM 전환(크로스페이드) → 옛 BGM 이전 → 소리 팩 왕복
import re, subprocess, sys, time, os, json, zipfile, tempfile
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); PORT = 8133; BASE = f"http://localhost:{PORT}/"
A, B, V, MAGE, BGM = "/tmp/snd_a.wav", "/tmp/snd_b.wav", "/tmp/snd_v.wav", "/tmp/snd_mage.wav", "/tmp/test_bgm.wav"
srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1"], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
results, errors = [], []
def check(name, fn):
    try: fn(); results.append((name, True, ""))
    except Exception as e: results.append((name, False, repr(e)[:400]))
    try: page.evaluate("document.querySelectorAll('.modal').forEach(m => m.remove())")   # 실패해도 다음 점검이 막히지 않게
    except Exception: pass
# 파일 재생(길이로 구분)과 합성음을 구분하려고, 버퍼 소스가 시작될 때 길이를 기록해 둔다
SPY = "() => { if (window.__spy) return; window.__spy = []; const o = AudioBufferSourceNode.prototype.start; AudioBufferSourceNode.prototype.start = function (...a) { try { window.__spy.push(Math.round(this.buffer.duration * 100) / 100); } catch {} return o.apply(this, a); }; }"
with sync_playwright() as pw:
    br = pw.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox", "--autoplay-policy=no-user-gesture-required"])
    ctx = br.new_context(viewport={"width": 1100, "height": 900}, accept_downloads=True)
    ctx.route(re.compile(r"https://fonts\.(googleapis|gstatic)\.com/.*"), lambda r: r.fulfill(status=200, body="", content_type="text/css"))
    page = ctx.new_page(); page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
    page.goto(BASE + "#/settings"); page.wait_for_selector("#soundCard"); page.evaluate(SPY)
    FX = "async (a) => { const m = await import('/src/fx.js'); const s = await import('/src/sounds.js'); window.__fx = m.makeFx({ game: a.game }); return true; }"
    def open_mgr(sel="#soundAll"):
        page.click(sel); page.wait_for_selector("#soundManager")
    def slot_input(sid): return f".snd-slot[data-s='{sid}'] input[type=file]"
    def close_mgr(): page.click("#soundManager .btn.go.grow"); page.wait_for_selector("#soundManager", state="detached")
    def play_spy(code, wait=700):
        page.evaluate("window.__spy.length = 0"); page.evaluate(code); page.wait_for_timeout(wait); return page.evaluate("window.__spy.slice()")
    def ui():
        assert page.is_visible("#bgmOn") and page.is_visible("#voiceOn") and page.is_visible("#voiceVol")
        n = page.eval_on_selector_all("#soundCard [data-bg]", "e => e.length"); assert n >= 5, n
        txt = page.inner_text("#soundCard [data-bg=regicide-inferno]"); assert "전용 칸 0/59" in txt, txt
    check("설정 소리 카드: BGM·목소리 조절, 게임별 줄에 전용 칸 수", ui)
    def common_file():
        open_mgr(); page.click("details[data-g=ui] summary")
        assert "채운 칸 0/" in page.inner_text("#soundSummary")
        page.set_input_files(slot_input("ui.tap"), A); page.wait_for_selector(".snd-slot[data-s='ui.tap'][data-n='1']")
        assert "채운 칸 1/" in page.inner_text("#soundSummary"); close_mgr()
        page.evaluate(FX, {"game": None}); page.wait_for_timeout(500)
        d = play_spy("window.__fx.sfx('ui.tap')"); assert 0.31 in d, d
        d = play_spy("window.__fx.sfx('tap')"); assert 0.31 in d, ("옛 이름(tap)도 같은 칸을 타야 함", d)
    check("공용 칸에 파일을 넣으면 실제 파일이 재생됨(옛 이름 tap도)", common_file)
    def variants():
        open_mgr(); page.click("details[data-g=ui] summary")
        page.set_input_files(slot_input("ui.tap"), B); page.wait_for_function("document.querySelector(\".snd-slot[data-s='ui.tap']\").dataset.n === '2'"); close_mgr()
        page.evaluate(FX, {"game": None}); page.wait_for_timeout(500)
        seq = []
        for _ in range(12): seq += play_spy("window.__fx.sfx('ui.tap')", 120)
        fl = [x for x in seq if x in (0.31, 0.43)]; assert 0.31 in fl and 0.43 in fl, fl
        assert all(fl[i] != fl[i + 1] for i in range(len(fl) - 1)), ("같은 변형이 연달아 나옴", fl)
    check("변형 2개를 번갈아 재생(연달아 같은 것 없음)", variants)
    def fallback():
        r = page.evaluate("async () => { const f = await import('/src/fx.js'); return f.SoundHook.play(null, 'card.draw', null); }")
        assert r == {"synth": "pick"} or (isinstance(r, dict) and r.get("synth") == "pick"), r
        assert page.evaluate("import('/src/fx.js').then(f => f.SoundHook.play(null, 'no.such.slot', null))") is None
    check("파일이 없으면 칸에 적힌 합성음으로(없는 칸은 건드리지 않음)", fallback)
    def game_scope():
        page.goto(BASE + "#/settings"); page.wait_for_selector("#soundCard"); page.evaluate(SPY)
        open_mgr("#soundCard [data-bg=regicide-inferno] button")
        sm = page.inner_text("#soundSummary"); assert sm.startswith("채운 칸 1/"), ("공용에서 채워진 ui.tap 1칸만 세어짐", sm)
        gs = page.eval_on_selector_all("#soundManager details", "e => e.map(x => x.dataset.g)"); assert gs[0].startswith("g:"), gs
        page.click("details[data-g='g:직업별 공격'] summary")
        # 게임 이름 없이 올려도 '지금 연 게임'으로 분류: atk.mage-01
        d = tempfile.mkdtemp(); f = os.path.join(d, "atk.mage-01.wav"); open(f, "wb").write(open(A, "rb").read())
        page.set_input_files("#soundBulk", f); page.wait_for_selector(".snd-slot[data-s='atk.mage'][data-n='1']")
        f2 = os.path.join(d, "hit.heavy-01.wav"); open(f2, "wb").write(open(B, "rb").read())   # 공용 칸 이름도 이 게임 전용으로 들어감
        page.set_input_files("#soundBulk", f2); page.wait_for_function("document.querySelector(\"details[data-g='g:피해·능력']\") !== null")
        page.click("details[data-g='g:피해·능력'] summary"); page.wait_for_selector(".snd-slot[data-s='hit.heavy'][data-n='1']")
        close_mgr()
        page.evaluate(FX, {"game": "regicide-inferno"}); page.wait_for_timeout(600)
        assert 0.31 in play_spy("window.__fx.sfx('atk.mage')")
        assert 0.43 in play_spy("window.__fx.sfx('hit.heavy')")
        page.evaluate(FX, {"game": "splendor"}); page.wait_for_timeout(300)
        assert 0.43 not in play_spy("window.__fx.sfx('hit.heavy')"), "다른 게임이 인페르노 전용 소리를 탐"
    check("게임 소리 창: 이름에 게임이 없어도 그 게임으로 분류, 게임 전용이 우선, 다른 게임은 영향 없음", game_scope)
    def failures():
        d = tempfile.mkdtemp(); f = os.path.join(d, "zzz.wav"); open(f, "wb").write(open(A, "rb").read())
        open_mgr(); page.set_input_files("#soundBulk", f); page.wait_for_selector("#soundFailed"); assert "zzz" in page.inner_text("#soundFailed")
        page.click("#soundFailed .btn.go"); close_mgr()
    check("이름을 못 찾은 파일은 이유와 함께 알려 줌", failures)
    def voice():
        page.goto(BASE + "#/settings"); page.wait_for_selector("#soundCard"); page.evaluate(SPY)
        open_mgr("#soundCard [data-bg=regicide-inferno] button"); page.click("details[data-g='g:목소리: 마법사 적 (1순위)'] summary")
        txt = page.inner_text(".snd-slot[data-s='vo.kalannar.enter']"); assert "불꽃 앞에서 무릎 꿇어라." in txt, txt
        page.set_input_files(slot_input("vo.kalannar.enter"), V); page.wait_for_selector(".snd-slot[data-s='vo.kalannar.enter'][data-n='1']"); close_mgr()
        page.evaluate(FX, {"game": "regicide-inferno"}); page.wait_for_timeout(600)
        r = page.evaluate("window.__fx.say('vo.kalannar.enter')"); assert r["played"] and r["line"] == "불꽃 앞에서 무릎 꿇어라.", r
        r = page.evaluate("window.__fx.say('vo.malis.enter')"); assert not r["played"] and r["line"] == "재가 되기 전에, 이름이나 남기렴.", ("파일이 없어도 자막은 줌", r)
        page.evaluate("localStorage.setItem('ba_voice','0')")
        r = page.evaluate("window.__fx.say('vo.kalannar.enter')"); assert not r["played"] and r["line"], ("목소리를 끄면 안 나고 자막만", r)
        page.evaluate("window.__spy.length = 0; window.__fx.sfx('vo.kalannar.enter')"); page.wait_for_timeout(200); assert 0.9 not in page.evaluate("window.__spy"), "끈 목소리가 sfx로 샘"
        page.evaluate("localStorage.removeItem('ba_voice')")
    check("목소리: 대사(자막) 전달, 파일 없어도 자막, 설정에서 끄면 무음", voice)
    def bgm_switch():
        page.goto(BASE + "#/settings"); page.wait_for_selector("#soundCard")
        open_mgr("#soundCard [data-bg=regicide-inferno] button"); page.click("details[data-g='g:BGM'] summary")
        page.set_input_files(slot_input("bgm.mage"), MAGE); page.wait_for_selector(".snd-slot[data-s='bgm.mage'][data-n='1']"); close_mgr()
        open_mgr(); page.click("details[data-g=bgm] summary"); page.set_input_files(slot_input("bgm.main"), BGM); page.wait_for_selector(".snd-slot[data-s='bgm.main'][data-n='1']"); close_mgr()
        page.goto(BASE); page.wait_for_selector(".gcard[data-id=regicide-inferno]"); page.click(".gcard[data-id=regicide-inferno]"); page.wait_for_selector("#btnStart"); page.click("#btnStart")
        page.wait_for_selector(".g-regicide-inferno .ri-hand .ri-card"); page.wait_for_timeout(1500)
        st = "async () => { const m = await import('/src/bgm.js'); const b = m.lastBgm; return { slot: b.slot, n: b.trackCount, playing: b.playing, vol: b.volume }; }"
        s = page.evaluate(st); assert s["slot"] == "main" and s["playing"], s
        page.evaluate("import('/src/bgm.js').then(m => m.lastBgm.play('mage'))"); page.wait_for_timeout(300)
        mid = page.evaluate(st); assert mid["n"] == 2, ("전환 중에는 두 곡이 겹침", mid)
        page.wait_for_timeout(1700); s = page.evaluate(st); assert s["slot"] == "mage" and s["n"] == 1 and s["playing"], ("전환 뒤 옛 곡은 정리", s)
        r = page.evaluate("import('/src/bgm.js').then(m => m.lastBgm.play('nope'))"); assert r is False and page.evaluate(st)["slot"] == "mage", "없는 칸은 곡을 바꾸지 않음"
    check("BGM: 게임 전용 곡으로 크로스페이드 전환, 없는 칸은 유지", bgm_switch)
    def ducking():
        base = page.evaluate("import('/src/bgm.js').then(m => m.lastBgm.volume)")
        page.evaluate("window.__fx = null; import('/src/fx.js').then(m => { window.__fx = m.makeFx({ game: 'regicide-inferno' }); window.__say = window.__fx.say('vo.kalannar.enter'); })")
        page.wait_for_timeout(450); low = page.evaluate("import('/src/bgm.js').then(m => m.lastBgm.volume)")
        assert low < base * 0.6, ("목소리 동안 BGM이 줄어야 함", base, low)
        page.wait_for_timeout(1400); back = page.evaluate("import('/src/bgm.js').then(m => m.lastBgm.volume)")
        assert back > base * 0.9, ("목소리가 끝나면 원래대로", base, back)
    check("목소리가 나는 동안 BGM이 줄었다가 돌아옴(덕킹)", ducking)
    def migrate():
        pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
        pg.goto(BASE + "#/settings"); pg.wait_for_selector("#soundCard")
        pg.evaluate("window.__ba.storage.put('settings','bgm:splendor:win',{name:'old.mp3',size:4,dataUrl:'data:audio/mpeg;base64,AAECAw==',updatedAt:'2026-11-01T00:00:00Z'})")
        pg.reload(); pg.wait_for_selector("#soundCard")
        pg.wait_for_function("window.__ba.storage.get('settings','snd:splendor:bgm.win').then(v => !!v && v.files[0].name === 'old.mp3' && v.files[0].size === 4)")
        assert pg.evaluate("window.__ba.storage.get('settings','bgm:splendor:win').then(v => v === undefined)"), "옛 칸이 남음"
        pg.evaluate("window.__ba.storage.del('settings','snd:splendor:bgm.win')"); pg.close()
    check("앱을 켜면 예전 BGM이 새 칸으로 자동 이전됨", migrate)
    def pack():
        page.goto(BASE + "#/settings"); page.wait_for_selector("#settabs"); page.click("#settabs [data-st=data]"); page.wait_for_selector("#soundPackCard")
        assert "파일" in page.inner_text("#soundPackCard")
        with page.expect_download() as dl: page.click("#btnExportPack")
        path = dl.value.path(); z = zipfile.ZipFile(path); names = set(z.namelist())
        for need in ["pack.json", "ui.tap-01.wav", "ui.tap-02.wav", "regicide-inferno.atk.mage-01.wav", "regicide-inferno.vo.kalannar.enter-01.wav", "regicide-inferno.bgm.mage-01.wav", "bgm.main-01.wav"]: assert need in names, (need, sorted(names))
        page.evaluate("Promise.all(['ui.tap','hit.heavy'].map(s => window.__ba.storage.del('settings','snd:all:' + s))).then(() => window.__ba.storage.del('settings','snd:regicide-inferno:atk.mage'))")
        page.set_input_files("#packFile", path)
        page.wait_for_function("Promise.all([window.__ba.storage.get('settings','snd:regicide-inferno:atk.mage'), window.__ba.storage.get('settings','snd:all:ui.tap')]).then(([a, b]) => !!a && a.files.length === 1 && !!b && b.files.length === 2)", timeout=15000)
        bad = os.path.join(tempfile.mkdtemp(), "bad.txt"); open(bad, "w").write("hi")
        page.set_input_files("#packFile", bad); page.wait_for_selector("#soundFailed")
    check("소리 팩: zip으로 내보내기(이름=칸 id) → 지우고 가져오면 변형까지 복구, 이상한 파일은 거부", pack)
    br.close()
srv.terminate()
bad = [r for r in results if not r[1]]
for n, ok, m in results: print(("✅ " if ok else "❌ ") + n + ("" if ok else " — " + m))
print("브라우저 오류:", errors or "없음"); sys.exit(1 if bad or errors else 0)
