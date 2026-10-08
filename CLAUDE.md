# 공사현장 펫 뷰어

Claude Code가 일하는 모습을 터미널 대신, 귀여운 펫들이 공사하는 픽셀 화면으로 보여주는 보기 전용 뷰어다.
이벤트는 Claude Code 훅 → 로컬 서버 → 뷰어 창으로만 흐른다.

## 꼭 지킬 규칙

- 보기 전용이다. Claude Code의 작업에 영향을 주면 안 된다. 훅 응답으로 바꾸는 것은 '공사현장'(영어 'construction site') 입력을 막는 것 하나뿐이다.
- 모든 HTTP 훅에 `timeout` 2초를 걸고, 서버는 받자마자 본문 없는 2xx로 답한다. 처리는 그 뒤에 한다.
- SessionStart 훅(`server/start.js`)은 일반 텍스트를 출력하지 않는다. 그 출력은 Claude의 컨텍스트에 들어간다. JSON(`systemMessage`)만 쓴다.
- 서버는 기본으로 127.0.0.1에만 붙는다. 사용자가 '폰에서 보기'를 켰을 때만 읽기 전용 뷰어 포트(47822)를 같은 네트워크에 연다.
  그 포트는 주소의 열쇠가 맞아야 하고 GET만 받는다. 훅, 설정 저장, 파일 전체 보기, 창 열기는 PC 쪽 포트(47821)에만 둔다.
- 프롬프트와 코드를 디스크에 저장하지 않는다. 디스크에는 펫 이름과 설정만 남긴다. 모든 응답에 `Cache-Control: no-store`를 붙여 브라우저 캐시에도 남지 않게 한다.
- Windows, macOS, Linux에서 똑같이 돌아야 한다. 명령은 셸을 거치지 않고 인자 배열로 실행하고, 경로는 역슬래시와 `/`를 모두 받는다.
- 외부 패키지를 쓰지 않는다. 서버도 뷰어도 Node와 브라우저 기본 기능만 쓴다.
- 기본 펫은 Claude 마스코트를 본뜬 주황 문어다. 직접 코드로 그리고, 공식 이미지 파일과 로고는 넣지 않는다. 이 모습은 사용자가 확정했으니 바꾸지 않는다.
- GPT 펫(로봇)과 그 밖의 AI 펫(구름), 소품은 오리지널이다. 다른 회사의 캐릭터나 로고를 본뜨지 않는다.
- 화면 글자는 한국어와 영어를 함께 넣는다. 뷰어는 `viewer/js/i18n.js`, 서버 안내문은 `server/messages.js`, 펫 대사는 `config/pets.json`의 `ko`/`en`.
- 이미지와 소리 파일 없이 코드로 스프라이트를 그리고 소리를 합성한다.
- 기본 화면에 터미널 느낌의 UI(검은 배경, 로그 창)를 쓰지 않는다.
- 주황은 Claude 펫에만 쓰는 강조색이다. 건물과 소품에는 쓰지 않는다.
- 조작부의 판은 `border` 대신 네 방향 `box-shadow`(`--edge`)로 테두리를 그린다. 모서리 한 칸이 비는 도트 둥근 모서리다. 새 판도 `.box`를 쓴다.
- 소리는 기본 음소거다. 사용자가 켜기 전에는 오디오 장치를 열지 않는다.
- 새 연출은 가짜 이벤트(`npm run fake`, `demo.html`)로 먼저 검증한다.
- 확인되지 않은 훅 동작은 가정하지 말고 실제로 시험한다.

## 구조

```
plugins/construction-pets/            훅 + 서버 + 뷰어 (본체)
  hooks/hooks.json                    훅 16종. SessionStart만 command, 나머지는 HTTP
  server/start.js                     세션 시작 때 서버를 띄우고 SessionStart를 넘긴다
  server/server.js                    훅 수신, SSE, 설정, 파일 읽기, 폰에서 보기
  server/open.js                      뷰어 창 띄우기(전용 창 -> 안 되면 기본 브라우저)
  server/messages.js                  서버 안내문(한국어, 영어)과 여는 말
  server/normalize.js                 훅 JSON -> 뷰어용 작은 이벤트
  shared/reduce.js                    이벤트 -> 공사장 상태 (서버와 뷰어가 같이 쓴다)
  shared/calendar.js                  날짜 -> 계절과 행사
  shared/qr.js                        QR 코드 만들기(폰에서 보기 주소)
  viewer/index.html, viewer/js/*.js   캔버스 뷰어(world.js 배경과 건물, sprites.js 펫, ui.js 조작부, i18n.js 글자)
  config/pets.json                    펫 종류, 성격, 대사
  config/seasons.json                 계절, 행사, 음력 날짜표
  skins/                              펫 스킨(JSON). 예전 토끼와 고양이도 여기 있다
plugins/construction-pets-button/     '공사현장 보기' 버튼 mod (선택)
test/                                 node --test 로 도는 시험
scripts/build-demo.js                 뷰어를 demo.html 한 파일로 묶는다
```

