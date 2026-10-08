'use strict';
// 실행: node --test test/logic.test.js
// 브라우저 없이 시험할 수 있는 계산: 날짜 -> 시즌, 이벤트 -> 공사장 상태, 훅 JSON -> 이벤트.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const PLUGIN = path.join(__dirname, '..', 'plugins', 'construction-pets');
const calendar = require(path.join(PLUGIN, 'shared', 'calendar.js'));
const R = require(path.join(PLUGIN, 'shared', 'reduce.js'));
const { normalize } = require(path.join(PLUGIN, 'server', 'normalize.js'));
const demo = require(path.join(PLUGIN, 'viewer', 'js', 'demo.js'));
const seasons = require(path.join(PLUGIN, 'config', 'seasons.json'));
const pets = require(path.join(PLUGIN, 'config', 'pets.json'));
const QR_PRINT = '714fdaf31ce252098881a6bf3b27f0f66c4a85d3';

const on = (ymd, birthday) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const r = calendar.resolve(new Date(y, m - 1, d, 9), seasons, birthday);
  return r.season + (r.theme ? '/' + r.theme : '');
};

test('계절 4종과 행사 10종이 제 날짜에 나온다', () => {
  assert.equal(on('2026-04-10'), 'spring');
  assert.equal(on('2026-07-20'), 'summer');
  assert.equal(on('2026-10-08'), 'autumn');
  assert.equal(on('2026-01-20'), 'winter');
  assert.equal(on('2026-12-29'), 'winter/newyear');
  assert.equal(on('2027-01-03'), 'winter/newyear', '해를 넘는 범위');
  assert.equal(on('2027-01-04'), 'winter');
  assert.equal(on('2026-02-17'), 'winter/seollal');
  assert.equal(on('2026-02-14'), 'winter/valentine', '설날 앞 3일과 겹치면 짧은 쪽이 우선');
  assert.equal(on('2026-02-20'), 'winter/seollal');
  assert.equal(on('2026-02-21'), 'winter');
  assert.equal(on('2026-03-13'), 'spring/valentine', '화이트데이');
  assert.equal(on('2026-04-01'), 'spring/aprilfools');
  assert.equal(on('2026-05-05'), 'spring/childrensday');
  assert.equal(on('2026-09-25'), 'autumn/chuseok');
  assert.equal(on('2026-09-22'), 'autumn/chuseok');
  assert.equal(on('2026-09-29'), 'autumn');
  assert.equal(on('2026-10-09'), 'autumn/hangul');
  assert.equal(on('2026-10-24'), 'autumn/halloween');
  assert.equal(on('2026-10-31'), 'autumn/halloween');
  assert.equal(on('2026-11-01'), 'autumn');
  assert.equal(on('2026-12-25'), 'winter/christmas');
  assert.equal(on('2026-12-26'), 'winter');
});

test('생일이 가장 우선이고, 끈 행사는 나오지 않는다', () => {
  assert.equal(on('2026-12-25', '12-25'), 'winter/birthday');
  assert.equal(on('2026-06-15', '06-15'), 'summer/birthday');
  assert.equal(on('2026-06-15', ''), 'summer');
  const off = { ...seasons, disabled: ['halloween'] };
  assert.equal(calendar.resolve(new Date(2026, 9, 31, 9), off).theme, null);
});

test('음력 명절 날짜표가 설정에 들어 있다', () => {
  assert.equal(seasons.lunar.seollal['2026'], '02-17');
  assert.equal(seasons.lunar.chuseok['2026'], '09-25');
  assert.equal(seasons.lunar.seollal['2027'], '02-07');
  assert.equal(seasons.lunar.chuseok['2027'], '09-15');
});

test('각본을 끝까지 돌리면 모든 건물이 준공되고 모두 퇴근한다', () => {
  const site = R.newSite('demo', 'demo');
  let midProgress = 0, phases = new Set();
  for (const step of demo.script()) {
    if (step.ev.type === '__reset') break;
    R.apply(site, { ...step.ev });
    phases.add(R.phase(site));
    if (step.ev.type === 'task_completed' && step.ev.id === 't2') midProgress = R.progress(site);
  }
  assert.equal(site.order.length, 8);
  assert.ok(site.order.every((p) => site.buildings[p].done && site.buildings[p].stage === R.MAX_STAGE));
  assert.deepEqual(Object.keys(site.pets), []);
  assert.equal(site.ended, true);
  assert.equal(midProgress, 3 / 5, '작업 목록의 완료 비율');
  assert.deepEqual([...phases].sort(), ['dawn', 'day', 'dusk', 'night']);
});

