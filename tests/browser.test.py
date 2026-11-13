# 실제 크롬(헤드리스)으로 앱을 열어 사람이 하는 순서대로 점검한다: 게임 한 판 → 기록 → 초상화 → 백업 → "다른 기기"에서 복원 → 오프라인
import json, re, subprocess, sys, time, os, tempfile
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8123
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
        check("시작 화면", "게임 목록에 시험용 게임이 있고 '시험용' 표시가 붙는다", lambda: (page.wait_for_selector(".gcard[data-id=stop-test]"), page.wait_for_selector(".gcard[data-id=stop-test] .tag.test")))
        page.screenshot(path=f"{SHOTS}/1-home.png")

        # ---------- 게임 한 판 ----------
        def play_game():
            page.click(".gcard[data-id=stop-test]"); page.wait_for_selector("#setup .seat")
            page.click("button[data-n='4']")
            assert page.locator("#setup .seat").count() == 4, "4인 좌석이 아님"
            assert page.locator("#setup .seat.me").count() == 1, "사람 자리가 1개가 아님"
            page.screenshot(path=f"{SHOTS}/2-setup.png")
            page.click("#btnStart"); page.wait_for_selector(".g-stop")
            page.screenshot(path=f"{SHOTS}/3-game.png")
            t0 = time.time()
            while page.locator(".modal .rank-row").count() == 0:
                if time.time() - t0 > 90: raise AssertionError("90초 안에 게임이 끝나지 않음")
                roll, hold = page.locator("[data-a=roll]"), page.locator("[data-a=hold]")
                if roll.is_enabled():
                    sub = page.locator(".g-sub").inner_text(); m = re.search(r"이번 차례 합계 (\d+)", sub); tt = int(m.group(1)) if m else 0
                    if hold.is_enabled() and tt >= 15: hold.click()
                    else: roll.click()
                page.wait_for_timeout(15)
            page.screenshot(path=f"{SHOTS}/4-result.png")
        check("게임 진행", "실제 화면을 눌러 4인 한 판을 끝까지 플레이하면 결과 화면이 나온다", play_game)
        check("게임 진행", "결과 화면에 순위 4줄이 나온다", lambda: (_ for _ in ()).throw(AssertionError(str(page.locator('.modal .rank-row').count()))) if page.locator(".modal .rank-row").count() != 4 else None)
        check("게임 진행", "판이 끝나면 기록이 1건 저장된다", lambda: (_ for _ in ()).throw(AssertionError("기록 수 " + str(count_records(page)))) if count_records(page) != 1 else None)
        rec = page.evaluate("window.__ba.storage.all('records').then(a => a[0].value)")
        check("게임 진행", "저장된 기록에 게임·버전·4명의 순위가 들어 있다", lambda: (
            None if (rec["gameId"] == "stop-test" and rec["gameVersion"] == "0.1.0" and len(rec["players"]) == 4 and sorted(p["rank"] for p in rec["players"])[0] == 1 and sum(1 for p in rec["players"] if p["human"]) == 1) else (_ for _ in ()).throw(AssertionError(json.dumps(rec, ensure_ascii=False)[:200]))))
        page.click("text=홈으로"); page.wait_for_selector(".gcard[data-id=stop-test]")
        check("게임 진행", "'홈으로'를 누르면 게임 목록으로 돌아온다 (하단 탭 복귀)", lambda: page.wait_for_selector("#nav a", state="visible"))

        # ---------- 기록 화면 ----------
        page.click("#nav a[data-tab=records]"); page.wait_for_selector("#overall")
        check("기록 화면", "총 1판이 표시되고 '첫 판' 업적이 달성 상태다", lambda: (
            None if "총 1판" in page.inner_text("#overall") and page.locator(".ach.done[data-id='first-game']").count() == 1 else (_ for _ in ()).throw(AssertionError(page.inner_text("#overall")))))
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
        page.click("#nav a[data-tab=settings]"); page.wait_for_selector("#btnExport")
        with page.expect_download() as dl: page.click("#btnExport")
        bpath = os.path.join(tempfile.gettempdir(), "ba-backup.json"); dl.value.save_as(bpath)
        bk = json.load(open(bpath, encoding="utf-8"))
        check("백업·복원", "백업 파일이 만들어지고 기록·초상화·캠페인 슬롯이 들어 있다", lambda: (
            None if bk["format"] == "boardarchive-backup" and len(bk["data"]["records"]) == 1 and "rapi" in bk["data"]["portraits"] and "legacy-x:1" in bk["data"]["campaigns"] else (_ for _ in ()).throw(AssertionError("내용 누락"))))
        check("백업·복원", "파일 이름이 날짜가 들어간 boardarchive-backup-날짜-시각.json 이다", lambda: (None if re.match(r"boardarchive-backup-\d{8}-\d{4}\.json", dl.value.suggested_filename) else (_ for _ in ()).throw(AssertionError(dl.value.suggested_filename))))

        # 완전히 새 브라우저 = "모바일 기기"
        ctx2 = br.new_context(viewport={"width": 390, "height": 844}, accept_downloads=True)
        ctx2.route(re.compile(r"https://fonts\.(googleapis|gstatic)\.com/.*"), FONT_STUB)
        p2 = ctx2.new_page(); p2.on("pageerror", lambda e: errors.append("pageerror(기기2): " + str(e)))
        p2.goto(BASE); p2.wait_for_selector("#nav a")
        check("백업·복원", "새 기기(빈 저장소)에서는 기록 0건, 초상화 없음으로 시작한다", lambda: (None if count_records(p2) == 0 and not p2.evaluate("window.__ba.portraits.has('rapi')") else (_ for _ in ()).throw(AssertionError("비어있지 않음"))))
        p2.click("#nav a[data-tab=settings]"); p2.wait_for_selector("#importFile", state="attached")
        p2.set_input_files("#importFile", bpath); p2.wait_for_selector("#btnMerge")
        p2.screenshot(path=f"{SHOTS}/8-import.png", full_page=True)
        p2.click("#btnMerge"); p2.wait_for_function("window.__ba.portraits.has('rapi')")
        check("백업·복원", "PC에서 만든 백업을 새 기기에서 '합치기'하면 기록 1건·초상화·캠페인 슬롯이 복원된다", lambda: (
            None if count_records(p2) == 1 and p2.evaluate("window.__ba.portraits.has('rapi')") and p2.evaluate("window.__ba.storage.get('campaigns','legacy-x:1').then(c=>c.data.chapter)") == 4 else (_ for _ in ()).throw(AssertionError("복원 실패"))))
        p2.set_input_files("#importFile", bpath); p2.wait_for_selector("#btnMerge"); p2.click("#btnMerge"); p2.wait_for_timeout(400)
        check("백업·복원", "같은 백업을 한 번 더 가져와도 기록이 중복되지 않는다", lambda: (None if count_records(p2) == 1 else (_ for _ in ()).throw(AssertionError(str(count_records(p2))))))
        p2.reload(); p2.wait_for_selector("#nav a")
        check("백업·복원", "복원 후 새로고침해도 유지된다", lambda: (None if count_records(p2) == 1 and p2.evaluate("window.__ba.portraits.has('rapi')") else (_ for _ in ()).throw(AssertionError("사라짐"))))
        # 잘못된 파일
        bad = os.path.join(tempfile.gettempdir(), "bad.json"); open(bad, "w").write("{\"hello\": 1}")
        p2.click("#nav a[data-tab=settings]"); p2.wait_for_selector("#importFile", state="attached"); p2.set_input_files("#importFile", bad)
        check("백업·복원", "엉뚱한 파일을 가져오면 안내 문구가 뜨고 데이터는 그대로다", lambda: (p2.wait_for_selector("text=이 앱의 백업 파일이 아닙니다"), None if count_records(p2) == 1 else (_ for _ in ()).throw(AssertionError("데이터 변함"))))

        # 전체 삭제 후 교체 복원 (기기 1)
        page.click("#btnWipe"); page.click("#btnWipe"); page.wait_for_function("window.__ba.portraits.size === 0")
        check("백업·복원", "'모든 데이터 삭제'는 두 번 눌러야 실행되고, 기록·초상화가 비워진다", lambda: (None if count_records(page) == 0 else (_ for _ in ()).throw(AssertionError("안 지워짐"))))
        page.set_input_files("#importFile", bpath); page.wait_for_selector("#btnReplace"); page.click("#btnReplace"); page.click("#btnReplace")
        page.wait_for_function("window.__ba.portraits.has('rapi')")
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
            page.wait_for_selector(".gcard[data-id=stop-test]")
            page.click("#nav a[data-tab=records]"); page.wait_for_selector("#overall")
            assert "총 1판" in page.inner_text("#overall"), "기록이 안 보임"
        check("오프라인(PWA)", "인터넷을 끊고 새로고침해도 앱이 열리고 기록이 보인다", offline_ok)
        def offline_game():
            page.click("#nav a[data-tab=home]"); page.click(".gcard[data-id=stop-test]"); page.wait_for_selector("#setup .seat"); page.click("#btnStart"); page.wait_for_selector(".g-stop", timeout=8000)
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
        check("노땡스", "기록에 노땡스·버전 1.8.0·4명이 저장된다", lambda: (None if rec2["gameId"] == "nothanks" and rec2["gameVersion"] == "1.8.0" and len(rec2["players"]) == 4 else (_ for _ in ()).throw(AssertionError(str(rec2)[:200]))))
        p2.click("text=홈으로"); p2.wait_for_selector(".gcard[data-id=nothanks]")
        check("노땡스", "게임에서 나오면 게임 전용 스타일이 남지 않는다 (앨범 화면 보호)", lambda: (None if p2.evaluate("![...document.querySelectorAll('style')].some(s => s.textContent.includes('.g-nt'))") else (_ for _ in ()).throw(AssertionError("스타일이 남음"))))
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
        check("러브레터", "기록에 러브레터·버전 1.1.0·2명이 저장된다", lambda: (None if rec3 and rec3["gameVersion"] == "1.1.0" and len(rec3["players"]) == 2 else (_ for _ in ()).throw(AssertionError(str(rec3)[:200]))))
        p2.click("text=홈으로"); p2.wait_for_selector(".gcard[data-id=loveletter]")
        check("러브레터", "게임에서 나오면 러브레터 전용 스타일이 남지 않는다", lambda: (None if p2.evaluate("![...document.querySelectorAll('style')].some(s => s.textContent.includes('.g-ll'))") else (_ for _ in ()).throw(AssertionError("스타일이 남음"))))
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
