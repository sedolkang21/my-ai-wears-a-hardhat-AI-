// 화면 글자의 한국어/영어 사전. 새 글자를 넣을 때는 두 언어를 함께 넣는다.
// 고르는 순서: 이 기기에서 고른 언어(localStorage) -> PC 설정(prefs.settings.lang) -> 브라우저 언어.
(function () {
  'use strict';
  var CP = window.CP;

  var KO = {
    'title': '공사현장 펫 뷰어',
    'world.aria': '펫들이 일하는 공사 현장',
    'status.connecting': '연결 중', 'status.live': '연결됨', 'status.retry': '다시 연결 중',
    'status.demo': '데모 · 가짜 이벤트', 'status.wait': '서버를 기다리는 중', 'status.phone': '폰에서 보는 중',
    'site.default': '공사현장', 'site.sign': '공사 중 · 안전 제일',

    'hud.ready': '공사 준비 중', 'hud.left': '모두 퇴근했어요', 'hud.done': '준공!', 'hud.tasks': '작업 {a}/{b}',
    'hud.working': '공사 중', 'hud.waiting': '지시를 기다리는 중',
    'btn.snack': '간식', 'btn.snack.tip': '간식을 고른 뒤 땅을 누르면 떨어져요', 'btn.cheer': '응원', 'btn.sound': '소리',
    'btn.phone': '폰', 'btn.phone.tip': '폰에서 보기: QR을 바로 띄워요', 'btn.full': '전체 화면', 'btn.detail': '상세', 'btn.close': '닫기',

    'panel.aria': '상세 정보', 'tab.site': '현장', 'tab.pets': '펫', 'tab.settings': '설정',
    'sec.site': '현장', 'sec.tasks': '작업 목록', 'sec.pets': '펫', 'sec.snips': '방금 고친 곳',
    'sec.date': '날짜 미리보기', 'sec.settings': '뷰어', 'sec.sound': '소리', 'sec.lang': '언어', 'sec.window': '창 모양',
    'site.meta': '{season} · 건물 {n}채',
    'tasks.none': '작업 목록이 없어요. 파일 수정과 도구 사용 횟수로 대략의 진행만 보여줘요.', 'tasks.item': '작업 {n}',
    'pets.none': '아직 아무도 출근하지 않았어요.', 'pets.name.aria': '{kind} 이름', 'pets.helper': '도우미', 'pets.helper.of': '{type} 도우미',
    'pets.renamed': '이제 제 이름은 {name}!',
    'snips.none': '아직 고친 파일이 없어요.',
    'date.aria': '미리 볼 날짜', 'date.today': '오늘', 'date.birthday': '생일',
    'season.spring': '봄', 'season.summer': '여름', 'season.autumn': '가을', 'season.winter': '겨울',
    'set.autoopen': '세션을 시작하면 뷰어 열기', 'set.announce': '시작할 때 주소 알려 주기', 'set.appwindow': '전용 창으로 열기',
    'set.appwindow.note': '끄면 평소 쓰는 브라우저의 탭으로 열려요.',
    'win.strip': '가로 띠', 'win.wide': '21:9', 'win.hd': '16:9', 'win.classic': '4:3', 'win.square': '1:1', 'win.tall': '세로',
    'win.note.app': '고르면 창 크기가 바로 바뀌어요. 창 가장자리를 끌어서 바꿔도 그 크기를 기억해요.',
    'win.note.tab': '전용 창으로 열 때 이 모양으로 열려요.',
    'snd.sfx': '효과음', 'snd.bgm': '배경 음악', 'snd.note': '레트로 게임기풍으로 코드에서 합성한 소리예요. 기본은 꺼져 있어요.',

    'code.aria': '파일 보기', 'code.loading': '불러오는 중…',
    'code.partial': '파일 전체는 읽지 못했어요. 마지막으로 고친 부분만 보여줘요.',
    'code.binary': '글자로 볼 수 없는 파일이에요.', 'code.truncated': '파일이 커서 앞부분만 보여줘요.', 'code.demo': '데모용 예시 파일이에요.',
    'card.name.aria': '펫 이름', 'card.pet': '쓰다듬기', 'card.snack': '간식',

    'phone.title': '폰에서 보기', 'phone.aria': '폰에서 보기', 'phone.qr.aria': '폰에서 여는 주소의 QR 코드',
    'phone.starting': '주소를 만드는 중…',
    'phone.how': '폰을 PC와 같은 와이파이에 두고 카메라로 QR을 찍으세요.',
    'phone.home': '폰 브라우저에서 "홈 화면에 추가"를 해 두면 다음부터는 아이콘 하나로 열려요.',
    'phone.pick': '안 열리면 다른 주소를 골라 보세요.',
    'phone.off': '폰에서 보기 끄기', 'phone.off.note': '끄면 주소가 사라지고, 다시 켜면 새 주소가 만들어져요.',
    'phone.err.port': '폰용 포트({port})를 열지 못했어요. 다른 프로그램이 쓰고 있는지 확인해 주세요.',
    'phone.err.net': '연결된 네트워크를 찾지 못했어요. PC의 와이파이나 랜선을 확인해 주세요.',
    'phone.err.demo': '데모에서는 쓸 수 없어요. Claude Code에 플러그인을 설치하면 켤 수 있어요.',

    'act.leaving': '퇴근하는 중', 'act.around': '현장 둘러보는 중', 'act.edit': '{f} 고치는 중!', 'act.edit.none': '건물',
    'act.read': '{f} 읽는 중', 'act.read.none': '설계도', 'act.web': '{f} 찾아보는 중', 'act.web.none': '웹',
    'act.bash': '{f} 돌리는 중', 'act.bash.none': '명령', 'act.plan': '작업 계획 세우는 중', 'act.delegate': '동료 부르는 중',
    'act.prompt': '지시서 읽는 중', 'act.permission': '허락 기다리는 중', 'act.idle': '다음 지시 기다리는 중', 'act.done': '방금 준공했어요',
    'act.fail': '고장 난 데 살피는 중', 'act.lunch': '한도에 걸려서 쉬는 중', 'act.worried': '연결을 걱정하는 중', 'act.sweep': '현장 정리하는 중',
    'act.tool': '{f} 쓰는 중', 'act.tool.none': '도구',
    'say.ratelimit': '한도에 걸렸어요. 도시락 먹고 올게요', 'say.disconnect': '어라, 연결이 끊겼나 봐요', 'say.compact': '자재 좀 정리할게요',

    'banner.newyear.count': '새해까지 D-{n}', 'banner.newyear': '{y} 새해 복 많이 받으세요', 'banner.seollal': '새해 복 많이 받으세요',
    'banner.chuseok': '풍성한 한가위 되세요', 'banner.hangul': 'ㄱㄴㄷ 한글날 ㅏㅑㅓ', 'banner.halloween': '사탕 주면 일할게요',
    'banner.christmas': '메리 크리스마스', 'banner.birthday': '생일 축하해요!', 'banner.childrensday': '어린이날',
    'banner.aprilfools': '오늘은 공사 안 함 (거짓말)',
  };

  var EN = {
    'title': 'Construction Site Pets',
    'world.aria': 'Pets working on a construction site',
    'status.connecting': 'Connecting', 'status.live': 'Live', 'status.retry': 'Reconnecting',
    'status.demo': 'Demo · fake events', 'status.wait': 'Waiting for the server', 'status.phone': 'Watching on phone',
    'site.default': 'Construction site', 'site.sign': 'Under construction · Safety first',

    'hud.ready': 'Getting ready', 'hud.left': 'Everyone went home', 'hud.done': 'Completed!', 'hud.tasks': 'Tasks {a}/{b}',
    'hud.working': 'Building', 'hud.waiting': 'Waiting for instructions',
    'btn.snack': 'Snack', 'btn.snack.tip': 'Pick a snack, then tap the ground to drop it', 'btn.cheer': 'Cheer', 'btn.sound': 'Sound',
    'btn.phone': 'Phone', 'btn.phone.tip': 'Watch on your phone: shows the QR code right away', 'btn.full': 'Full screen', 'btn.detail': 'Details', 'btn.close': 'Close',

    'panel.aria': 'Details', 'tab.site': 'Site', 'tab.pets': 'Pets', 'tab.settings': 'Settings',
    'sec.site': 'Site', 'sec.tasks': 'Tasks', 'sec.pets': 'Pets', 'sec.snips': 'Just edited',
    'sec.date': 'Date preview', 'sec.settings': 'Viewer', 'sec.sound': 'Sound', 'sec.lang': 'Language', 'sec.window': 'Window shape',
    'site.meta': '{season} · {n} buildings',
    'tasks.none': 'No task list. Progress is estimated from file edits and tool use.', 'tasks.item': 'Task {n}',
    'pets.none': 'Nobody has clocked in yet.', 'pets.name.aria': 'Name of the {kind}', 'pets.helper': 'Helper', 'pets.helper.of': '{type} helper',
    'pets.renamed': 'Call me {name} from now on!',
    'snips.none': 'No files edited yet.',
    'date.aria': 'Date to preview', 'date.today': 'Today', 'date.birthday': 'Birthday',
    'season.spring': 'Spring', 'season.summer': 'Summer', 'season.autumn': 'Autumn', 'season.winter': 'Winter',
    'set.autoopen': 'Open the viewer when a session starts', 'set.announce': 'Show the address at startup', 'set.appwindow': 'Open in its own window',
    'set.appwindow.note': 'When off, it opens as a tab in your usual browser.',
    'win.strip': 'Strip', 'win.wide': '21:9', 'win.hd': '16:9', 'win.classic': '4:3', 'win.square': '1:1', 'win.tall': 'Tall',
    'win.note.app': 'Pick one and the window resizes right away. Dragging the window edge works too; the size is remembered.',
    'win.note.tab': 'Used the next time it opens in its own window.',
    'snd.sfx': 'Sound effects', 'snd.bgm': 'Music', 'snd.note': 'Retro console-style sound, synthesized in code. Off by default.',

    'code.aria': 'File view', 'code.loading': 'Loading…',
    'code.partial': 'Could not read the whole file. Showing only the part edited last.',
    'code.binary': 'This file cannot be shown as text.', 'code.truncated': 'Large file: showing only the beginning.', 'code.demo': 'Sample file for the demo.',
    'card.name.aria': 'Pet name', 'card.pet': 'Pet', 'card.snack': 'Snack',

    'phone.title': 'Watch on your phone', 'phone.aria': 'Watch on your phone', 'phone.qr.aria': 'QR code of the address to open on your phone',
    'phone.starting': 'Creating the address…',
    'phone.how': 'Put your phone on the same Wi-Fi as this PC and scan the QR code with the camera.',
    'phone.home': 'Use "Add to Home Screen" in the phone browser and it opens with one tap from then on.',
    'phone.pick': 'If it does not open, try another address.',
    'phone.off': 'Turn off phone viewing', 'phone.off.note': 'Turning it off removes the address. Turning it on again creates a new one.',
    'phone.err.port': 'Could not open the phone port ({port}). Check whether another program is using it.',
    'phone.err.net': 'No network found. Check the Wi-Fi or cable on this PC.',
    'phone.err.demo': 'Not available in the demo. Install the plugin in Claude Code to turn it on.',

    'act.leaving': 'Heading home', 'act.around': 'Looking around the site', 'act.edit': 'Fixing {f}!', 'act.edit.none': 'a building',
    'act.read': 'Reading {f}', 'act.read.none': 'the blueprint', 'act.web': 'Looking up {f}', 'act.web.none': 'the web',
    'act.bash': 'Running {f}', 'act.bash.none': 'a command', 'act.plan': 'Planning the work', 'act.delegate': 'Calling a teammate',
    'act.prompt': 'Reading the work order', 'act.permission': 'Waiting for permission', 'act.idle': 'Waiting for the next order', 'act.done': 'Just finished building',
    'act.fail': 'Checking what broke', 'act.lunch': 'On a break (rate limit)', 'act.worried': 'Worried about the connection', 'act.sweep': 'Tidying up the site',
    'act.tool': 'Using {f}', 'act.tool.none': 'a tool',
    'say.ratelimit': 'Hit the rate limit. Lunch break!', 'say.disconnect': 'Huh, did the line go down?', 'say.compact': 'Let me tidy the materials',

    'banner.newyear.count': '{n} days to New Year', 'banner.newyear': 'Happy New Year {y}', 'banner.seollal': 'Happy Lunar New Year',
    'banner.chuseok': 'Happy Chuseok', 'banner.hangul': 'ㄱㄴㄷ Hangul Day ㅏㅑㅓ', 'banner.halloween': 'Will work for candy',
    'banner.christmas': 'Merry Christmas', 'banner.birthday': 'Happy Birthday!', 'banner.childrensday': "Children's Day",
    'banner.aprilfools': 'No construction today (just kidding)',
  };

  var DICT = { ko: KO, en: EN };
  var lang = 'ko', listeners = [];

  function auto() {
    var n = '';
    try { n = (navigator.languages && navigator.languages[0]) || navigator.language || ''; } catch (e) { /* 없으면 영어 */ }
    return /^ko\b/i.test(n) ? 'ko' : 'en';
  }

  function t(key, vars) {
    var s = DICT[lang][key];
    if (s === undefined) s = KO[key];
    if (s === undefined) return key;
    if (vars) s = s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] === undefined ? m : String(vars[k]); });
    return s;
  }

  // 설정 파일의 { ko: ..., en: ... } 값에서 지금 언어를 고른다. 문자열이나 다른 값은 그대로 돌려준다.
  function pick(v) {
    if (v && typeof v === 'object' && !Array.isArray(v) && (v.ko !== undefined || v.en !== undefined)) {
      return v[lang] !== undefined ? v[lang] : v.ko !== undefined ? v.ko : v.en;
    }
    return v;
  }

  // HTML에 적어 둔 글자를 바꾼다. data-i18n="키"는 내용, data-i18n-attr="속성:키;속성:키"는 속성.
  function apply(root) {
    var i, list = (root || document).querySelectorAll('[data-i18n]');
    for (i = 0; i < list.length; i++) list[i].textContent = t(list[i].getAttribute('data-i18n'));
    list = (root || document).querySelectorAll('[data-i18n-attr]');
    for (i = 0; i < list.length; i++) {
      list[i].getAttribute('data-i18n-attr').split(';').forEach(function (pair) {
        var p = pair.split(':');
        if (p.length === 2) list[i].setAttribute(p[0].trim(), t(p[1].trim()));
      });
    }
    document.documentElement.lang = lang;
    document.title = t('title');
    var meta = document.querySelector && document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (meta) meta.setAttribute('content', t('site.default')); // 폰 홈 화면 아이콘 이름
  }

  function set(next, quiet) {
    next = next === 'en' ? 'en' : 'ko';
    var changed = next !== lang;
    lang = next;
    apply();
    if (changed && !quiet) listeners.forEach(function (fn) { fn(lang); });
  }

  // prefsLang: PC 설정에 저장된 언어('' 이면 자동)
  // useLocal: 폰으로 들어온 화면과 데모는 이 기기에서 고른 언어를 먼저 쓴다
  function resolve(prefsLang, useLocal) {
    var local = useLocal ? CP.store.get('lang', '') : '';
    if (local === 'ko' || local === 'en') return local;
    if (prefsLang === 'ko' || prefsLang === 'en') return prefsLang;
    return auto();
  }

  CP.i18n = {
    t: t, pick: pick, apply: apply, set: set, resolve: resolve, auto: auto,
    get lang() { return lang; },
    onChange: function (fn) { listeners.push(fn); },
    keys: function () { return { ko: Object.keys(KO), en: Object.keys(EN) }; },
  };
  CP.t = t;
})();