test('준공한 건물을 다시 고치면 공사 중으로 돌아간다', () => {
  const site = R.newSite('s', 's');
  const edit = { type: 'tool_post', session: 'a', kind: 'edit', file: 'a.js', lines: 10, gain: 1 };
  R.apply(site, { type: 'prompt', session: 'a' });
  R.apply(site, edit);
  assert.equal(site.buildings['a.js'].stage, 1);
  R.apply(site, { type: 'stop', session: 'a' });
  assert.equal(site.buildings['a.js'].done, true);
  assert.equal(R.progress(site), 1);
  R.apply(site, { type: 'prompt', session: 'a' });
  R.apply(site, edit);
  assert.equal(site.buildings['a.js'].done, false);
  assert.equal(site.buildings['a.js'].rebuilt, true);
  assert.ok(R.progress(site) < 1);
});

test('작업 목록이 없으면 툴 호출 횟수로 대략의 단계만 올라간다', () => {
  const site = R.newSite('s', 's');
  R.apply(site, { type: 'prompt', session: 'a' });
  let prev = R.progress(site);
  assert.equal(prev, 0);
  for (let i = 0; i < 40; i++) {
    R.apply(site, { type: 'tool_pre', session: 'a', tool: 'Read', kind: 'read' });
    const p = R.progress(site);
    assert.ok(p > prev && p < 0.9, '턴이 끝나기 전에는 준공으로 보이지 않는다');
    prev = p;
  }
});

test('훅 JSON에서 필요한 것만 남긴다', () => {
  const long = 'x'.repeat(500);
  const [prompt] = normalize('UserPromptSubmit', { session_id: 's', cwd: '/p', prompt: long });
  assert.ok(prompt.text.length <= 60);
  const [pre, todos] = normalize('PreToolUse', { session_id: 's', cwd: '/p', tool_name: 'TodoWrite',
    tool_input: { todos: [{ content: 'A', status: 'completed' }, { content: 'B', status: 'pending' }] } });
  assert.equal(pre.kind, 'plan');
  assert.deepEqual(todos.tasks, [{ subject: 'A', done: true }, { subject: 'B', done: false }]);
  const [win] = normalize('PreToolUse', { session_id: 's', cwd: 'C:\\work\\app', tool_name: 'Read',
    tool_input: { file_path: 'C:\\work\\app\\src\\index.ts' } });
  assert.equal(win.file, 'src/index.ts', 'Windows 경로도 프로젝트 기준으로 바꾼다');
  const [edit] = normalize('PostToolUse', { session_id: 's', cwd: '/p', tool_name: 'Edit', agent_id: 'a1',
    tool_input: { file_path: '/p/a.js', old_string: 'a', new_string: Array.from({ length: 40 }, (_, i) => 'line ' + i + ' ' + long).join('\n') } });
  assert.equal(edit.agent, 'a1');
  assert.equal(edit.snippet.length, 10);
  assert.ok(edit.snippet.every((l) => l.length <= 64));
  assert.deepEqual(normalize('Notification', { session_id: 's', notification_type: 'auth_success' }), []);
  assert.equal(normalize('StopFailure', { session_id: 's', error: 'rate_limit' })[0].error, 'rate_limit');
});

test('펫 설정은 성격 셋을 갖추고, 종마다 성격이 이어져 있다', () => {
  for (const kind of Object.values(pets.kinds)) {
    const p = pets.personalities[kind.personality];
    assert.ok(p, kind.label);
    assert.ok(p.walkSpeed > 0 && p.workTempo > 0);
    for (const lang of ['ko', 'en']) {
      assert.ok(kind.label[lang] && kind.defaultName[lang] && p.label[lang], lang);
      for (const key of ['prompt', 'fail', 'done', 'wait', 'idle', 'pet', 'snack', 'held', 'hello']) assert.ok(p.lines[lang][key].length, lang + ' ' + key);
    }
  }
  assert.equal(pets.kinds.claude.species, 'octopus', 'Claude 펫은 주황 문어 그대로다');
  assert.equal(pets.kinds.claude.colors.base, '#D97757');
  assert.deepEqual([pets.kinds.gpt.species, pets.kinds.other.species], ['robot', 'cloud'], 'GPT와 그 밖의 AI는 저마다 다른 모습이다');
});

