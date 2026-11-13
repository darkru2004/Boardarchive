# 보드게임 아카이브 v0.2
- 실행(개발): 이 폴더에서 `python3 -m http.server 8000` → 브라우저에서 http://localhost:8000
- 배포: 이 폴더 전체를 정적 웹 호스팅에 올린다. (tests/, tools/ 는 올리지 않아도 됨)
- 배포 전: `node tools/build.mjs` (오프라인 파일 목록 갱신)
- 테스트: `node tests/core.test.mjs` / `python3 tests/browser.test.py`
- 규격서: 프로젝트 문서 claude/archive-spec-v0.2.md