뷰어 스크립트는 번들러 없이 순서대로 읽는 일반 스크립트이고, 모두 전역 `CP` 아래에 붙는다.
`viewer/index.html`의 `<!--CP:...-->` 표시는 `scripts/build-demo.js`가 쓰므로 지우지 않는다.

## 자주 쓰는 명령

```
npm test                 서버와 계산 시험 (28개)
npm run server           서버만 띄우기 -> http://127.0.0.1:47821
npm run fake             띄워 둔 서버에 가짜 이벤트 재생 (-- --fast 는 4배속, -- --en 은 영어 각본)
npm run demo             demo.html 다시 만들기
claude plugin validate plugins/construction-pets
claude plugin validate plugins/construction-pets-button
claude plugin test plugins/construction-pets-button
```

뷰어를 고친 뒤에는 `npm run demo`로 `demo.html`도 다시 만든다.

## 이벤트가 화면이 되는 길

1. 훅 JSON이 `POST /hook/<이벤트 이름>`으로 온다.
2. `normalize.js`가 `{ type, session, agent, tool, kind, file, snippet, ... }` 꼴로 줄인다.
3. `reduce.js`가 공사장 상태(건물, 작업 목록, 펫, 진행률)를 고친다. 서버는 이 상태를 기억해서 늦게 연 뷰어에 `snapshot`으로 준다.
4. 뷰어의 `director.js`가 같은 이벤트로 펫에게 연출을 시킨다.

새 훅 이벤트를 쓰려면 `hooks.json`, `server.js`의 `HOOK_EVENTS`, `normalize.js`, `reduce.js`, `director.js`를 차례로 고친다.

## 알아둘 것

- 뷰어는 전용 창(Edge/Chrome 계열의 `--app` 창)으로 띄운다. 평소 브라우저에 얹히지 않게 `<데이터 폴더>/window-profile`을 프로필로 쓴다.
  브라우저 실행 파일을 직접 띄울 때는 `windowsHide`를 켜지 않는다(창이 숨은 채 뜰 수 있다).
- 창 크기는 `prefs.settings.win`에 둔다. 뷰어가 전용 창 안에 있으면(`display-mode: standalone`) 스스로 `resizeTo`로 맞추고, 사용자가 끌어서 바꾼 크기를 저장한다.
- 전용 창은 하나만 둔다. 새 창이 `BroadcastChannel('cp-window')`로 알리면 먼저 떠 있던 창이 스스로 닫힌다.
- 도트 한 칸의 크기(`CP.app.S`)는 `main.js`의 `resize()`가 창 높이와 너비로 정한다. 띠 모양 창(안쪽 높이 330px 이상)에서 3이 나오게 맞춰 두었다.
- 건물 그림은 단계가 바뀔 때만 작은 캔버스에 그려 두고 매 프레임에는 찍기만 한다(`world.js`의 `drawBuilding`). 건물에 새 그림을 넣으면 캐시 열쇠(`key`)에 영향을 주는 값도 넣는다.
- 서버 버전은 `.claude-plugin/plugin.json`의 `version` 하나만 고친다. 시작 스크립트는 떠 있는 서버가 자기보다 예전 버전일 때만 `POST /quit`으로 내리고 새로 띄운다(더 새 서버는 그대로 쓴다). 뷰어는 서버 버전이 바뀌면 스스로 새로 고친다.
- 포트는 47821(PC)과 47822(폰에서 보기)로 고정이다. `hooks.json`에 주소를 적어야 하기 때문이다. 시험에서는 `CONSTRUCTION_PETS_PORT`, `CONSTRUCTION_PETS_LAN_PORT`로 바꾼다.
- 폰으로 들어온 뷰어는 `/config`의 `remote: true`로 구분한다. 그 화면에서는 설정과 이름을 바꾸지 못한다.
- `shared/qr.js`는 OpenCV로 해독해 확인했다. 고치면 다시 해독해 보고 `test/logic.test.js`의 지문을 바꾼다.
- 서버는 마지막 세션이 끝나고 30초 뒤, 또는 하루 동안 이벤트가 없으면 스스로 꺼진다.
- 서버가 꺼진 채로 세션이 계속되면 Claude Code가 훅마다 연결 실패를 알린다. 작업은 막히지 않는다. 새 세션을 시작하면 서버가 다시 켜진다.
- 음력 설날과 추석은 `config/seasons.json`의 날짜표(2025~2036)를 쓴다.
- 다른 AI CLI는 `POST /event`에 정규화된 이벤트를 보내면 같은 공사장에 나온다(`ai: "gpt"` 등). 어댑터는 아직 없다.
