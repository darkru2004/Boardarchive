# FX Kit — 연출 엔진 v2 (이식용 묶음)

카드·칩·타일이 날아가는 움직임, 입자, 화면 흔들림, 히트스톱, 띠, 효과음(합성), 진동을 한 번에 쓰는 공용 엔진입니다.
**의존하는 것이 하나도 없습니다.** 파일을 프로젝트에 복사해서 `import`만 하면 됩니다. (보드 아카이브 `src/fx.js`, `src/fxscenes.js`와 같은 코드)

## 들어 있는 것
| 파일 | 내용 |
|---|---|
| `fx.js` | 엔진 본체. CSS는 스스로 `<head>`에 넣습니다 |
| `fxscenes.js` | 장면 묶음 15종(카드 깔기·내기·뽑기, 칩, 이득·손해, 피격, 탈락, 공개, 타일, 승리·패배, 띠 등) |
| `demo.html` | 시험장. 파일 하나로 열면 모든 장면·부품·효과음을 눌러 볼 수 있습니다 |
| `example.html` | 가장 작은 사용 예(복사해서 시작점으로) |

## 가장 짧은 사용
```html
<script type="module">
  import { makeFx } from './fx.js';
  import { playScene } from './fxscenes.js';
  const fx = makeFx().scope(document.getElementById('board'));
  await playScene(fx, 'hit', { play: cardEl, opp: [enemyEl] });
  fx.sfx('win');
</script>
```
- 소리는 브라우저 정책상 **첫 터치(클릭) 뒤에** 나옵니다.
- `makeFx({ fast: true })`는 모든 연출을 끕니다(자동 테스트용).
- 보드가 `position`이 있는 요소이면 가장 좋습니다. 연출 층(`.fx-layer`)은 `position:fixed`라 보드 위치와 상관없이 화면에 그려집니다.

## 장면: `playScene(fx, 이름, 대상, 옵션)`
대상 `t`에는 그 장면에 필요한 것만 넘기세요. 빠지면 그 장면은 조용히 끝납니다.

| 키 | 뜻 |
|---|---|
| `hand` | 손패 요소 배열 |
| `deck` | 덱 |
| `play` | 가운데 놓는 자리/방금 낸 카드 |
| `me` | 내 자리 |
| `score` | 내 점수칸(글자만 든 요소, `countTo`로 숫자가 올라갑니다) |
| `opp` | 상대 요소 배열 |
| `pot` | 칩 더미 |
| `tile` | 타일 놓는 자리 |
| `board` | 판 전체(패배 때 어두워짐). 없으면 `me`의 부모 |
| `chip`, `tileNode` | 날려 보낼 조각 HTML(없으면 기본 모양) |

옵션 `o`: `amount`(점수·피해량), `target`(상대 번호), `card`(특정 카드), `text`/`sub`(띠 글자)

| 장면 | 필요한 대상 | 연출 |
|---|---|---|
| `deal` | deck, hand, me | 덱에서 손패로 차례로 깔림 + 고리 |
| `play` | hand, play | 날아가 꽂힘 + 진동 |
| `draw` | deck, hand | 날면서 뒤집혀 도착 + 광택 |
| `chips` | pot, score | 칩이 날아와 동전 + 숫자 올라감 |
| `gain` / `loss` | score | 이득(별+빛) / 손해(번쩍+흔들) |
| `hit` | play, opp | 날아감 → 충격파 → 잠깐 멈춤 → 화면 흔들림 |
| `out` | opp | 번쩍 → 멈춤 → 연기 + 회색으로 |
| `reveal` | opp | 차례로 뒤집힘 |
| `place` | deck, tile | 회전하며 날아와 놓임 |
| `win` / `lose` | me (score, board) | 종이꽃가루+띠 / 어두워짐+연기+띠 |
| `turn` / `round` / `impact` | — | 띠 / 띠 / 화면 흔들림 |

## 부품 (fx.*)
`fly({from,to,node,dur,arc,spin,scale,fromScale,delay,fade,keep,hide,trail,flip,land})` · `flyMany(n, 옵션, 간격)` · `pop` · `slam(el,{power})` · `shake(el,px)` · `flip` · `glow(el,색)` · `float(el,'+5',{color,size})` ·
`burst(el,{kind:'spark|confetti|coin|ember|smoke|star',color,n,spread})` · `dust` · `ring(el,{color,power})` · `glint` ·
`shakeScreen(세기,ms)` · `hitstop(ms)` · `flash(색,세기,ms)` · `countTo(el,숫자)` · `banner(글,{sub,color,hold})` ·
`seq` · `lock()`(입력 잠금) · `skip()`(진행 중 연출 즉시 끝) · `wait(ms)` · `buzz(ms)` · `sfx(이름,{pitch})`

효과음 이름(합성음 20종): tap chip chips card deal slam place pick flip gain bad out win lose whoosh impact sparkle rise coin tick

## 사용자 설정 (localStorage)
`ba_fx` 움직임 · `ba_sfx` 효과음 · `ba_haptic` 진동 (`'0'`이면 끔) · `ba_fxlv` 세기 0~3(기본 3) · `ba_fxspd` 속도(0.8/1/1.3) · `ba_shake` 화면 흔들림 · `ba_sfxvol` 음량 0~100.
다른 프로젝트에서 설정 화면을 만들 때 같은 키를 쓰면 됩니다. 코드에서는 `import { fxPrefs } from './fx.js'`로 읽고 `fxPrefs.set(...)`/`setVal`로 바꿉니다.

## 궨트처럼 자체 연출이 있는 프로젝트
기존 연출 이벤트(예: GwentFX의 내기·피격·승리)를 받아 위 장면으로 연결하는 **어댑터 한 파일**만 만들면 됩니다.
```js
const MAP = { cardPlayed: 'play', damage: 'hit', roundWin: 'win' };   // 예시: 궨트 이벤트 → 장면
export function bindGwentFx(gwentBus, fx, targetsOf) { for (const [ev, sc] of Object.entries(MAP)) gwentBus.on(ev, e => playScene(fx, sc, targetsOf(e), { amount: e.amount })); }
```
컷씬(스킬 연출)은 4단계에서 같은 묶음에 추가됩니다.