test('화면 글자는 한국어와 영어가 빠짐없이 짝을 이룬다', () => {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const store = {};
  const win = { CP: { store: { get: (k, d) => (k in store ? store[k] : d), set: (k, v) => { store[k] = v; } } } };
  const ctx = vm.createContext({ window: win, navigator: { language: 'en-US' }, document: { querySelectorAll: () => [], documentElement: {} } });
  vm.runInContext(fs.readFileSync(path.join(PLUGIN, 'viewer', 'js', 'i18n.js'), 'utf8'), ctx);
  const i18n = win.CP.i18n, keys = i18n.keys();
  assert.deepEqual([...keys.ko].sort(), [...keys.en].sort());
  assert.ok(keys.ko.length > 100);
  // 뷰어 코드가 쓰는 키가 사전에 모두 있다
  const used = new Set();
  for (const f of ['ui.js', 'main.js', 'director.js', 'pets.js', 'seasons.js']) {
    const src = fs.readFileSync(path.join(PLUGIN, 'viewer', 'js', f), 'utf8');
    for (const m of src.matchAll(/\bt\('([a-z][\w.]+)'/g)) used.add(m[1]);
  }
  const html = fs.readFileSync(path.join(PLUGIN, 'viewer', 'index.html'), 'utf8');
  for (const m of html.matchAll(/data-i18n="([\w.]+)"/g)) used.add(m[1]);
  for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g)) for (const pair of m[1].split(';')) used.add(pair.split(':')[1]);
  // 't(\'season.\' + id)'처럼 앞부분만 적힌 것은 그렇게 시작하는 키가 있는지 본다
  for (const key of used) assert.ok(key.endsWith('.') ? keys.ko.some((k) => k.startsWith(key)) : keys.ko.includes(key), '사전에 없는 키: ' + key);
  assert.ok(used.size > 60);
  // 언어 고르기: 이 기기에서 고른 것 -> PC 설정 -> 브라우저 언어
  assert.equal(i18n.resolve('', false), 'en');
  assert.equal(i18n.resolve('ko', false), 'ko');
  store.lang = 'en';
  assert.equal(i18n.resolve('ko', true), 'en');
  assert.equal(i18n.resolve('ko', false), 'ko', 'PC 화면은 PC 설정을 따른다');
  i18n.set('en');
  assert.equal(i18n.t('hud.tasks', { a: 2, b: 5 }), 'Tasks 2/5');
  assert.equal(i18n.pick({ ko: '봄', en: 'Spring' }), 'Spring');
  assert.equal(i18n.pick('그대로'), '그대로');
  i18n.set('ko');
  assert.equal(i18n.t('hud.tasks', { a: 2, b: 5 }), '작업 2/5');
  // 계절과 행사 이름도 두 언어를 갖춘다
  for (const it of [...seasons.seasons, ...seasons.events]) assert.ok(it.label.ko && it.label.en, it.id);
  for (const ev of seasons.events) if (!['valentine'].includes(ev.id)) assert.notEqual(i18n.t('banner.' + ev.id), 'banner.' + ev.id, ev.id);
});

test('영어 각본도 같은 결말에 이른다', () => {
  const end = (lang) => {
    const st = R.newSite('demo', demo.SITE);
    for (const step of demo.script(lang)) if (step.ev.type !== '__reset') R.apply(st, { ...step.ev, site: 'demo', ts: 1 });
    return { files: st.order, done: st.order.every((p) => st.buildings[p].done), tasks: R.taskCounts(st) };
  };
  assert.deepEqual(end('en'), end('ko'));
  assert.ok(end('en').done);
  const text = JSON.stringify(demo.script('en')) + JSON.stringify(demo.files('en'));
  assert.ok(!/[가-힣]/.test(text), '영어 각본에 한글이 남아 있다');
});

