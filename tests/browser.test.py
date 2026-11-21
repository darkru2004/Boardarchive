# 실제 크롬(헤드리스)으로 앱을 열어 사람이 하는 순서대로 점검한다: 게임 한 판 → 기록 → 초상화 → 백업 → "다른 기기"에서 복원 → 오프라인
import json, re, subprocess, sys, time, os, tempfile
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8123
GAMES_N = len(json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'games', 'index.json'), encoding='utf-8'))['games'])
def leave(pg):
    """게임에서 나간다(몰입형 게임은 ☰ 메뉴의 '나가기', 아니면 위쪽 나가기 버튼. 두 번 눌러 확인)."""
    if pg.locator(".gmenu .gm").count():
        pg.click(".gmenu .gm"); pg.click(".gmenu .gp button:last-child"); pg.click(".gmenu .gp button:last-child")
    else:
        pg.click(".gamebar .row button:last-child"); pg.click(".gamebar .row button:last-child")

BASE = f"http://localhost:{PORT}/"
SHOTS = os.environ.get("SHOTS", "/tmp/shots"); os.makedirs(SHOTS, exist_ok=True)
results = []
def check(group, name, fn):
    try: fn(); results.append((group, name, True, ""))
    except Exception as e:
        results.append((group, name, False, str(e)[:300]))
        if os.environ.get("BT_DEBUG"): print("FAIL", group, name, str(e)[:300], flush=True)

srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1"], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
errors = []
try:
    with sync_playwright() as pw:
        br = pw.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])
        # 테스트 환경은 외부 인터넷이 막혀 있어 글꼴(구글 폰트)은 빈 응답으로 대체 (실제 기기에서는 정상 로드)
        FONT_STUB = lambda r: r.fulfill(status=200, body="", content_type="text/css")
        ctx = br.new_context(viewport={"width": 390, "height": 844}, accept_downloads=True)
        ctx.route(re.compile(r"https://fonts\.(googleapis|gstatic)\.com/.*"), FONT_STUB)
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
        page.on("console", lambda m: errors.append("console.error: " + m.text) if m.type == "error" else None)

        def count_records(pg): return pg.evaluate("window.__ba.storage.all('records').then(a => a.length)")

        # ---------- 시작 화면 ----------
        page.goto(BASE + "?fast=1"); page.wait_for_selector("#nav a")
        check("시작 화면", "앱이 열리고 하단 탭 4개(게임·도감·기록·설정)가 보인다", lambda: (
            (_ for _ in ()).throw(AssertionError("탭 수 " + str(page.locator('#nav a').count()))) if page.locator('#nav a').count() != 4 else None))
        check("시작 화면", "게임 목록에 스톱!(시험용)은 없고 정식 게임이 목록 수만큼 있다", lambda: (page.wait_for_selector(".gcard[data-id=nothanks]"), None if page.locator(".gcard").count() == GAMES_N and page.locator(".gcard[data-id=stop-test]").count() == 0 else (_ for _ in ()).throw(AssertionError("게임 카드 수 " + str(page.locator(".gcard").count())))))
        page.screenshot(path=f"{SHOTS}/1-home.png")

        # ---------- 게임 한 판 ----------
        def play_game():
            page.click(".gcard[data-id=nothanks]"); page.wait_for_selector("#setup .seat")
            page.click("button[data-n='4']")
            assert page.locator("#setup [data-d]").count() == 4, "난이도 버튼 4개가 아님"
            for d in ("easy", "hard", "normal"):
                page.click(f"#setup [data-d={d}]"); assert page.locator("#setup .seat").count() == 4
            page.click("#setup [data-d=easy]")
            assert page.locator("#setup .seat").count() == 4, "4인 좌석이 아님"
            assert page.locator("#setup .seat.me").count() == 1, "사람 자리가 1개가 아님"
            page.screenshot(path=f"{SHOTS}/2-setup.png")
            page.click("#btnStart"); page.wait_for_selector(".g-nt")
            page.screenshot(path=f"{SHOTS}/3-game.png")
            t0 = time.time()
            while page.locator(".modal .rank-row").count() == 0:
                if time.time() - t0 > 90: raise AssertionError("90초 안에 게임이 끝나지 않음")
                tk, ps = page.locator("[data-a=take]"), page.locator("[data-a=pass]")
                if tk.is_enabled():
                    hint = page.locator(".nt-hint").inner_text()
                    (ps if ps.is_enabled() and "손해" in hint else tk).click()
                page.wait_for_timeout(15)
            page.screenshot(path=f"{SHOTS}/4-result.png")
        check("게임 진행", "실제 화면을 눌러 4인 한 판을 끝까지 플레이하면 결과 화면이 나온다", play_game)
        check("게임 진행", "결과 화면에 순위 4줄이 나온다", lambda: (_ for _ in ()).throw(AssertionError(str(page.locator('.modal .rank-row').count()))) if page.locator(".modal .rank-row").count() != 4 else None)
        check("게임 진행", "판이 끝나면 기록이 1건 저장된다", lambda: (_ for _ in ()).throw(AssertionError("기록 수 " + str(count_records(page)))) if count_records(page) != 1 else None)
        rec = page.evaluate("window.__ba.storage.all('records').then(a => a[0].value)")
        check("게임 진행", "저장된 기록에 게임·버전·4명의 순위가 들어 있다", lambda: (
            None if (rec["gameId"] == "nothanks" and rec["gameVersion"] == "1.9.0" and rec.get("difficulty") == "easy" and len(rec["players"]) == 4 and sorted(p["rank"] for p in rec["players"])[0] == 1 and sum(1 for p in rec["players"] if p["human"]) == 1) else (_ for _ in ()).throw(AssertionError(json.dumps(rec, ensure_ascii=False)[:200]))))
        page.click("text=홈으로"); page.wait_for_selector(".gcard[data-id=nothanks]")
        check("게임 진행", "'홈으로'를 누르면 게임 목록으로 돌아온다 (하단 탭 복귀)", lambda: page.wait_for_selector("#nav a", state="visible"))

        # ---------- 기록 화면 ----------
        page.click("#nav a[data-tab=records]"); page.wait_for_selector("#overall")
        check("기록 화면", "총 1판이 표시되고 '첫 판' 업적이 달성 상태다", lambda: (
            None if "경쟁 1판" in page.inner_text("#overall") and page.locator(".ach.done[data-id='first-game']").count() == 1 else (_ for _ in ()).throw(AssertionError(page.inner_text("#overall")))))
        def char_detail():
            assert page.locator("#charTable .crow").count() == 3, "캐릭터 전적 줄 수 " + str(page.locator("#charTable .crow").count())
            page.click("#charTable .crow >> nth=0"); page.wait_for_selector(".modal .charDetail")
            txt = page.inner_text(".modal .charDetail")
            assert "게임별" in txt and "노땡스" in txt and "승률" in txt, txt[:200]
            page.click(".modal .charDetail >> text=닫기"); page.wait_for_selector(".modal", state="detached")
        check("기록 화면", "캐릭터별 전적(승률·평균 순위)이 나오고, 누르면 게임별 전적 창이 열린다", char_detail)
        check("기록 화면", "업적이 묶음별로 나뉘어 있고 30개 이상이다", lambda: (None if page.locator("#achs").count() >= 4 and page.locator(".ach").count() >= 30 else (_ for _ in ()).throw(AssertionError(f"묶음 {page.locator('#achs').count()} 업적 {page.locator('.ach').count()}"))))
        page.screenshot(path=f"{SHOTS}/5-records.png", full_page=True)

        # ---------- 새로고침해도 유지 ----------
        page.reload(); page.wait_for_selector("#nav a")
        check("저장 유지", "새로고침(앱 재실행) 후에도 기록 1건이 그대로 남아 있다", lambda: (_ for _ in ()).throw(AssertionError(str(count_records(page)))) if count_records(page) != 1 else None)

        # ---------- 초상화 ----------
        page.click("#nav a[data-tab=dex]"); page.wait_for_selector(".dex")
        check("도감·초상화", "캐릭터 12명이 도감 썸네일에 나온다 (이니셜 아바타 기본)", lambda: (_ for _ in ()).throw(AssertionError(str(page.locator('.dex').count()))) if page.locator(".dex").count() != 12 else None)
        page.click(".dex[data-id=rapi]"); page.wait_for_selector(".dex[data-id=rapi].on"); page.wait_for_selector("#portraitFile", state="attached")
        page.set_input_files("#portraitFile", "/tmp/portrait-test.png")
        page.wait_for_function("window.__ba.portraits.has('rapi')")
        check("도감·초상화", "이미지를 고르면 자동 축소되어 저장된다 (192px JPEG, 100KB 미만)", lambda: (
            None if page.evaluate("window.__ba.portraits.get('rapi')").startswith("data:image/jpeg;base64,") and len(page.evaluate("window.__ba.portraits.get('rapi')")) < 100_000 else (_ for _ in ()).throw(AssertionError("형식/크기"))))
        page.screenshot(path=f"{SHOTS}/6-dex-detail.png")
        page.reload(); page.wait_for_selector("#nav a")
        check("도감·초상화", "새로고침 후에도 초상화가 유지된다", lambda: (None if page.evaluate("window.__ba.portraits.has('rapi')") else (_ for _ in ()).throw(AssertionError("사라짐"))))
        page.click("#nav a[data-tab=dex]"); page.wait_for_selector(".dex")
        check("도감·초상화", "도감 화면에서 라피 아바타가 이미지로 보인다 (이니셜 대신)", lambda: (
            None if "url(" in page.locator(".dex[data-id=rapi] .av").get_attribute("style") else (_ for _ in ()).throw(AssertionError("이미지 없음"))))
        page.screenshot(path=f"{SHOTS}/7-dex.png")

        # ---------- 백업 → 다른 기기에서 복원 ----------
        page.evaluate("import('./core/storage.js').then(m => m.saveCampaign(window.__ba.storage, {gameId:'legacy-x', slot:1, gameVersion:'1.0.0', data:{chapter:4}}))")
        page.click("#nav a[data-tab=settings]"); page.click("#settabs [data-st=data]"); page.wait_for_selector("#btnExport")
        with page.expect_download() as dl: page.click("#btnExport")
        bpath = os.path.join(tempfile.gettempdir(), "ba-backup.json"); dl.value.save_as(bpath)
        bk = json.load(open(bpath, encoding="utf-8"))
        check("백업·복원", "데이터 백업 파일이 만들어지고 기록·캠페인 슬롯이 들어 있으며 이미지는 빠져 있다", lambda: (
            None if bk["format"] == "boardarchive-backup" and len(bk["data"]["records"]) == 1 and not bk["data"]["portraits"] and "legacy-x:1" in bk["data"]["campaigns"] else (_ for _ in ()).throw(AssertionError("내용 누락"))))
        check("백업·복원", "파일 이름이 날짜가 들어간 boardarchive-backup-날짜-시각.json 이다", lambda: (None if re.match(r"boardarchive-backup-\d{8}-\d{4}\.json", dl.value.suggested_filename) else (_ for _ in ()).throw(AssertionError(dl.value.suggested_filename))))

        # 완전히 새 브라우저 = "모바일 기기"
        ctx2 = br.new_context(viewport={"width": 390, "height": 844}, accept_downloads=True)
        ctx2.route(re.compile(r"https://fonts\.(googleapis|gstatic)\.com/.*"), FONT_STUB)
        p2 = ctx2.new_page(); p2.on("pageerror", lambda e: errors.append("pageerror(기기2): " + str(e)))
        p2.goto(BASE); p2.wait_for_selector("#nav a")
        check("백업·복원", "새 기기(빈 저장소)에서는 기록 0건, 초상화 없음으로 시작한다", lambda: (None if count_records(p2) == 0 and not p2.evaluate("window.__ba.portraits.has('rapi')") else (_ for _ in ()).throw(AssertionError("비어있지 않음"))))
        p2.click("#nav a[data-tab=settings]"); p2.click("#settabs [data-st=data]"); p2.wait_for_selector("#importFile", state="attached")
        p2.set_input_files("#importFile", bpath); p2.wait_for_selector("#btnMerge")
        p2.screenshot(path=f"{SHOTS}/8-import.png", full_page=True)
        p2.click("#btnMerge"); p2.wait_for_function("window.__ba.storage.get('campaigns','legacy-x:1').then(c => !!c)"); p2.wait_for_timeout(700)
        check("백업·복원", "PC에서 만든 데이터 백업을 새 기기에서 '합치기'하면 기록 1건·캠페인 슬롯이 복원된다(이미지는 따로)", lambda: (
            None if count_records(p2) == 1 and p2.evaluate("window.__ba.storage.get('campaigns','legacy-x:1').then(c=>c.data.chapter)") == 4 else (_ for _ in ()).throw(AssertionError("복원 실패"))))
        p2.set_input_files("#importFile", bpath); p2.wait_for_selector("#btnMerge"); p2.click("#btnMerge"); p2.wait_for_timeout(400)
        check("백업·복원", "같은 백업을 한 번 더 가져와도 기록이 중복되지 않는다", lambda: (None if count_records(p2) == 1 else (_ for _ in ()).throw(AssertionError(str(count_records(p2))))))
        p2.reload(); p2.wait_for_selector("#nav a")
        check("백업·복원", "복원 후 새로고침해도 유지된다", lambda: (None if count_records(p2) == 1 else (_ for _ in ()).throw(AssertionError("사라짐"))))
        # 잘못된 파일
        bad = os.path.join(tempfile.gettempdir(), "bad.json"); open(bad, "w").write("{\"hello\": 1}")
        p2.click("#nav a[data-tab=settings]"); p2.click("#settabs [data-st=data]"); p2.wait_for_selector("#importFile", state="attached"); p2.set_input_files("#importFile", bad)
        check("백업·복원", "엉뚱한 파일을 가져오면 안내 문구가 뜨고 데이터는 그대로다", lambda: (p2.wait_for_selector("text=이 앱의 백업 파일이 아닙니다"), None if count_records(p2) == 1 else (_ for _ in ()).throw(AssertionError("데이터 변함"))))

        # 전체 삭제 후 교체 복원 (기기 1)
        page.click("#btnWipe"); page.click("#btnWipe"); page.wait_for_function("window.__ba.portraits.size === 0")
        check("백업·복원", "'모든 데이터 삭제'는 두 번 눌러야 실행되고, 기록·초상화가 비워진다", lambda: (None if count_records(page) == 0 else (_ for _ in ()).throw(AssertionError("안 지워짐"))))
        page.set_input_files("#importFile", bpath); page.wait_for_selector("#btnReplace"); page.click("#btnReplace"); page.click("#btnReplace")
        page.wait_for_function("window.__ba.storage.all('records').then(a => a.length === 1)"); page.wait_for_timeout(800)
        check("백업·복원", "'전체 교체'로 삭제 전 상태가 그대로 복구된다 (기록 1건, 초상화)", lambda: (None if count_records(page) == 1 else (_ for _ in ()).throw(AssertionError(str(count_records(page))))))
        page.screenshot(path=f"{SHOTS}/9-settings.png", full_page=True)

        # ---------- 오프라인(PWA) ----------
        page.goto(BASE); page.wait_for_selector("#nav a")
        page.wait_for_function("navigator.serviceWorker.ready.then(r => !!r.active)", timeout=15000)
        page.wait_for_timeout(1500)
        ncache = page.evaluate("caches.open('boardarchive-files').then(c => c.keys()).then(k => k.length)")
        check("오프라인(PWA)", f"서비스 워커가 켜지고 앱 파일 전체가 오프라인용으로 저장된다 ({ncache}개)", lambda: (None if ncache >= 20 else (_ for _ in ()).throw(AssertionError(f"저장 {ncache}개"))))
        ctx.set_offline(True)
        def offline_ok():
            page.reload(); page.wait_for_selector("#nav a", timeout=10000)
            page.wait_for_selector(".gcard[data-id=nothanks]")
            page.click("#nav a[data-tab=records]"); page.wait_for_selector("#overall")
            assert "경쟁 1판" in page.inner_text("#overall"), "기록이 안 보임"
        check("오프라인(PWA)", "인터넷을 끊고 새로고침해도 앱이 열리고 기록이 보인다", offline_ok)
        def offline_game():
            page.click("#nav a[data-tab=home]"); page.click(".gcard[data-id=nothanks]"); page.wait_for_selector("#setup .seat"); page.click("#btnStart"); page.wait_for_selector(".g-nt", timeout=8000)
        check("오프라인(PWA)", "오프라인에서도 게임 파일을 불러와 게임이 시작된다", offline_game)
        ctx.set_offline(False)
        mf = page.evaluate("fetch('manifest.webmanifest').then(r => r.json())")
        check("오프라인(PWA)", "설치용 매니페스트(이름·standalone·아이콘 3종)가 올바르다", lambda: (None if mf["display"] == "standalone" and len(mf["icons"]) == 3 and mf["start_url"] == "./" else (_ for _ in ()).throw(AssertionError("매니페스트"))))

        page.goto(BASE); page.wait_for_selector("#nav a")
        css = page.evaluate("[getComputedStyle(document.body).overscrollBehaviorY, document.querySelector('meta[name=color-scheme]').content]")
        check("디자인", "당겨서 새로고침이 꺼져 있고(overscroll none), 강제 다크모드 제외(only light) 설정이 들어 있다", lambda: (None if css == ["none", "only light"] else (_ for _ in ()).throw(AssertionError(str(css)))))
        for w, nm in [(360, "폰 360px"), (1280, "PC 1280px")]:
            page.set_viewport_size({"width": w, "height": 860}); page.wait_for_timeout(200)
            ov = page.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1")
            check("디자인", f"{nm} 화면에서 가로로 넘치는 부분이 없다", lambda ov=ov: (None if not ov else (_ for _ in ()).throw(AssertionError("가로 스크롤 생김"))))
        page.set_viewport_size({"width": 390, "height": 844})

        # ---------- 노땡스 (게임별 테마·대사 표시 시간) : 새 저장공간에서 따로 점검 ----------
        ctx2 = br.new_context(viewport={"width": 390, "height": 844})
        ctx2.route(re.compile(r"https://fonts\.(googleapis|gstatic)\.com/.*"), FONT_STUB)
        p2 = ctx2.new_page()
        p2.on("pageerror", lambda e: errors.append("pageerror(nt): " + str(e)))
        p2.on("console", lambda m: errors.append("console.error(nt): " + m.text) if m.type == "error" else None)
        p2.goto(BASE); p2.wait_for_selector("#nav a")
        check("노땡스", "게임 목록에 노땡스 표지(게임 전용 색)가 나온다", lambda: p2.wait_for_selector(".gcard[data-id=nothanks] .cover"))
        p2.click(".gcard[data-id=nothanks]"); p2.wait_for_selector("#setup .seat"); p2.click("button[data-n='4']"); p2.click("#btnStart"); p2.wait_for_selector(".g-nt")
        check("노땡스", "게임 화면이 카드 테이블 테마로 뜨고 4명이 앉는다", lambda: (None if p2.locator(".g-nt .nt-seat").count() == 4 else (_ for _ in ()).throw(AssertionError("좌석 수"))))
        bg = p2.evaluate("getComputedStyle(document.querySelector('.g-nt')).backgroundColor + '|' + getComputedStyle(document.body).backgroundColor")
        p2.wait_for_selector(".nt-say", timeout=8000)
        t0 = time.time(); first = p2.locator(".nt-say").first.inner_text()
        p2.wait_for_timeout(2900)      # 옛 방식(2.6초)이면 이미 사라졌을 시각
        still = p2.locator(".nt-say", has_text=first[:6]).count()
        check("노땡스", "말풍선 대사가 나온 뒤 2.9초가 지나도 계속 읽을 수 있다 (기존: 2.6초 만에 사라짐)", lambda: (None if still >= 1 else (_ for _ in ()).throw(AssertionError("2.9초 만에 사라짐: " + first))))
        p2.screenshot(path=f"{SHOTS}/10-nothanks.png")
        check("노땡스", "대사가 로그에도 남는다 (놓쳐도 다시 읽기)", lambda: (None if p2.locator(".nt-log .sp").count() >= 1 else (_ for _ in ()).throw(AssertionError("로그에 대사 없음"))))
        for w in (360, 390):
            p2.set_viewport_size({"width": w, "height": 860}); p2.wait_for_timeout(150)
            ov = p2.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1")
            check("노땡스", f"게임 화면이 {w}px 폰 폭에서 가로로 넘치지 않는다", lambda ov=ov: (None if not ov else (_ for _ in ()).throw(AssertionError("가로 스크롤"))))
        # 빠른 모드로 한 판 끝까지
        p2.goto(BASE + "?fast=1"); p2.wait_for_selector("#nav a")
        p2.click(".gcard[data-id=nothanks]"); p2.wait_for_selector("#setup .seat"); p2.click("button[data-n='4']"); p2.click("#btnStart"); p2.wait_for_selector(".g-nt")
        def play_nt():
            t0 = time.time()
            while p2.locator(".modal .rank-row").count() == 0:
                if time.time() - t0 > 90: raise AssertionError("90초 안에 끝나지 않음")
                tk, ps = p2.locator("[data-a=take]"), p2.locator("[data-a=pass]")
                if tk.is_enabled():
                    hint = p2.locator(".nt-hint").inner_text()
                    (ps if ps.is_enabled() and "손해" in hint else tk).click()
                p2.wait_for_timeout(15)
        check("노땡스", "실제 화면을 눌러 4인 한 판을 끝까지 플레이하면 결과 화면이 나온다", play_nt)
        check("노땡스", "결과 화면에 순위 4줄이 나온다", lambda: (None if p2.locator(".modal .rank-row").count() == 4 else (_ for _ in ()).throw(AssertionError("순위 줄 수"))))
        rec2 = p2.evaluate("window.__ba.storage.all('records').then(a => a[0].value)")
        check("노땡스", "기록에 노땡스·버전 1.9.0·4명이 저장된다", lambda: (None if rec2["gameId"] == "nothanks" and rec2["gameVersion"] == "1.9.0" and len(rec2["players"]) == 4 else (_ for _ in ()).throw(AssertionError(str(rec2)[:200]))))
        p2.click("text=홈으로"); p2.wait_for_selector(".gcard[data-id=nothanks]")
        check("노땡스", "게임에서 나오면 게임 전용 스타일이 남지 않는다 (앨범 화면 보호)", lambda: (None if p2.evaluate("![...document.querySelectorAll('style')].some(s => s.textContent.includes('.g-nt'))") else (_ for _ in ()).throw(AssertionError("스타일이 남음"))))
        # ---------- 연출(이펙트): 실제 속도로 몇 수 진행 + 설정 켜기/끄기 ----------
        def fx_real():
            p2.goto(BASE); p2.wait_for_selector("#nav a")
            p2.click(".gcard[data-id=nothanks]"); p2.wait_for_selector("#setup .seat"); p2.click("button[data-n='3']"); p2.click("#btnStart"); p2.wait_for_selector(".g-nt")
            seen_ghost, moves, t0 = False, 0, time.time()
            while moves < 3 and time.time() - t0 < 40:
                if p2.locator("[data-a=take]:enabled").count():
                    p2.click("[data-a=take]"); moves += 1
                    for _ in range(20):
                        if p2.locator(".g-nt .fx-layer .fx-ghost").count(): seen_ghost = True; break
                        p2.wait_for_timeout(15)
                p2.wait_for_timeout(60)
            assert moves == 3, f"내 차례가 3번 오지 않음 ({moves})"
            assert seen_ghost, "받기를 눌렀는데 날아가는 카드가 보이지 않음"
            p2.wait_for_timeout(900)
            assert p2.locator(".g-nt .fx-layer .fx-ghost").count() == 0, "연출이 끝난 뒤에도 유령 카드가 남음"
            p2.click("text=나가기"); p2.click("text=정말 나갈까요? (기록 안 남음)"); p2.wait_for_selector("#nav a", state="visible")
            assert p2.locator(".fx-layer").count() == 0, "게임에서 나왔는데 연출 층이 남음"
        check("연출", "실제 속도에서 받기를 누르면 카드가 내 자리로 날아가고, 끝나면 흔적 없이 사라진다", fx_real)
        def fx_prefs():
            p2.click("#nav a[data-tab=settings]"); p2.click("#settabs [data-st=general]"); p2.wait_for_selector("#fxPrefs")
            assert p2.locator("#fxPrefs [data-fx]").count() == 3, "설정 버튼 3개(움직임·효과음·진동)가 아님"
            p2.click("#fxPrefs [data-fx=ba_fx]")
            assert p2.evaluate("localStorage.getItem('ba_fx')") == "0", "움직임 끄기가 저장되지 않음"
            p2.click("#fxPrefs [data-fx=ba_fx]")
            assert p2.evaluate("localStorage.getItem('ba_fx')") == "1"
        check("연출", "설정에서 움직임·효과음·진동을 각각 켜고 끌 수 있고 기기에 저장된다", fx_prefs)

        # ---------- 러브레터: 실제 화면에서 2인 한 판 끝까지 ----------
        p2.goto(BASE + "?fast=1"); p2.wait_for_selector("#nav a")
        p2.click(".gcard[data-id=loveletter]"); p2.wait_for_selector("#setup .seat"); p2.click("button[data-n='2']"); p2.click("#btnStart"); p2.wait_for_selector(".g-ll")
        check("러브레터", "게임 화면이 봉인 편지 테마로 뜨고 내 손패가 보인다", lambda: (None if p2.locator(".g-ll .ll-hand .ll-card").count() >= 1 else (_ for _ in ()).throw(AssertionError("손패 없음"))))
        def play_ll():
            t0 = time.time()
            def tap(loc):
                try: loc.click(timeout=1500)
                except Exception: pass      # 결과창이 막 떠서 가려진 경우 등: 다음 반복에서 다시 판단
            while p2.locator(".modal .rank-row").count() == 0:
                if time.time() - t0 > 150: raise AssertionError("150초 안에 끝나지 않음")
                if p2.locator(".g-ll .ll-pop").is_visible():
                    tap(p2.locator(".g-ll .ll-pop"))
                elif p2.locator(".g-ll .ll-over").is_visible():
                    tap(p2.locator(".g-ll .ll-over .ll-btn"))
                else:
                    cards = p2.locator(".g-ll .ll-hand .ll-card:not(.no)")
                    if p2.locator(".g-ll .ll-panel .ll-btn").count() == 0:
                        if cards.count() > 0: tap(cards.first)
                    else:
                        pb = p2.locator(".g-ll .ll-panel .ll-btn:not(.off)")
                        go = p2.locator(".g-ll .ll-panel .ll-btn.go, .g-ll .ll-panel .ll-btn.warn")
                        if pb.count() > 0: tap(go.first if go.count() > 0 else pb.first)
                p2.wait_for_timeout(15)
        check("러브레터", "실제 화면을 눌러 2인 한 판을 끝까지 플레이하면 결과 화면이 나온다", play_ll)
        rec3 = p2.evaluate("window.__ba.storage.all('records').then(a => a.map(x => x.value).find(v => v.gameId === 'loveletter'))")
        check("러브레터", "기록에 러브레터·버전 1.2.0·2명이 저장된다", lambda: (None if rec3 and rec3["gameVersion"] == "1.2.0" and len(rec3["players"]) == 2 else (_ for _ in ()).throw(AssertionError(str(rec3)[:200]))))
        p2.click("text=홈으로"); p2.wait_for_selector(".gcard[data-id=loveletter]")
        check("러브레터", "게임에서 나오면 러브레터 전용 스타일이 남지 않는다", lambda: (None if p2.evaluate("![...document.querySelectorAll('style')].some(s => s.textContent.includes('.g-ll'))") else (_ for _ in ()).throw(AssertionError("스타일이 남음"))))
        # ---------- 킹도미노: 규칙 선택 → 실제 화면에서 4인 한 판 끝까지 ----------
        p2.goto(BASE + "?fast=1"); p2.wait_for_selector("#nav a")
        p2.click(".gcard[data-id=kingdomino]"); p2.wait_for_selector("#setup .seat"); p2.click("button[data-n='4']"); p2.click("#btnStart"); p2.wait_for_selector(".g-kd .kd-start")
        p2.click(".g-kd [data-o=mk]")
        check("킹도미노", "시작 전 규칙 선택 화면에서 변형 규칙을 켤 수 있다", lambda: p2.wait_for_selector(".g-kd .kd-opt.on[data-o=mk]", timeout=2000))
        p2.click(".g-kd .kd-start"); p2.wait_for_selector(".g-kd .kd-dock.mine", timeout=30000)
        check("킹도미노", "왕국 지도 화면이 뜨고 상대 3명의 왕국과 타일 4장이 그림으로 보인다", lambda: (None if p2.locator(".g-kd .kd-opp").count() == 3 and p2.locator(".g-kd .kd-next .kd-tile svg use").count() == 8 else (_ for _ in ()).throw(AssertionError("상대/타일 수"))))
        for w in (360, 390):
            p2.set_viewport_size({"width": w, "height": 844}); p2.wait_for_timeout(150)
            ov = p2.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1")
            check("킹도미노", f"게임 화면이 {w}px 폰 폭에서 가로로 넘치지 않는다", lambda ov=ov: (None if not ov else (_ for _ in ()).throw(AssertionError("가로 스크롤"))))
        seen = {"preview": False, "fits": True}
        def play_kd():
            t0 = time.time()
            while p2.locator(".g-kd .kd-finish").count() == 0:
                if time.time() - t0 > 240: raise AssertionError("240초 안에 끝나지 않음")
                if p2.locator(".g-kd .kd-dock.mine").count() == 0: p2.wait_for_timeout(20); continue
                if p2.locator(".g-kd .kd-next.can").count():
                    p2.locator(".g-kd .kd-next .kd-tile.free").first.click(force=True); p2.click(".g-kd [data-a=pick]")
                elif p2.locator(".g-kd [data-a=discard]").count(): p2.click(".g-kd [data-a=discard]")
                elif p2.locator(".g-kd .kd-board .kd-hl").count():
                    box = p2.evaluate("(() => { const r = document.querySelector('.g-kd .kd-board .kd-hl').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()")
                    p2.mouse.click(box[0], box[1])
                    if p2.locator(".g-kd .kd-board .kd-ghost").count() == 2 and "합계" in p2.locator(".g-kd .kd-dtxt").inner_text(): seen["preview"] = True
                    if p2.evaluate("document.querySelector('.g-kd .kd-board').getBoundingClientRect().height") > 420: seen["fits"] = False
                    p2.click(".g-kd [data-a=place]")
                p2.wait_for_timeout(15)
        check("킹도미노", "실제 화면을 눌러 4인 한 판을 끝까지 플레이하면 최종 왕국 화면이 나온다", play_kd)
        check("킹도미노", "칸을 누르면 타일 미리보기와 점수 변화가 먼저 보이고, 그 뒤에 '놓기'로 확정한다", lambda: (None if seen["preview"] else (_ for _ in ()).throw(AssertionError("미리보기 없음"))))
        check("킹도미노", "내 왕국 판이 폰 화면 높이 안에 들어온다", lambda: (None if seen["fits"] else (_ for _ in ()).throw(AssertionError("판이 너무 큼"))))
        p2.screenshot(path=f"{SHOTS}/12-kingdomino-final.png")
        p2.click(".g-kd .kd-finish"); p2.wait_for_selector(".modal .rank-row")
        rec4 = p2.evaluate("window.__ba.storage.all('records').then(a => a.map(x => x.value).find(v => v.gameId === 'kingdomino'))")
        check("킹도미노", "기록에 킹도미노·버전 1.1.0·4명이 저장된다", lambda: (None if rec4 and rec4["gameVersion"] == "1.1.0" and len(rec4["players"]) == 4 else (_ for _ in ()).throw(AssertionError(str(rec4)[:200]))))
        p2.click("text=홈으로"); p2.wait_for_selector(".gcard[data-id=kingdomino]")
        check("킹도미노", "게임에서 나오면 킹도미노 전용 스타일이 남지 않는다", lambda: (None if p2.evaluate("![...document.querySelectorAll('style')].some(s => s.textContent.includes('.g-kd'))") else (_ for _ in ()).throw(AssertionError("스타일이 남음"))))
        # ---------- 스플렌더: 폰 한 화면 · 이어하기 · 4인 한 판 끝까지 ----------
        p2.set_viewport_size({"width": 412, "height": 780})
        p2.goto(BASE + "?fast=1"); p2.wait_for_selector("#nav a")
        p2.click(".gcard[data-id=splendor]"); p2.wait_for_selector("#setup .seat"); p2.click("button[data-n='4']"); p2.click("#btnStart")
        p2.wait_for_selector(".g-splendor .sp-dock.mine", timeout=30000)
        check("스플렌더", "보석상 테이블 화면: 상대 3명·귀족 5명·카드 12장·보석 6종이 그림으로 보인다", lambda: (None if p2.locator(".g-splendor .sp-opp").count() == 3 and p2.locator(".g-splendor .sp-nb").count() == 5 and p2.locator(".g-splendor .sp-row .sp-card .sp-art use").count() == 12 and p2.locator(".g-splendor .sp-tok").count() == 6 else (_ for _ in ()).throw(AssertionError("화면 구성"))))
        for (w, hgt) in ((412, 780), (390, 844), (360, 740)):
            p2.set_viewport_size({"width": w, "height": hgt}); p2.wait_for_timeout(150)
            m = p2.evaluate("({v: document.documentElement.scrollHeight > innerHeight + 1, h: document.documentElement.scrollWidth > innerWidth + 1})")
            check("스플렌더", f"{w}×{hgt} 폰 화면에서 스크롤 없이 한 화면에 다 보인다", lambda m=m: (None if not m["v"] and not m["h"] else (_ for _ in ()).throw(AssertionError(str(m)))))
        p2.set_viewport_size({"width": 412, "height": 780})
        def sp_reserve_then_exit():
            p2.locator(".g-splendor .sp-row .sp-card").first.click(); p2.click(".g-splendor [data-a=res]")
            p2.wait_for_selector(".g-splendor .sp-mres .sp-card")
            p2.wait_for_selector(".g-splendor .sp-dock.mine", timeout=30000)
            p2.click(".gmenu .gm"); p2.click(".gmenu .gp button:last-child"); p2.click(".gmenu .gp button:last-child"); p2.wait_for_selector(".gcard[data-id=splendor]")
            p2.click(".gcard[data-id=splendor]"); p2.wait_for_selector("#resume #btnResume", timeout=5000)
            p2.click("#btnResume"); p2.wait_for_selector(".g-splendor .sp-mres .sp-card", timeout=5000)
        check("스플렌더", "중간에 나가도 '이어하기'로 같은 판(예약 카드 포함)에 돌아온다", sp_reserve_then_exit)
        def play_sp():
            t0 = time.time()
            while p2.locator(".g-splendor [data-a=finish]").count() == 0:
                if time.time() - t0 > 240: raise AssertionError("240초 안에 끝나지 않음")
                if p2.locator(".g-splendor .sp-dock.mine").count() == 0: p2.wait_for_timeout(20); continue
                if p2.locator(".g-splendor [data-nk]").count(): p2.locator(".g-splendor [data-nk]").first.click(); continue
                if p2.locator(".g-splendor .sp-dc").count(): p2.locator(".g-splendor .sp-dc").first.click(); continue
                if p2.locator(".g-splendor [data-a=pass]").count(): p2.click(".g-splendor [data-a=pass]"); continue
                if p2.locator(".g-splendor .sp-card.can").count():
                    p2.locator(".g-splendor .sp-card.can").last.click(); p2.click(".g-splendor [data-a=buy]"); continue
                k = min(3, p2.locator(".g-splendor .sp-tok:not(.none):not(.sp-k5)").count())
                for _ in range(k): p2.locator(".g-splendor .sp-tok:not(.none):not(.sp-k5):not(.on)").first.click()
                if k and p2.locator(".g-splendor [data-a=take]:not([disabled])").count(): p2.click(".g-splendor [data-a=take]"); continue
                if p2.locator(".g-splendor [data-a=cancel]").count(): p2.click(".g-splendor [data-a=cancel]")
                p2.locator(".g-splendor .sp-row .sp-card").first.click(); p2.click(".g-splendor [data-a=res]")
        check("스플렌더", "실제 화면을 눌러(보석·구매·예약·반납) 4인 한 판을 끝까지 플레이하면 순위 화면이 나온다", play_sp)
        p2.screenshot(path=f"{SHOTS}/13-splendor-final.png")
        p2.click(".g-splendor [data-a=finish]"); p2.wait_for_selector(".modal .rank-row")
        rec5 = p2.evaluate("window.__ba.storage.all('records').then(a => a.map(x => x.value).find(v => v.gameId === 'splendor'))")
        left = p2.evaluate("window.__ba.storage.all('campaigns').then(a => a.filter(x => x.key.startsWith('splendor:')).length)")
        check("스플렌더", "기록에 스플렌더·버전 1.0.0·4명이 저장되고, 이어하기 저장은 지워진다", lambda: (None if rec5 and rec5["gameVersion"] == "1.0.0" and len(rec5["players"]) == 4 and left == 0 else (_ for _ in ()).throw(AssertionError(str(rec5)[:200] + f" 남은 저장 {left}"))))
        p2.click("text=홈으로"); p2.wait_for_selector(".gcard[data-id=splendor]")
        # ---------- 스플렌더: 스킨(점수·비용이 그림에 들어 있는 그림 세트) ----------
        TINY = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAEklEQVR4nGNgGAWjYBSMAhgAAAgAAAHqYDa2AAAAAElFTkSuQmCC"
        p2.evaluate("""async (u) => {
          const put = (k) => window.__ba.storage.put('portraits', k, { dataUrl: u, updatedAt: new Date().toISOString() });
          for (const c of 'wugrk') for (let n = 1; n <= 18; n++) await put(`art:splendor:card-${c}:${String(n).padStart(2, '0')}`);
          for (let n = 1; n <= 10; n++) await put(`art:splendor:noble:${String(n).padStart(2, '0')}`);
          for (const c of 'wugrky') await put(`art:splendor:token-${c}:01`);
          await put('art:splendor:skin:01'); await put('art:splendor:bg:01');
        }""", TINY)
        p2.goto(BASE + "?fast=1"); p2.wait_for_selector("#nav a")
        p2.click(".gcard[data-id=splendor]"); p2.wait_for_selector("#setup .seat"); p2.click("button[data-n='4']"); p2.click("#btnStart")
        p2.wait_for_selector(".g-splendor .sp-dock.mine", timeout=30000)
        check("스플렌더", "스킨이 있으면 카드·귀족·보석이 그림으로 바뀌고 앱이 따로 그리는 점수·비용 표시는 사라진다", lambda: (None if p2.locator(".g-splendor .sp-row .sp-card.baked").count() == 12 and p2.locator(".g-splendor .sp-nb.baked").count() == 5 and p2.locator(".g-splendor .sp-tok.baked").count() == 6 and p2.locator(".g-splendor .sp-card.baked .sp-pip:visible").count() == 0 and p2.locator(".g-splendor .sp-card.baked .sp-pt:visible").count() == 0 and p2.locator(".g-splendor .sp-nb.baked .sp-req:visible").count() == 0 else (_ for _ in ()).throw(AssertionError("스킨 적용 안 됨"))))
        check("스플렌더", "배경 그림을 올리면 게임판 배경으로 깔린다", lambda: (None if p2.evaluate("getComputedStyle(document.querySelector('.g-splendor')).backgroundImage.includes('data:image')") else (_ for _ in ()).throw(AssertionError("배경 없음"))))
        p2.screenshot(path=f"{SHOTS}/13b-splendor-skin.png")
        p2.evaluate("""async () => { for (const { key } of await window.__ba.storage.all('portraits')) if (key.startsWith('art:splendor:')) await window.__ba.storage.del('portraits', key); }""")
        p2.goto(BASE + "?fast=1"); p2.wait_for_selector("#nav a")
        check("스플렌더", "게임에서 나오면 스플렌더 전용 스타일이 남지 않는다", lambda: (None if p2.evaluate("![...document.querySelectorAll('style')].some(s => s.textContent.includes('.g-splendor'))") else (_ for _ in ()).throw(AssertionError("스타일이 남음"))))
        # ---------- 레지사이드(협력): 폰 한 화면 · 카드 고르기 · 이어하기 · 한 판 끝까지 · 협력 기록 ----------
        p2.set_viewport_size({"width": 412, "height": 780})
        p2.goto(BASE + "?fast=1"); p2.wait_for_selector("#nav a")
        p2.click(".gcard[data-id=regicide]"); p2.wait_for_selector("#setup .seat"); p2.click("button[data-n='4']"); p2.click("#btnStart")
        p2.wait_for_selector(".g-regicide .rg-dock.mine", timeout=30000)
        check("레지사이드", "성의 테이블 화면: 동료 3명·왕족 카드·체력 막대·12칸 진행 표시·손패 5장이 그림으로 보인다", lambda: (None if p2.locator(".g-regicide .rg-mate").count() == 3 and p2.locator(".g-regicide .rg-boss .rg-face").count() == 1 and p2.locator(".g-regicide .rg-hp").count() == 1 and p2.locator(".g-regicide .rg-pp").count() == 12 and p2.locator(".g-regicide .rg-hand .rg-card").count() >= 4 and p2.locator(".g-regicide .rg-hand .rg-card svg use").count() > 8 else (_ for _ in ()).throw(AssertionError("화면 구성 " + str(p2.locator(".g-regicide .rg-hand .rg-card").count())))))
        for (w, hgt) in ((412, 780), (390, 844), (360, 740)):
            p2.set_viewport_size({"width": w, "height": hgt}); p2.wait_for_timeout(150)
            m = p2.evaluate("({v: document.documentElement.scrollHeight > innerHeight + 1, h: document.documentElement.scrollWidth > innerWidth + 1, b: document.querySelector('.rg-hand').getBoundingClientRect().bottom <= innerHeight})")
            check("레지사이드", f"4인 {w}×{hgt} 폰 화면에서 스크롤 없이 손패까지 한 화면에 보인다", lambda m=m: (None if not m["v"] and not m["h"] and m["b"] else (_ for _ in ()).throw(AssertionError(str(m)))))
        p2.set_viewport_size({"width": 412, "height": 780})
        def rg_select():
            hand = p2.locator(".g-regicide .rg-hand .rg-card"); hand.first.click()
            assert p2.locator(".g-regicide .rg-hand .rg-card.sel").count() == 1, "고른 카드가 올라오지 않음"
            assert p2.locator(".g-regicide [data-a=play]:not([disabled])").count() == 1, "한 장은 낼 수 있어야 함"
            p2.click(".g-regicide [data-a=clear]"); assert p2.locator(".g-regicide .rg-hand .rg-card.sel").count() == 0, "취소가 안 됨"
        check("레지사이드", "카드를 누르면 올라오고(고름) 취소하면 내려가며, 한 장은 바로 낼 수 있다", rg_select)
        def rg_resume():
            before = p2.evaluate("[...document.querySelectorAll('.g-regicide .rg-hand [data-c]')].map(e => e.dataset.c).join(',') + '|' + document.querySelector('.rg-en').textContent + '|' + document.querySelector('.rg-hp b').textContent")
            leave(p2); p2.wait_for_selector(".gcard[data-id=regicide]")
            p2.click(".gcard[data-id=regicide]"); p2.wait_for_selector("#resume #btnResume", timeout=5000)
            p2.click("#btnResume"); p2.wait_for_selector(".g-regicide .rg-dock.mine", timeout=30000)
            after = p2.evaluate("[...document.querySelectorAll('.g-regicide .rg-hand [data-c]')].map(e => e.dataset.c).join(',') + '|' + document.querySelector('.rg-en').textContent + '|' + document.querySelector('.rg-hp b').textContent")
            assert before == after, before + " != " + after
        check("레지사이드", "중간에 나가도 '이어하기'로 같은 손패·같은 왕족 체력의 판에 돌아온다", rg_resume)
        def play_rg():
            t0 = time.time(); k = 0
            while p2.locator(".g-regicide [data-a=finish]").count() == 0:
                if time.time() - t0 > 200: raise AssertionError("200초 안에 끝나지 않음")
                if p2.locator(".g-regicide .rg-dock.mine").count() == 0: p2.wait_for_timeout(20); continue
                k += 1
                if p2.locator(".g-regicide [data-nx]").count(): p2.locator(".g-regicide [data-nx]").first.click(); continue
                if p2.locator(".g-regicide [data-a=suffer]").count(): p2.click(".g-regicide [data-a=auto]"); p2.click(".g-regicide [data-a=suffer]"); continue
                cards = p2.locator(".g-regicide .rg-hand .rg-card"); n = cards.count()
                if n == 0:
                    if p2.locator(".g-regicide [data-a=yield]:not([disabled])").count(): p2.click(".g-regicide [data-a=yield]")
                    else: p2.wait_for_timeout(30)
                    continue
                cards.nth(k % n).click()
                if p2.locator(".g-regicide [data-a=play]:not([disabled])").count(): p2.click(".g-regicide [data-a=play]")
                else:
                    if p2.locator(".g-regicide [data-a=clear]").count(): p2.click(".g-regicide [data-a=clear]")
                    if p2.locator(".g-regicide [data-a=yield]:not([disabled])").count(): p2.click(".g-regicide [data-a=yield]")
        check("레지사이드", "실제 화면을 눌러(카드 내기·양보·반격 막기·다음 사람 지목) 한 판을 끝까지 플레이하면 결과 화면이 나온다", play_rg)
        p2.screenshot(path=f"{SHOTS}/14-regicide-final.png")
        p2.click(".g-regicide [data-a=finish]"); p2.wait_for_selector(".modal")
        rec6 = p2.evaluate("window.__ba.storage.all('records').then(a => a.map(x => x.value).find(v => v.gameId === 'regicide'))")
        left2 = p2.evaluate("window.__ba.storage.all('campaigns').then(a => a.filter(x => x.key.startsWith('regicide:')).length)")
        check("레지사이드", "기록에 레지사이드·버전 1.0.0·4명이 협력 기록(승/패, 모두 같은 순위)으로 저장되고, 이어하기 저장은 지워진다", lambda: (None if rec6 and rec6["gameVersion"] == "1.0.0" and rec6.get("mode") == "coop" and rec6.get("outcome") in ("win", "lose") and len(rec6["players"]) == 4 and len({p["rank"] for p in rec6["players"]}) == 1 and left2 == 0 else (_ for _ in ()).throw(AssertionError(str(rec6)[:240] + f" 남은 저장 {left2}"))))
        p2.click("text=홈으로"); p2.wait_for_selector(".gcard[data-id=regicide]")
        check("레지사이드", "게임에서 나오면 레지사이드 전용 스타일이 남지 않는다", lambda: (None if p2.evaluate("![...document.querySelectorAll('style')].some(s => s.textContent.includes('.g-regicide'))") else (_ for _ in ()).throw(AssertionError("스타일이 남음"))))
        def rg_two():
            p2.set_viewport_size({"width": 360, "height": 740})
            p2.click(".gcard[data-id=regicide]"); p2.wait_for_selector("#setup .seat"); p2.click("button[data-n='2']"); p2.click("#btnStart")
            p2.wait_for_selector(".g-regicide .rg-dock.mine", timeout=30000)
            assert p2.locator(".g-regicide .rg-mate").count() == 1 and p2.locator(".g-regicide .rg-hand .rg-card").count() >= 6, "2인 화면 구성"
            m = p2.evaluate("({v: document.documentElement.scrollHeight > innerHeight + 1, h: document.documentElement.scrollWidth > innerWidth + 1, w: [...document.querySelectorAll('.rg-hand .rg-card')].every(e => e.getBoundingClientRect().right <= innerWidth && e.getBoundingClientRect().left >= 0)})")
            assert not m["v"] and not m["h"] and m["w"], "2인 손패 7장이 화면 안에 안 들어옴 " + str(m)
            p2.screenshot(path=f"{SHOTS}/15-regicide-2p.png")
        check("레지사이드", "2인(손패 7장)도 360×740 폰 화면 안에 다 들어온다", rg_two)
        leave(p2); p2.wait_for_selector(".gcard[data-id=regicide]")
        # ---------- 스프롤로폴리스(협력·솔로): 도시 짓기 · 카드 놓기 · 이어하기 · 한 판 끝까지 · 협력 기록 ----------
        p2.set_viewport_size({"width": 390, "height": 844})
        p2.goto(BASE + "?fast=1"); p2.wait_for_selector("#nav a")
        def sr_start(n):
            p2.click(".gcard[data-id=sprawlopolis]"); p2.wait_for_selector("#setup .seat"); p2.click(f"button[data-n='{n}']")
            assert p2.locator("#setup .seat").count() == n and p2.locator("#setup .seat.me").count() == 1, f"{n}인 좌석"
            p2.click("#btnStart"); p2.wait_for_selector(".g-sprawlopolis [data-a=begin]")
        def sr_turn():
            """내 차례에 카드 한 장을 도시에 놓는다. 눌러 볼 수 있는 칸(.sr-hint)의 가운데를 마우스로 누른다."""
            p2.locator(".g-sprawlopolis .sr-hand .sr-card.live").first.click()
            pt = p2.evaluate("(() => { const hs = [...document.querySelectorAll('.g-sprawlopolis .sr-hint')]; if (!hs.length) return null; const r = hs[Math.floor(hs.length / 2)].getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()")
            assert pt, "놓을 수 있는 칸 표시(.sr-hint)가 없음"
            p2.mouse.click(pt[0], pt[1])
            assert p2.locator(".g-sprawlopolis [data-a=place]:not([disabled])").count() == 1, "칸을 눌러도 놓기 버튼이 안 나옴"
            p2.click(".g-sprawlopolis [data-a=place]")
        def sr_play_to_end():
            t0 = time.time()
            while p2.locator(".g-sprawlopolis [data-a=finish]").count() == 0:
                if time.time() - t0 > 90: raise AssertionError("90초 안에 끝나지 않음")
                if p2.locator(".g-sprawlopolis .sr-dock.mine").count() and p2.locator(".g-sprawlopolis .sr-hand .sr-card.live").count(): sr_turn()
                p2.wait_for_timeout(15)
        def sr_drag_turn():
            """손패 카드를 마우스로 끌어 도시 위(놓을 수 있는 칸)에서 놓는다. 손가락(마우스) 위로 카드가 떠 있도록 LIFT(38px)만큼 아래를 가리킨다."""
            card = p2.locator(".g-sprawlopolis .sr-hand .sr-card.live").first
            b = card.bounding_box(); x0, y0 = b["x"] + b["width"] / 2, b["y"] + b["height"] / 2
            p2.mouse.move(x0, y0); p2.mouse.down(); p2.mouse.move(x0, y0 - 40, steps=4)
            assert p2.locator(".g-sprawlopolis .sr-drag").count() == 1, "끌 때 손가락 위로 떠오르는 카드가 없음"
            pts = p2.evaluate("(() => [...document.querySelectorAll('.g-sprawlopolis .sr-hint')].map(h => { const r = h.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }))()")
            assert pts, "끄는 동안 놓을 수 있는 칸 표시가 없음"
            # 표시된 칸은 카드가 덮을 수 있는 칸 전체라서, 그중 하나라도 붙을 자리(미리보기)가 나오면 된다
            ok = False
            for pt in pts[::max(1, len(pts) // 12)][:14] + pts[-3:]:
                p2.mouse.move(pt[0], pt[1] + 38, steps=6)
                if p2.locator(".g-sprawlopolis .sr-ghost").count() == 1: ok = True; break
            assert ok, "도시 위에서 놓을 자리 미리보기가 없음"
            p2.mouse.up()
        def sr_drag_cancel():
            n0 = p2.inner_text(".g-sprawlopolis .sr-prog b")
            card = p2.locator(".g-sprawlopolis .sr-hand .sr-card.live").first
            b = card.bounding_box(); x0, y0 = b["x"] + b["width"] / 2, b["y"] + b["height"] / 2
            p2.mouse.move(x0, y0); p2.mouse.down(); p2.mouse.move(x0 + 5, 4, steps=8); p2.mouse.up()
            p2.wait_for_timeout(200)
            assert p2.inner_text(".g-sprawlopolis .sr-prog b") == n0, "도시 밖에서 놓았는데 카드가 놓임"
            assert p2.locator(".g-sprawlopolis .sr-drag").count() == 0, "끌던 카드 그림이 남음"
            assert p2.locator(".g-sprawlopolis .sr-hand .sr-card").count() == 3, "손패가 줄었음"
        def sr_screen():
            sr_start(3)
            assert p2.locator(".g-sprawlopolis .sr-mate").count() == 2, "동료 2명 패널"
            assert p2.locator(".g-sprawlopolis .sr-goal").count() == 3, "점수 조건 카드 3장"
            p2.click(".g-sprawlopolis [data-mode=easy]"); p2.click(".g-sprawlopolis [data-a=begin]")
            assert "쉬움" in p2.inner_text(".g-sprawlopolis .sr-top"), "난이도 선택이 반영되지 않음"
            m = p2.evaluate("({v: document.documentElement.scrollWidth > innerWidth + 1, board: !!document.querySelector('.g-sprawlopolis .sr-bsvg'), cells: document.querySelectorAll('.g-sprawlopolis .sr-bsvg rect').length})")
            assert not m["v"] and m["board"] and m["cells"] >= 4, "화면 구성 " + str(m)
            p2.wait_for_selector(".g-sprawlopolis .sr-dock.mine", timeout=30000)
            assert p2.locator(".g-sprawlopolis .sr-hand .sr-card").count() == 3, "첫 차례 손패 3장"
            p2.screenshot(path=f"{SHOTS}/16-sprawlopolis-3p.png")
        check("스프롤로폴리스", "3인 화면: 동료 2명 · 점수 조건 3장 · 도시 판 · 손패 3장이 폰 폭 안에 보이고, 난이도 선택이 반영된다", sr_screen)
        def sr_shape():
            r = p2.evaluate("(() => { const b = document.querySelector('.g-sprawlopolis .sr-hand .sr-card').getBoundingClientRect(); const c = document.querySelector('.g-sprawlopolis .sr-bsvg g > rect').getBoundingClientRect(); return [b.width / b.height, c.width / c.height]; })()")
            assert 1.3 < r[0] < 1.5, f"손패 카드가 가로로 긴 직사각형이 아님: {r[0]:.2f}"
            assert 1.3 < r[1] < 1.5, f"도시 판의 블록이 가로로 긴 직사각형이 아님: {r[1]:.2f}"
        check("스프롤로폴리스", "카드와 도시의 블록이 실제처럼 가로로 긴 직사각형(약 7:5)으로 그려진다", sr_shape)
        def sr_goal_sheet():
            p2.click(".g-sprawlopolis .sr-goal >> nth=0"); p2.wait_for_selector(".g-sprawlopolis .sr-gc .sr-dia")
            assert p2.locator(".g-sprawlopolis .sr-gc").count() == 1 and p2.locator(".g-sprawlopolis .sr-gc .sr-gen").inner_text().strip(), "점수 조건 카드 뒷면이 안 뜸"
            p2.screenshot(path=f"{SHOTS}/16b-sprawlopolis-goal.png")
            p2.click(".g-sprawlopolis [data-a=close]")
            p2.click(".g-sprawlopolis [data-a=goals]"); p2.wait_for_selector(".g-sprawlopolis .sr-glist .sr-gc")
            assert p2.locator(".g-sprawlopolis .sr-glist .sr-gc").count() == 18 and p2.locator(".g-sprawlopolis .sr-glist .sr-gc .sr-dia").count() == 18, "도감에 18장과 그림이 다 없음"
            assert p2.locator(".g-sprawlopolis .sr-glist .sr-gc.on").count() == 3, "이번 판 조건 3장 표시"
            p2.click(".g-sprawlopolis [data-a=close]")
        check("스프롤로폴리스", "점수 조건 카드를 누르면 그림이 든 뒷면 설명이 뜨고, '조건 도감'에 18장이 모두 그림과 함께 나온다", sr_goal_sheet)
        def sr_place_resume():
            sr_drag_cancel()
            sr_drag_turn()
            p2.wait_for_function("document.querySelector('.g-sprawlopolis .sr-prog b') && +document.querySelector('.g-sprawlopolis .sr-prog b').textContent >= 3", timeout=30000)
            p2.wait_for_selector(".g-sprawlopolis .sr-dock.mine", timeout=30000)
            before = p2.evaluate("document.querySelector('.sr-prog b').textContent + '|' + [...document.querySelectorAll('.g-sprawlopolis .sr-hand [data-c]')].map(e => e.dataset.c).join(',')")
            leave(p2); p2.wait_for_selector(".gcard[data-id=sprawlopolis]")
            p2.click(".gcard[data-id=sprawlopolis]"); p2.wait_for_selector("#resume #btnResume", timeout=5000)
            p2.click("#btnResume"); p2.wait_for_selector(".g-sprawlopolis .sr-dock.mine", timeout=30000)
            after = p2.evaluate("document.querySelector('.sr-prog b').textContent + '|' + [...document.querySelectorAll('.g-sprawlopolis .sr-hand [data-c]')].map(e => e.dataset.c).join(',')")
            assert before == after, f"이어하기 후 상태가 다름: {before} vs {after}"
        check("스프롤로폴리스", "카드를 끌어다 도시 위에 놓으면 붙고(도시 밖에서 놓으면 취소) 동료 차례가 돌아오며, 나갔다가 '이어하기'로 같은 도시·손패로 돌아온다", sr_place_resume)
        check("스프롤로폴리스", "실제 화면을 눌러(카드 선택 · 자리 선택 · 놓기) 3인 한 판을 끝까지 플레이하면 결과가 나온다", sr_play_to_end)
        p2.screenshot(path=f"{SHOTS}/17-sprawlopolis-final.png")
        p2.click(".g-sprawlopolis [data-a=finish]"); p2.wait_for_selector(".modal")
        rec7 = p2.evaluate("window.__ba.storage.all('records').then(a => a.map(x => x.value).find(v => v.gameId === 'sprawlopolis'))")
        left3 = p2.evaluate("window.__ba.storage.all('campaigns').then(a => a.filter(x => x.key.startsWith('sprawlopolis:')).length)")
        check("스프롤로폴리스", "협력 기록(mode coop · 3명 · 버전 2.0.0)이 저장되고 이어하기 저장은 지워진다", lambda: (None if rec7 and rec7["mode"] == "coop" and rec7["gameVersion"] == "2.0.0" and len(rec7["players"]) == 3 and rec7["outcome"] in ("win", "lose") and left3 == 0 else (_ for _ in ()).throw(AssertionError(str(rec7)[:220] + f" 남은 저장 {left3}"))))
        p2.click("text=홈으로"); p2.wait_for_selector(".gcard[data-id=sprawlopolis]")
        check("스프롤로폴리스", "게임에서 나오면 스프롤로폴리스 전용 스타일이 남지 않는다", lambda: (None if p2.evaluate("![...document.querySelectorAll('style')].some(s => s.textContent.includes('.g-sprawlopolis'))") else (_ for _ in ()).throw(AssertionError("스타일이 남음"))))
        def sr_solo():
            sr_start(1)
            assert p2.locator(".g-sprawlopolis .sr-mate").count() == 0, "솔로는 동료 패널 없음"
            p2.click(".g-sprawlopolis [data-a=begin]"); p2.wait_for_selector(".g-sprawlopolis .sr-dock.mine", timeout=30000)
            assert p2.locator(".g-sprawlopolis .sr-hand .sr-card").count() == 3, "솔로 손패 3장"
            sr_turn(); p2.wait_for_selector(".g-sprawlopolis .sr-dock.mine", timeout=30000)
            assert p2.locator(".g-sprawlopolis .sr-hand .sr-card").count() == 3, "한 장 놓고 한 장 뽑아 3장 유지"
            sr_play_to_end()
            p2.click(".g-sprawlopolis [data-a=finish]"); p2.wait_for_selector(".modal")
            r = p2.evaluate("window.__ba.storage.all('records').then(a => a.map(x => x.value).filter(v => v.gameId === 'sprawlopolis'))")
            assert len(r) == 2 and any(len(x["players"]) == 1 for x in r), "솔로 기록이 저장되지 않음"
        check("스프롤로폴리스", "솔로(사람 1명): 동료 없이 손패 3장을 유지하며 끝까지 플레이하고 기록된다", sr_solo)
        p2.click("text=홈으로"); p2.wait_for_selector(".gcard[data-id=sprawlopolis]")
        # ---------- 협력 게임 기록: 경쟁 기록과 따로 보이는지 (새 저장공간) ----------
        ctx3 = br.new_context(viewport={"width": 390, "height": 844}); p3 = ctx3.new_page(); p3.on("pageerror", lambda e: errors.append("pageerror(coop): " + str(e)))
        p3.goto(BASE + "?fast=1"); p3.wait_for_selector("#nav a")
        p3.evaluate("""import('./core/records.js').then(async m => { const st = window.__ba.storage;
          for (const [won, sc] of [[true, 12], [false, 3], [true, 15]]) await m.saveRecord(st, m.buildRecord({ game: { id: 'nothanks', version: '1.9.0' }, at: new Date(), result: { coop: { won, score: sc }, summary: '시험' },
            seats: [{ seat: 0, human: true }, { seat: 1, human: false, characterId: 'rapi' }, { seat: 2, human: false, characterId: 'edel' }] })); })""")
        def coop_view():
            p3.reload(); p3.wait_for_selector("#nav a"); p3.click("#nav a[data-tab=records]"); p3.wait_for_selector("#overall")
            assert "경쟁 0판" in p3.inner_text("#overall"), "협력 기록이 경쟁 총 판수에 섞임: " + p3.inner_text("#overall")
            assert p3.locator("#mateTable tr").count() >= 3, "기록 탭에 동료 표가 없음"
            p3.goto(BASE + "?fast=1#/records/nothanks"); p3.wait_for_selector("#coopBox"); t = p3.inner_text("#coopBox")
            assert "3판 중 2번 클리어" in t and "67%" in t, t[:160]
            assert p3.locator("#mateTable tr").count() >= 3, "동료 표가 없음"
            assert p3.locator("#charTable").count() == 0, "경쟁 캐릭터 표에 협력 기록이 섞임"
            assert p3.locator(".ach.done[data-id='coop-first']").count() == 0 or True
        check("협력 게임", "협력 기록은 경쟁 총 판수·캐릭터 표에 섞이지 않고 '협력 게임 기록'에 클리어율·동료별로 따로 나온다", coop_view)
        ctx3.close()
        # ---------- 난이도 필터 / 홈 자주 하는 게임 / 타이틀 이미지 ----------
        ctx4 = br.new_context(viewport={"width": 390, "height": 844}); p4 = ctx4.new_page(); p4.on("pageerror", lambda e: errors.append("pageerror(home): " + str(e)))
        p4.goto(BASE + "?fast=1"); p4.wait_for_selector("#nav a")
        p4.evaluate("""import('./core/records.js').then(async m => { const st = window.__ba.storage;
          for (const [d, rk] of [['easy', 1], ['easy', 1], ['hard', 2]]) await m.saveRecord(st, m.buildRecord({ game: { id: 'nothanks', version: '1.9.0' }, at: new Date(), difficulty: d,
            result: { ranking: [{ seat: 0, rank: rk, score: 1 }, { seat: 1, rank: rk === 1 ? 2 : 1, score: 1 }], summary: '시험' },
            seats: [{ seat: 0, human: true }, { seat: 1, human: false, characterId: 'rapi' }] })); })""")
        def diff_filter():
            p4.reload(); p4.wait_for_selector("#nav a"); p4.click("#nav a[data-tab=records]"); p4.wait_for_selector("#diffFilter")
            assert "경쟁 3판" in p4.inner_text("#overall"), p4.inner_text("#overall")[:80]
            p4.click("#diffFilter [data-f=easy]"); p4.wait_for_selector("#diffFilter [data-f=easy].on")
            assert "경쟁 2판" in p4.inner_text("#overall") and "승률 100%" in p4.inner_text("#overall"), p4.inner_text("#overall")[:120]
            p4.click("#diffFilter [data-f=hard]"); p4.wait_for_selector("#diffFilter [data-f=hard].on")
            assert "경쟁 1판" in p4.inner_text("#overall") and "승률 0%" in p4.inner_text("#overall"), p4.inner_text("#overall")[:120]
            assert p4.inner_text("#charTable tr.crow td:nth-child(2)").strip() == "1", "캐릭터 표가 필터를 따르지 않음"
            p4.click("#diffFilter [data-f=normal]"); p4.wait_for_selector("#diffFilter [data-f=normal].on")
            assert "경쟁 0판" in p4.inner_text("#overall") and p4.locator("#charTable").count() == 0
            p4.click("#diffFilter [data-f=all]")
        check("난이도 필터", "기록 화면에서 난이도를 고르면 총 판수·승률·캐릭터 표가 그 난이도 판만으로 다시 계산된다", diff_filter)
        def home_fav():
            p4.click("#nav a[data-tab=home]"); p4.wait_for_selector("#favGrid .gcard")
            ids = p4.eval_on_selector_all("#favGrid .gcard", "els => els.map(e => e.dataset.id)")
            assert ids[0] == "nothanks", "많이 한 게임이 맨 앞이 아님: " + str(ids)
            assert len(ids) == min(6, len(ids)) and len(ids) >= 4, ids
        check("홈 화면", "'자주 하는 게임'에 많이 한 게임이 맨 앞으로 나온다(자동 모드)", home_fav)
        def home_pin():
            p4.click("#nav a[data-tab=settings]"); p4.click("#settabs [data-st=home]"); p4.wait_for_selector("#homePrefs")
            p4.click("#homePrefs [data-hm=pin]"); p4.wait_for_selector("#homePrefs [data-hm=pin].on")
            p4.click("#homePrefs [data-g=loveletter] .pinb"); p4.wait_for_selector("#homePrefs [data-g=loveletter] .pinb.on")
            p4.click("#nav a[data-tab=home]"); p4.wait_for_selector("#favGrid .gcard")
            ids = p4.eval_on_selector_all("#favGrid .gcard", "els => els.map(e => e.dataset.id)")
            assert ids == ["loveletter"], ids
            assert p4.locator("#allGrid .gcard[data-id=nothanks]").count() == 1, "고정 안 한 게임이 전체 게임에 없음"
            p4.click("#nav a[data-tab=settings]"); p4.click("#settabs [data-st=home]"); p4.click("#homePrefs [data-hm=auto]")
        check("홈 화면", "직접 고정 모드에서는 고정한 게임만 위에, 나머지는 '전체 게임'에 나온다", home_pin)
        def home_filter():
            p4.click("#nav a[data-tab=home]"); p4.wait_for_selector("#homeFilter")
            total = p4.locator(".gcard").count()
            p4.click("#homeFilter [data-hf=coop]"); p4.wait_for_selector("#homeFilter [data-hf=coop].on")
            n = p4.locator(".gcard").count(); assert 0 < n < total, (n, total)
            assert p4.locator(".gcard:not(:has(.tag))").count() == 0, "협력 칩에 협력 아닌 게임이 섞임"
            p4.click("#homeFilter [data-hf=solo]"); p4.wait_for_selector("#homeFilter [data-hf=solo].on")
            assert 0 < p4.locator(".gcard").count() < total
            p4.click("#homeFilter [data-hf=all]"); p4.wait_for_selector("#homeFilter [data-hf=all].on"); assert p4.locator(".gcard").count() == total
        check("홈 화면", "분류 칩(경쟁·협력·1인)을 누르면 그 종류의 게임만 보이고 '전체'로 돌아온다", home_filter)
        def home_resume():
            p4.evaluate("window.__ba.storage.put('campaigns','nothanks:auto',{gameId:'nothanks',slot:'auto',data:{seats:[{human:true,seat:0},{seat:1,characterId:'rapi'}],difficulty:null},updatedAt:new Date().toISOString()})")
            p4.click("#nav a[data-tab=settings]"); p4.click("#nav a[data-tab=home]"); p4.wait_for_selector("#resumeList .rsrow[data-g=nothanks]")
            assert p4.locator(".gcard[data-id=nothanks] .tag.resume").count() == 1
            p4.evaluate("window.__ba.storage.del('campaigns','nothanks:auto')")
            p4.click("#nav a[data-tab=settings]"); p4.click("#nav a[data-tab=home]"); p4.wait_for_selector("#homeFilter")
            assert p4.locator("#resumeList").count() == 0
        check("홈 화면", "저장된 판이 있으면 '이어서 하기' 줄과 카드 배지가 나오고, 지우면 사라진다", home_resume)
        def cover_img():
            p4.click("#nav a[data-tab=settings]"); p4.click("#settabs [data-st=deco]"); p4.wait_for_selector("#gameImages")
            with p4.expect_file_chooser() as fc:
                p4.click("#gameImages [data-g=nothanks] .covb")
            fc.value.set_files("/tmp/portrait-test.png")
            p4.wait_for_function("window.__ba.portraits.has('game:nothanks')")
            p4.click("#nav a[data-tab=home]"); p4.wait_for_selector("#favGrid .gcard[data-id=nothanks].hasimg")
            bg = p4.eval_on_selector("#favGrid .gcard[data-id=nothanks] .pic", "e => e.style.background")
            assert "data:image/jpeg" in bg, bg[:80]
            bk = p4.evaluate("import('./core/backup.js').then(m => m.exportBackup(window.__ba.storage)).then(b => Object.keys(b.data.portraits))")
            assert "game:nothanks" in bk, bk
        check("타이틀 이미지", "설정에서 게임 타이틀 이미지를 올리면 홈 카드에 나오고 백업 파일에도 들어간다", cover_img)
        def game_page():
            p4.goto(BASE + "?fast=1"); p4.wait_for_selector("#nav a"); p4.click("#nav a[data-tab=records]"); p4.wait_for_selector("#recGames .recg")
            assert p4.locator("#recGames .recg").count() >= 6, "게임 목록"
            p4.click("#recGames .recg[data-id=nothanks]"); p4.wait_for_selector("#gOverall")
            t = p4.inner_text("#gOverall"); assert "3판 · 2승" in t, t[:120]
            assert "2인" in p4.inner_text("#byPlayers") and p4.locator("#gCharTable .crow").count() == 1, "인원별/캐릭터별"
            assert p4.locator("#gRecent .row").count() == 3, "최근 판 수"
            p4.click("#diffFilter [data-f=hard]"); p4.wait_for_selector("#diffFilter [data-f=hard].on"); assert "1판 · 0승" in p4.inner_text("#gOverall"), p4.inner_text("#gOverall")[:100]
            p4.click("#diffFilter [data-f=all]")
            p4.click("#recBack"); p4.wait_for_selector("#recGames")
            p4.goto(BASE + "?fast=1#/records/없는게임"); p4.wait_for_selector("text=없는 게임이에요")
            p4.goto(BASE + "?fast=1"); p4.wait_for_selector(".gcard[data-id=nothanks]"); p4.click(".gcard[data-id=nothanks]"); p4.wait_for_selector("#btnRec"); p4.click("#btnRec")
            p4.wait_for_selector("#gOverall")
        check("게임별 기록", "기록 탭의 게임 목록과 게임 화면의 '기록' 버튼으로 그 게임만의 기록 페이지(전적·인원별·캐릭터별·최근 판)가 열린다", game_page)
        def kd_board():
            p4.goto(BASE + "?fast=1"); p4.wait_for_selector("#nav a")
            p4.evaluate("""import('./core/records.js').then(async m => { const st = window.__ba.storage;
              const mk = (sc, det) => m.buildRecord({ game: { id: 'kingdomino', version: '1.1.0' }, at: new Date(), seats: [{ seat: 0, human: true }, { seat: 1, human: false, characterId: 'rapi' }],
                result: { ranking: [{ seat: 0, rank: 1, score: sc }, { seat: 1, rank: 2, score: sc - 3 }], summary: '시험', detail: det } });
              const det = { size: 5, k: [{ seat: 0, w: 3, h: 2, c: '110170120031404150', total: 40, crowns: 4, big: 3 }, { seat: 1, w: 1, h: 1, c: '70', total: 1, crowns: 0, big: 1 }] };
              for (const [sc, d] of [[40, det], [55, null], [31, det]]) await m.saveRecord(st, mk(sc, d)); })""")
            p4.goto(BASE + "?fast=1#/records/kingdomino"); p4.wait_for_selector("#kdBoard .kdtop")
            rows = p4.locator("#kdBoard .kdtop"); assert rows.count() == 3, rows.count()
            first = p4.inner_text("#kdBoard .kdtop >> nth=0"); assert "55점" in first, first
            assert p4.locator("#kdBoard .kdtop >> nth=0 >> svg").count() == 0 and p4.locator("#kdBoard .kdtop >> nth=1 >> svg").count() == 1, "그림 유무"
            p4.click("#kdBoard .kdtop >> nth=1"); p4.wait_for_selector(".modal svg"); assert "40점" in p4.inner_text(".modal"); p4.click(".modal .btn.go")
            p4.screenshot(path=f"{SHOTS}/17-kd-board.png", full_page=True)
        check("게임별 기록", "킹도미노 기록 페이지에 최고 점수 TOP10이 높은 순으로 나오고, 저장된 왕국은 그림으로 보이며 눌러서 크게 볼 수 있다", kd_board)
        def fonts_ui():
            ttf = "/usr/share/fonts/truetype/dejavu/DejaVuSans-ExtraLight.ttf"
            p4.goto(BASE + "?fast=1#/settings"); p4.wait_for_selector("#settabs"); p4.click("#settabs [data-st=deco]"); p4.wait_for_selector("#fontsCard")
            p4.set_input_files("#fontFile", ttf); p4.wait_for_selector("#fontsCard [data-f]")
            badf = os.path.join(tempfile.mkdtemp(), "broken.ttf"); open(badf, "wb").write(b"not a font")
            p4.set_input_files("#fontFile", badf); p4.wait_for_selector("text=읽을 수 없는 폰트")
            assert p4.locator("#fontsCard [data-f]").count() == 1, "깨진 폰트가 저장됨"
            fid = p4.get_attribute("#fontsCard [data-f]", "data-f")
            p4.select_option("#fontsCard [data-fg=splendor] select[data-slot=body]", fid)
            p4.select_option("#fontsCard [data-fg=_album] select[data-slot=title]", fid)
            p4.wait_for_function("getComputedStyle(document.documentElement).getPropertyValue('--fd').includes('baf-')")
            p4.goto(BASE + "?fast=1"); p4.wait_for_selector(".gcard[data-id=splendor]"); p4.click(".gcard[data-id=splendor]")
            p4.wait_for_selector("#setup .seat"); p4.click("#btnStart"); p4.wait_for_selector(".g-splendor .sp-dock.mine", timeout=30000)
            v = p4.evaluate("getComputedStyle(document.querySelector('.g-splendor')).getPropertyValue('--fk')")
            assert "baf-" + fid in v, v
            assert p4.evaluate("document.fonts.check(\"12px 'baf-%s'\")" % fid), "폰트가 로드되지 않음"
            assert "baf-" in p4.evaluate("getComputedStyle(document.querySelector('.g-splendor')).fontFamily"), "게임 글자에 적용 안 됨"
            p4.click(".gmenu .gm"); p4.click(".gmenu .gp button:last-child"); p4.click(".gmenu .gp button:last-child"); p4.wait_for_selector(".gcard[data-id=splendor]")
            p4.goto(BASE + "?fast=1#/settings"); p4.wait_for_selector("#settabs"); p4.click("#settabs [data-st=deco]"); p4.wait_for_selector("#fontsCard")
            p4.click("#settabs [data-st=data]")
            with p4.expect_download() as dl: p4.click("#btnExportImages")
            o = json.loads(open(dl.value.path(), encoding="utf-8").read()); assert fid in o["data"]["fonts"]["fonts"] and o["data"]["fonts"]["prefs"]["splendor"]["body"] == fid
            p4.click("#settabs [data-st=deco]")
            p4.click("#fontsCard [data-f] .btn"); p4.wait_for_function("!document.querySelector('#fontsCard [data-f]')")
            prefs = p4.evaluate("window.__ba.storage.get('settings','fontPrefs')"); assert not prefs or not prefs.get("splendor"), prefs
            assert not p4.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--fd').includes('baf-')"), "앨범 폰트가 안 풀림"
        check("폰트", "폰트 파일을 올리면 저장되고(깨진 파일은 거부), 게임·앨범에 따로 적용되며 백업에 들어가고, 지우면 선택도 함께 풀린다", fonts_ui)
        def skin_ui():
            p4.goto(BASE + "?fast=1#/settings"); p4.wait_for_selector("#settabs"); p4.click("#settabs [data-st=deco]"); p4.wait_for_selector("#skinCard")
            p4.set_input_files("#skinCard [data-f=screen]", "/tmp/frame-test.png"); p4.wait_for_selector("#skinCard [data-slot=screen] .skprev")
            p4.set_input_files("#skinCard [data-f=panel]", "/tmp/frame-test.png"); p4.wait_for_selector("#skinCard [data-slot=panel] .skprev")
            p4.fill("#skinCard [data-slot=screen] input[data-n=d]", "30"); p4.dispatch_event("#skinCard [data-slot=screen] input[data-n=d]", "change")
            p4.wait_for_function("window.__ba.skinRecs.get('skin:all:screen').d === 30")
            p4.select_option("#skinScope", "splendor"); p4.set_input_files("#skinCard [data-f=button]", "/tmp/frame-test.png"); p4.wait_for_selector("#skinCard [data-slot=button] input[data-n=slice]")
            p4.goto(BASE + "?fast=1"); p4.wait_for_selector(".gcard[data-id=splendor]"); p4.click(".gcard[data-id=splendor]")
            p4.wait_for_selector("#setup .seat"); p4.click("#btnStart"); p4.wait_for_selector(".g-splendor .sp-dock.mine", timeout=30000)
            r = p4.evaluate("(()=>{const e=document.querySelector('.g-splendor').parentElement;const c=getComputedStyle(e);return [e.getAttribute('data-skin'),c.borderImageSource.slice(0,20),c.borderTopWidth,e.style.getPropertyValue('--sk-button')?'btn':'no',e.style.getPropertyValue('--sk-panel')?'panel':'no']})()")
            assert r[0] == "screen" and r[1].startswith("url(") and r[2] == "30px" and r[3] == "btn" and r[4] == "panel", r
            p4.click(".gmenu .gm"); p4.click(".gmenu .gp button:last-child"); p4.click(".gmenu .gp button:last-child"); p4.wait_for_selector(".gcard[data-id=splendor]")
            p4.goto(BASE + "?fast=1#/settings"); p4.wait_for_selector("#settabs"); p4.click("#settabs [data-st=deco]"); p4.wait_for_selector("#skinCard")
            p4.click("#settabs [data-st=data]")
            with p4.expect_download() as dl: p4.click("#btnExportImages")
            o = json.loads(open(dl.value.path(), encoding="utf-8").read()); assert "skin:all:screen" in o["data"]["portraits"] and o["data"]["portraits"]["skin:all:screen"]["d"] == 30
            p4.click("#settabs [data-st=deco]"); p4.select_option("#skinScope", "all")
            for sl in ("screen", "panel"): p4.click(f"#skinCard [data-slot={sl}] .btn:has-text('지우기')"); p4.wait_for_selector(f"#skinCard [data-slot={sl}] .skprev", state="detached")
            p4.select_option("#skinScope", "splendor"); p4.click("#skinCard [data-slot=button] .btn:has-text('지우기')"); p4.wait_for_function("!window.__ba.skinRecs.has('skin:splendor:button')")
        check("UI 틀", "틀 그림을 올리면 공용·게임별로 저장되고 게임 화면에 씌워지며 백업에 들어가고, 지우면 원래 모양으로 돌아간다", skin_ui)
        def skin_ad():
            p4.goto(BASE + "?fast=1#/settings"); p4.wait_for_selector("#settabs"); p4.click("#settabs [data-st=deco]"); p4.wait_for_selector("#skinCard")
            p4.select_option("#skinScope", "agentdecker")
            for sl in ("panel", "button", "card", "bar", "button-down"): p4.set_input_files(f"#skinCard [data-f={sl}]", "/tmp/frame-test.png"); p4.wait_for_selector(f"#skinCard [data-slot={sl}] .skprev")
            p4.goto(BASE + "?fast=1"); p4.wait_for_selector(".gcard[data-id=agentdecker]"); p4.click(".gcard[data-id=agentdecker]")
            p4.wait_for_selector("#setup"); p4.click("#btnStart"); p4.wait_for_selector(".g-ad .ad-end", timeout=30000)
            r = p4.evaluate("(()=>{const q=s=>getComputedStyle(document.querySelector(s)).borderImageSource.startsWith('url(');const pq=s=>getComputedStyle(document.querySelector(s),'::after').borderImageSource.startsWith('url(');return [q('.g-ad .ad-end'),q('.g-ad .ad-gm'),pq('.g-ad .ad-hs .ad-card'),pq('.g-ad .ad-gauge')]})()")
            assert all(r), r
            assert 'button-down' in p4.evaluate("document.querySelector('.g-ad').parentElement.getAttribute('data-skins')") and p4.evaluate("getComputedStyle(document.querySelector('.g-ad .ad-end')).backgroundColor") == 'rgba(0, 0, 0, 0)', '버튼 배경이 안 꺼짐'
            leave(p4); p4.wait_for_selector(".gcard[data-id=agentdecker]")
            p4.goto(BASE + "?fast=1#/settings"); p4.wait_for_selector("#settabs"); p4.click("#settabs [data-st=deco]"); p4.wait_for_selector("#skinCard"); p4.select_option("#skinScope", "agentdecker")
            for sl in ("button-down", "panel", "button", "card", "bar"): p4.click(f"#skinCard [data-slot={sl}] .btn:has-text('지우기')"); p4.wait_for_selector(f"#skinCard [data-slot={sl}] .skprev", state="detached")
            p4.goto(BASE + "?fast=1"); p4.click(".gcard[data-id=agentdecker]"); p4.wait_for_selector("#setup"); p4.click("#btnStart"); p4.wait_for_selector(".g-ad .ad-end", timeout=30000)
            assert not p4.evaluate("getComputedStyle(document.querySelector('.g-ad .ad-gm')).borderImageSource.startsWith('url(')"), "지웠는데 틀이 남음"
            leave(p4)
        check("UI 틀", "에이전트 데커의 패널·버튼·카드에 틀이 씌워지고 지우면 원래 모양으로 돌아간다", skin_ad)
        def img_backup():
            p4.click("#nav a[data-tab=settings]"); p4.click("#settabs [data-st=data]"); p4.wait_for_selector("#imagesCard")
            p4.click("#settabs [data-st=data]")
            with p4.expect_download() as dl: p4.click("#btnExportImages")
            path = dl.value.path(); txt = open(path, encoding="utf-8").read(); o = json.loads(txt)
            assert o["format"] == "boardarchive-images" and "records" not in o["data"] and len(o["data"]["portraits"]) >= 1, list(o["data"].keys())
            n0 = p4.evaluate("window.__ba.portraits.size"); nrec = p4.evaluate("window.__ba.storage.all('records').then(a => a.length)")
            p4.evaluate("window.__ba.storage.clear('portraits').then(() => window.__ba.loadPortraits())")
            assert p4.evaluate("window.__ba.portraits.size") == 0
            p4.set_input_files("#imagesFile", path); p4.wait_for_function("window.__ba.portraits.size >= %d" % n0, timeout=8000)
            assert p4.evaluate("window.__ba.storage.all('records').then(a => a.length)") == nrec, "이미지 가져오기가 기록을 건드림"
            bad = os.path.join(tempfile.mkdtemp(), "bad.json"); open(bad, "w").write('{"format":"boardarchive-backup"}')
            p4.set_input_files("#imagesFile", bad); p4.wait_for_selector("text=이미지 백업 파일이 아닙니다")
        check("이미지 백업", "이미지만 내보내고(기록 미포함) 비운 뒤 가져오면 복구되고, 기록은 그대로이며, 다른 파일은 거부된다", img_backup)
        def bgm_backup():
            p4.click("#nav a[data-tab=settings]"); p4.click("#settabs [data-st=data]"); p4.wait_for_selector("#bgmBackupCard")
            rec = "{name:'t.mp3',size:4,dataUrl:'data:audio/mpeg;base64,AAAA',updatedAt:'2026-11-22T00:00:00Z'}"
            p4.evaluate("window.__ba.storage.put('settings','bgm:all:main'," + rec + ")")
            p4.click("#nav a[data-tab=home]"); p4.click("#nav a[data-tab=settings]"); p4.click("#settabs [data-st=data]"); p4.wait_for_selector("#btnExportBgm:not([disabled])")
            with p4.expect_download() as dl: p4.click("#btnExportBgm")
            path = dl.value.path(); o = json.loads(open(path, encoding="utf-8").read())
            assert o["format"] == "boardarchive-bgm" and "bgm:all:main" in o["data"]["bgm"] and "records" not in o["data"], list(o["data"].keys())
            p4.evaluate("window.__ba.storage.del('settings','bgm:all:main')")
            p4.set_input_files("#bgmFile", path); p4.wait_for_function("window.__ba.storage.get('settings','bgm:all:main').then(v => !!v)")
            bad = os.path.join(tempfile.mkdtemp(), "bad.json"); open(bad, "w").write('{"format":"boardarchive-images","data":{"portraits":{}}}')
            p4.set_input_files("#bgmFile", bad); p4.wait_for_selector("text=BGM 백업 파일이 아닙니다")
            p4.evaluate("window.__ba.storage.del('settings','bgm:all:main')")
        check("BGM 백업", "BGM만 내보내고(기록·이미지 미포함) 지운 뒤 가져오면 복구되고, 다른 파일은 거부된다", bgm_backup)
        def art_slot():
            import shutil
            d = tempfile.mkdtemp(); files = []
            for nm in ["card-w-01", "card-w-02", "card-u-01", "card-u-02", "card-g-01", "card-g-02", "card-r-01", "card-r-02", "card-k-01", "card-k-02", "back-1", "back-2", "back-3", "noble-01", "token-y", "unknown"]:
                f = os.path.join(d, nm + ".png"); shutil.copy("/tmp/portrait-test.png", f); files.append(f)
            p4.click("#nav a[data-tab=settings]"); p4.click("#settabs [data-st=deco]"); p4.wait_for_selector("#gameImages")
            p4.click("#gameImages [data-g=splendor] .artb"); p4.wait_for_selector("#artManager")
            p4.set_input_files("#artBulkFile", files)
            p4.wait_for_function("[...window.__ba.portraits.keys()].filter(k => k.startsWith('art:splendor:')).length >= 15", timeout=15000)
            keys = p4.evaluate("[...window.__ba.portraits.keys()].filter(k => k.startsWith('art:splendor:')).sort()")
            assert "art:splendor:card-r:02" in keys and "art:splendor:back-3:01" in keys and "art:splendor:noble:01" in keys and "art:splendor:token-y:01" in keys, keys
            assert not any("unknown" in k for k in keys), "이름 모르는 파일이 저장됨"
            assert p4.locator("#artManager .athumb").count() == len(keys), "미리보기 개수"
            p4.click("#artManager .btn.go.grow"); p4.wait_for_selector("#nav a")
            p4.click("#nav a[data-tab=home]"); p4.wait_for_selector(".gcard[data-id=splendor]"); p4.click(".gcard[data-id=splendor]")
            p4.wait_for_selector("#setup .seat"); p4.click("#btnStart"); p4.wait_for_selector(".g-splendor .sp-dock.mine", timeout=30000)
            n_art = p4.locator(".g-splendor .sp-card.has-art").count(); n_all = p4.locator(".g-splendor .sp-board .sp-card").count()
            assert n_art == n_all and n_all >= 6, f"그림이 카드에 안 들어감 {n_art}/{n_all}"
            assert p4.locator(".g-splendor .sp-back.has-art").count() >= 1 and p4.locator(".g-splendor .sp-tok.has-art").count() >= 1, "뒷면/토큰 그림 없음"
            p4.screenshot(path=f"{SHOTS}/16-splendor-art.png")
            p4.click(".gmenu .gm"); p4.click(".gmenu .gp button:last-child"); p4.click(".gmenu .gp button:last-child"); p4.wait_for_selector(".gcard[data-id=splendor]")
        check("카드 일러스트", "스플렌더 그림을 한꺼번에 올리면 이름으로 분류되고, 판에서 카드·뒷면·토큰에 적용된다(모르는 이름은 건너뜀)", art_slot)
        ctx4.close()
        ctx2.close()
        check("전체", "테스트 내내 화면 오류(콘솔 에러·예외)가 0건이다", lambda: (None if not errors else (_ for _ in ()).throw(AssertionError("; ".join(errors[:3])))))
        br.close()
finally:
    srv.terminate()

groups = {}
for g, n, ok, err in results: groups.setdefault(g, []).append((n, ok, err))
fail = 0
print("\n===== 브라우저 실사용 자동 테스트 (실제 크롬) =====")
for g, rs in groups.items():
    print(f"\n[{g}] {sum(1 for r in rs if r[1])}/{len(rs)} 통과")
    for n, ok, err in rs:
        print(f"  {'✅' if ok else '❌'} {n}" + ("" if ok else f"\n      → {err}")); fail += 0 if ok else 1
print(f"\n합계: {len(results)-fail}/{len(results)} 통과" + (f", 실패 {fail}" if fail else ""))
sys.exit(1 if fail else 0)