test('이상한 이름의 파일과 세션도 상태를 깨지 않는다', () => {
  const st = R.newSite('x', 'x');
  R.apply(st, { type: 'session_start', session: 'constructor', ai: 'claude', ts: 1 });
  for (const file of ['constructor', '__proto__', 'toString', 'src/ok.js']) {
    R.apply(st, { type: 'tool_post', session: 'constructor', kind: 'edit', tool: 'Write', file, lines: 3, gain: 1, isNew: true, ts: 2 });
  }
  assert.equal(st.order.length, 4);
  for (const p of st.order) assert.equal(typeof st.buildings[p].stage, 'number', p);
  assert.equal(Object.keys(st.pets).length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(st)).order, st.order, '뷰어로 보낼 수 있는 평범한 JSON이다');
});

test('버전 견주기', () => {
  const { compareVersions } = require(path.join(PLUGIN, 'server', 'messages.js'));
  assert.ok(compareVersions('0.3.1', '0.3.0') > 0);
  assert.ok(compareVersions('0.3.0', '0.3.1') < 0);
  assert.ok(compareVersions('0.10.0', '0.9.9') > 0);
  assert.equal(compareVersions('1.2.3', '1.2.3'), 0);
  assert.ok(compareVersions('0.3.1', undefined) > 0);
});

test('안내문과 여는 말: 한국어와 영어', () => {
  const { msg, langOf, systemLang, isOpenWord } = require(path.join(PLUGIN, 'server', 'messages.js'));
  assert.equal(langOf({ lang: 'en' }, { LANG: 'ko_KR.UTF-8' }), 'en', '설정이 먼저다');
  assert.equal(langOf({ lang: '' }, { LANG: 'ko_KR.UTF-8' }), 'ko');
  assert.equal(systemLang({ LANG: 'en_US.UTF-8' }), 'en');
  assert.equal(systemLang({ LC_ALL: 'ko_KR.UTF-8', LANG: 'en_US.UTF-8' }), 'ko');
  assert.match(msg('en', 'announce', { url: 'http://x' }), /^Construction site viewer: http:\/\/x/);
  assert.match(msg('ko', 'announce', { url: 'http://x' }), /^공사현장 뷰어: http:\/\/x/);
  for (const w of ['공사현장', '공사 현장 열어줘', 'construction site', 'Construction-Site', 'show construction pets']) assert.ok(isOpenWord(w), w);
  for (const w of ['공사현장 고쳐줘', 'construction site bug', 'site', '', 'x'.repeat(200)]) assert.ok(!isOpenWord(w), w);
});

test('전용 창: 브라우저를 찾고, 창 크기와 전용 프로필을 인자로 넘긴다', () => {
  const { appCandidates, appArgs, cleanSize, DEFAULT_SIZE } = require(path.join(PLUGIN, 'server', 'open.js'));
  const win = appCandidates('win32', { 'ProgramFiles(x86)': 'C:\\Program Files (x86)', ProgramFiles: 'C:\\Program Files', LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' }, false);
  assert.equal(win[0], 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'Windows에서는 기본으로 깔린 Edge를 먼저 찾는다');
  assert.ok(win.includes('C:\\Users\\me\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'));
  assert.ok(win.some((p) => /whale\.exe$/.test(p)));
  assert.equal(appCandidates('win32', { CONSTRUCTION_PETS_BROWSER: 'D:\\b.exe' }, false)[0], 'D:\\b.exe', '직접 정한 브라우저가 가장 먼저다');
  assert.ok(appCandidates('darwin', { HOME: '/Users/d' }, false).includes('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'));
  assert.ok(appCandidates('linux', { PATH: '/usr/bin:/snap/bin' }, false).includes('/snap/bin/chromium'));
  assert.ok(appCandidates('linux', { PATH: '/usr/bin' }, true)[0].startsWith('/mnt/c/'), 'WSL에서는 Windows 쪽 브라우저를 먼저 찾는다');
  const url = 'http://127.0.0.1:47821/';
  const args = appArgs(url, { w: 1260, h: 540 }, '/data/window-profile');
  assert.deepEqual(args.slice(0, 2), ['--app=' + url, '--window-size=1260,540']);
  assert.ok(args.includes('--user-data-dir=/data/window-profile') && args.includes('--no-first-run'));
  assert.ok(!appArgs(url, null, null).some((a) => a.startsWith('--user-data-dir')));
  assert.deepEqual(cleanSize(null), DEFAULT_SIZE);
  assert.deepEqual(cleanSize({ w: '900', h: 300.6 }), { w: 900, h: 301 });
  assert.deepEqual(cleanSize({ w: 10, h: 10 }), { w: 240, h: 160 }, '너무 작으면 기본값이 아니라 가장 작은 크기로 맞춘다');
  assert.deepEqual(cleanSize({ w: 99999, h: 180 }), { w: 6000, h: 180 });
  assert.deepEqual(cleanSize({ w: 'x', h: 300 }), DEFAULT_SIZE);
  assert.ok(DEFAULT_SIZE.w / DEFAULT_SIZE.h >= 3, '기본은 가로로 긴 창이다');
});

test('운영체제에 맞는 방법으로 브라우저를 연다', () => {
  const { openCommands } = require(path.join(PLUGIN, 'server', 'open.js'));
  const url = 'http://127.0.0.1:47821/';
  assert.deepEqual(openCommands('win32', url, false)[0], ['rundll32', ['url.dll,FileProtocolHandler', url]]);
  assert.deepEqual(openCommands('darwin', url, false), [['open', [url]]]);
  assert.equal(openCommands('linux', url, false)[0][0], 'xdg-open');
  assert.equal(openCommands('linux', url, true)[0][0], 'wslview', 'WSL에서는 Windows 쪽 브라우저를 먼저 찾는다');
  for (const platform of ['win32', 'darwin', 'linux']) {
    for (const [cmd, args] of openCommands(platform, url, true)) {
      assert.ok(!/\s/.test(cmd), cmd);
      assert.equal(args[args.length - 1], url, '주소는 인자 하나로, 셸을 거치지 않고 넘긴다');
    }
  }
});

test('Windows 경로를 프로젝트 기준 경로로 바꾼다', () => {
  const { relPath } = require(path.join(PLUGIN, 'server', 'normalize.js'));
  assert.equal(relPath('C:\\Users\\me\\app\\src\\App.tsx', 'C:\\Users\\me\\app'), 'src/App.tsx');
  assert.equal(relPath('c:\\users\\me\\app\\src\\App.tsx', 'C:\\Users\\me\\app'), 'src/App.tsx', '드라이브 글자와 대소문자가 달라도 된다');
  assert.equal(relPath('C:\\Users\\me\\app\\src\\App.tsx', 'C:\\Users\\me\\app\\'), 'src/App.tsx');
  assert.equal(relPath('D:\\other\\x.md', 'C:\\Users\\me\\app'), 'D:/other/x.md', '프로젝트 밖 파일은 전체 경로로 둔다');
  assert.equal(relPath('C:\\Users\\me\\app2\\x.md', 'C:\\Users\\me\\app'), 'C:/Users/me/app2/x.md', '이름이 비슷한 옆 폴더와 헷갈리지 않는다');
  const [ev] = normalize('PostToolUse', { session_id: 's', cwd: 'C:\\Users\\me\\app', tool_name: 'Write',
    tool_input: { file_path: 'C:\\Users\\me\\app\\README.md', content: 'a\r\nb\r\n' }, tool_response: { type: 'create' } });
  assert.equal(ev.file, 'README.md');
  assert.equal(ev.lines, 2);
  assert.deepEqual(ev.snippet, ['a', 'b'], '줄 끝의 CR은 떼어 낸다');
});

test('QR 코드: 주소 길이에 맞는 크기를 고르고, 너무 길면 만들지 않는다', () => {
  const qr = require(path.join(PLUGIN, 'shared', 'qr.js'));
  const q = qr.make('http://192.168.0.5:47822/?k=0123456789abcdef');
  assert.equal(q.version, 4);
  assert.equal(q.size, 33);
  assert.equal(q.rows.length, 33);
  // 세 귀퉁이의 위치 찾기 무늬(7x7)가 제자리에 있다
  const finder = (ox, oy) => { for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) { const d = Math.max(Math.abs(x - 3), Math.abs(y - 3)); assert.equal(q.rows[oy + y][ox + x], d === 2 ? 0 : 1); } };
  finder(0, 0); finder(26, 0); finder(0, 26);
  assert.equal(qr.make('A').version, 1);
  assert.equal(qr.make('u'.repeat(106)).version, 6);
  assert.equal(qr.make('u'.repeat(107)), null);
  // OpenCV로 해독해 확인한 결과와 같은지(2026-10-08) 지문으로 지킨다
  const crypto = require('node:crypto');
  const print = crypto.createHash('sha1').update(q.rows.map((r) => r.join('')).join('\n')).digest('hex');
  assert.equal(print, QR_PRINT);
});
