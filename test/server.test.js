'use strict';
// 실행: node --test test/server.test.js
// 서버를 임시 포트에 띄워 실제 HTTP로 시험한다. 브라우저는 열지 않는다.

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const PLUGIN = path.join(__dirname, '..', 'plugins', 'construction-pets');
const SERVER = path.join(PLUGIN, 'server', 'server.js');
const START = path.join(PLUGIN, 'server', 'start.js');

function freePort() {
  return new Promise((resolve) => {
    const s = http.createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

function req(port, method, urlPath, body, headers) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    const r = http.request({
      host: '127.0.0.1', port, path: urlPath, method,
      headers: { ...(data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}), ...headers },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch { /* 본문 없음 */ }
        resolve({ status: res.statusCode, text, json });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitUp(port) {
  for (let i = 0; i < 50; i++) {
    try { if ((await req(port, 'GET', '/health')).status === 200) return; } catch { /* 아직 */ }
    await sleep(50);
  }
  throw new Error('server did not start');
}

async function waitDown(port, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { await req(port, 'GET', '/health'); } catch { return true; }
    await sleep(50);
  }
  return false;
}

function listen(port) {
  const events = [];
  const r = http.get({ host: '127.0.0.1', port, path: '/events' }, (res) => {
    let buf = '';
    res.on('data', (c) => {
      buf += c.toString('utf8');
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const frame = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const name = (frame.match(/^event: (.+)$/m) || [])[1];
        const data = (frame.match(/^data: (.+)$/m) || [])[1];
        if (name && data) events.push({ name, data: JSON.parse(data) });
      }
    });
  });
  r.on('error', () => {});
  return { events, close: () => r.destroy() };
}

async function boot(extraEnv) {
  const port = await freePort();
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-data-'));
  const env = { ...process.env, CONSTRUCTION_PETS_PORT: String(port), CONSTRUCTION_PETS_DATA: data,
    CONSTRUCTION_PETS_NO_OPEN: '1', CONSTRUCTION_PETS_GRACE_MS: '300', LANG: 'ko_KR.UTF-8', ...extraEnv };
  delete env.CLAUDE_PLUGIN_DATA; delete env.LC_ALL; delete env.LC_MESSAGES;
  const child = spawn(process.execPath, [SERVER], { env, stdio: 'ignore' });
  await waitUp(port);
  return { port, data, env, child, stop: () => child.kill() };
}

test('훅에는 본문 없는 200으로 바로 답하고, 이벤트는 뷰어로 흘러간다', async () => {
  const s = await boot();
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-proj-'));
  const file = path.join(project, 'src', 'App.tsx');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'line1\nline2\nline3\n');
  try {
    const viewer = listen(s.port);
    await sleep(100);
    assert.equal(viewer.events[0].name, 'snapshot');

    const t0 = Date.now();
    const pre = await req(s.port, 'POST', '/hook/PreToolUse', {
      session_id: 's1', cwd: project, hook_event_name: 'PreToolUse', tool_name: 'Write',
      tool_input: { file_path: file, content: 'x' }, tool_use_id: 't1',
    });
    assert.equal(pre.status, 200);
    assert.equal(pre.text, '');
    assert.ok(Date.now() - t0 < 500, '훅 응답이 느리다');

    await req(s.port, 'POST', '/hook/PostToolUse', {
      session_id: 's1', cwd: project, hook_event_name: 'PostToolUse', tool_name: 'Write',
      tool_input: { file_path: file, content: 'const a = 1\nconst b = 2\n' },
      tool_response: { type: 'create', filePath: file }, tool_use_id: 't1',
    });
    await req(s.port, 'POST', '/hook/PostToolUse', {
      session_id: 's1', cwd: project, hook_event_name: 'PostToolUse', tool_name: 'Edit',
      tool_input: { file_path: file, old_string: 'const a = 1', new_string: 'const a = 2\nconst c = 3' },
      tool_response: { filePath: file }, tool_use_id: 't2', agent_id: 'a7', agent_type: 'Explore',
    });
    await req(s.port, 'POST', '/hook/Stop', { session_id: 's1', cwd: project, hook_event_name: 'Stop' });
    await sleep(200);

    const evs = viewer.events.filter((e) => e.name === 'ev').map((e) => e.data);
    assert.deepEqual(evs.map((e) => e.type), ['tool_pre', 'tool_post', 'tool_post', 'stop']);
    assert.equal(evs[0].file, 'src/App.tsx', '프로젝트 기준 상대 경로여야 한다');
    assert.equal(evs[1].isNew, true);
    assert.equal(evs[1].lines, 3, '파일 전체 줄 수를 센다');
    assert.deepEqual(evs[1].snippet, ['const a = 1', 'const b = 2']);
    assert.equal(evs[2].agent, 'a7');
    assert.deepEqual(evs[2].snippet, ['const a = 2', 'const c = 3']);

    // 늦게 연 뷰어도 지금 모습부터 본다.
    const late = listen(s.port);
    await sleep(100);
    const site = late.events[0].data.sites[0];
    assert.equal(site.buildings['src/App.tsx'].done, true);
    assert.equal(site.name, path.basename(project));

    // 이번 세션에서 다룬 파일만 읽어준다.
    const ok = await req(s.port, 'GET', `/file?site=${site.id}&path=${encodeURIComponent('src/App.tsx')}`);
    assert.equal(ok.json.text, 'line1\nline2\nline3\n');
    const no = await req(s.port, 'GET', `/file?site=${site.id}&path=${encodeURIComponent('../../etc/passwd')}`);
    assert.equal(no.status, 404);
    viewer.close();
    late.close();
  } finally {
    s.stop();
  }
});

test("'공사현장' 입력만 막고, 다른 프롬프트는 건드리지 않는다", async () => {
  const s = await boot();
  try {
    for (const word of ['공사현장', ' 공사현장 보기 ', '/공사현장']) {
      const r = await req(s.port, 'POST', '/hook/UserPromptSubmit', { session_id: 's1', cwd: '/p', prompt: word });
      assert.equal(r.json.decision, 'block', word);
      assert.equal(r.json.hookSpecificOutput.suppressOriginalPrompt, true);
    }
    for (const word of ['공사현장 뷰어 코드를 고쳐줘', '공사현장이 뭐야?', 'hello']) {
      const r = await req(s.port, 'POST', '/hook/UserPromptSubmit', { session_id: 's1', cwd: '/p', prompt: word });
      assert.equal(r.status, 200);
      assert.equal(r.text, '', word);
    }
    assert.equal((await req(s.port, 'GET', '/health')).json.opens, 3);
    // 영어로도 열 수 있다. 그 말만 입력했을 때만 반응한다.
    for (const word of ['construction site', 'Open construction site', '/construction-site', 'show the construction site.']) {
      const r = await req(s.port, 'POST', '/hook/UserPromptSubmit', { session_id: 's1', cwd: '/p', prompt: word });
      assert.equal(r.json && r.json.decision, 'block', word);
    }
    for (const word of ['fix the construction site viewer', 'what is a construction site?', 'construction']) {
      const r = await req(s.port, 'POST', '/hook/UserPromptSubmit', { session_id: 's1', cwd: '/p', prompt: word });
      assert.equal(r.text, '', word);
    }
  } finally {
    s.stop();
  }
});

test('안내문은 설정한 언어로, 없으면 PC 언어로 나온다', async () => {
  const s = await boot({ LANG: 'en_US.UTF-8' });
  try {
    const block = () => req(s.port, 'POST', '/hook/UserPromptSubmit', { session_id: 's1', cwd: '/p', prompt: '공사현장' });
    assert.match((await block()).json.reason, /^Opened the construction site viewer: http:\/\/127\.0\.0\.1:/);
    assert.equal((await req(s.port, 'GET', '/health')).json.lang, 'en');
    await req(s.port, 'POST', '/prefs', { settings: { lang: 'ko' } });
    assert.match((await block()).json.reason, /^공사현장 뷰어를 열었어요/);
    assert.equal((await req(s.port, 'POST', '/open', {})).json.lang, 'ko');
    // 시작 안내도 같은 설정을 따른다
    const input = JSON.stringify({ session_id: 'x', cwd: '/p', source: 'startup' });
    const ko = spawnSync(process.execPath, [START], { env: s.env, input, encoding: 'utf8', timeout: 5000 });
    assert.match(JSON.parse(ko.stdout).systemMessage, /^공사현장 뷰어: /);
    await req(s.port, 'POST', '/prefs', { settings: { lang: '' } });
    const en = spawnSync(process.execPath, [START], { env: s.env, input, encoding: 'utf8', timeout: 5000 });
    assert.match(JSON.parse(en.stdout).systemMessage, /^Construction site viewer: .*type "construction site"/);
  } finally {
    s.stop();
  }
});

test('다른 사이트에서 온 요청은 거절한다', async () => {
  const s = await boot();
  try {
    const hook = { session_id: 's1', cwd: '/p', prompt: 'x' };
    assert.equal((await req(s.port, 'GET', '/events', undefined, { Host: 'evil.example' })).status, 403);
    assert.equal((await req(s.port, 'GET', '/config', undefined, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await req(s.port, 'GET', '/config', undefined, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    assert.equal((await req(s.port, 'POST', '/hook/UserPromptSubmit', hook, { Origin: 'null' })).status, 403);
    assert.equal((await req(s.port, 'POST', '/hook/UserPromptSubmit', JSON.stringify(hook), { 'Content-Type': 'text/plain' })).status, 415);
    assert.equal((await req(s.port, 'GET', '/js/../../server/server.js')).status, 404);
    assert.equal((await req(s.port, 'GET', '/config')).status, 200);
  } finally {
    s.stop();
  }
});

test('디스크에는 펫 이름과 설정만 남긴다', async () => {
  const s = await boot();
  try {
    const r = await req(s.port, 'POST', '/prefs', {
      names: { claude: '문어씨', 'bad key!': 'x', gpt: 'ㄱ'.repeat(40) },
      settings: { autoOpen: true, birthday: '05-12', secret: 'nope' },
      prompt: 'should not be stored',
    });
    assert.deepEqual(Object.keys(r.json).sort(), ['names', 'settings']);
    assert.equal(r.json.names.claude, '문어씨');
    assert.equal(r.json.names['bad key!'], undefined);
    assert.equal([...r.json.names.gpt].length, 12);
    assert.deepEqual(r.json.settings, { autoOpen: true, announce: true, birthday: '05-12', lang: '', appWindow: true, win: null });

    // 언어, 전용 창, 창 크기: 정해진 값만 받는다
    const w = await req(s.port, 'POST', '/prefs', { settings: { lang: 'en', appWindow: false, win: { preset: 'wide', w: 1260.4, h: 540, x: 'no' } } });
    assert.deepEqual(w.json.settings.win, { preset: 'wide', w: 1260, h: 540 });
    assert.equal(w.json.settings.lang, 'en');
    assert.equal(w.json.settings.appWindow, false);
    const bad = await req(s.port, 'POST', '/prefs', { settings: { lang: 'xx', appWindow: 'yes', win: { preset: '<b>', w: 5, h: 99999 } } });
    assert.equal(bad.json.settings.lang, 'en', '모르는 언어는 무시한다');
    assert.equal(bad.json.settings.appWindow, false);
    assert.deepEqual(bad.json.settings.win, { preset: '', w: 1280, h: 400 }, '말이 안 되는 크기는 기본 크기로 돌린다');

    await req(s.port, 'POST', '/hook/UserPromptSubmit', { session_id: 's1', cwd: '/p', prompt: 'TOP-SECRET-PROMPT' });
    await sleep(100);
    const files = fs.readdirSync(s.data);
    assert.deepEqual(files, ['prefs.json']);
    assert.ok(!fs.readFileSync(path.join(s.data, 'prefs.json'), 'utf8').includes('TOP-SECRET'));
  } finally {
    s.stop();
  }
});

test('세션이 모두 끝나면 스스로 꺼진다', async () => {
  const s = await boot();
  try {
    await req(s.port, 'POST', '/hook/SessionStart', { session_id: 'a', cwd: '/p', source: 'startup' });
    await req(s.port, 'POST', '/hook/SessionStart', { session_id: 'b', cwd: '/q', source: 'startup' });
    await req(s.port, 'POST', '/hook/SessionEnd', { session_id: 'a', cwd: '/p', reason: 'other' });
    await sleep(600);
    assert.equal((await req(s.port, 'GET', '/health')).json.sessions, 1, '세션이 남아 있으면 계속 돈다');
    await req(s.port, 'POST', '/hook/SessionEnd', { session_id: 'b', cwd: '/q', reason: 'other' });
    assert.ok(await waitDown(s.port, 3000), '마지막 세션이 끝났는데 서버가 살아 있다');
  } finally {
    s.stop();
  }
});

test('시작 스크립트는 서버를 띄우고, JSON만 출력하고, 바로 끝난다', async () => {
  const port = await freePort();
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-data-'));
  const env = { ...process.env, CONSTRUCTION_PETS_PORT: String(port), CONSTRUCTION_PETS_DATA: data,
    CONSTRUCTION_PETS_NO_OPEN: '1', CONSTRUCTION_PETS_GRACE_MS: '300', LANG: 'ko_KR.UTF-8' };
  delete env.CLAUDE_PLUGIN_DATA; delete env.LC_ALL; delete env.LC_MESSAGES;
  const input = JSON.stringify({ session_id: 'boot', cwd: '/tmp/my-project', hook_event_name: 'SessionStart', source: 'startup' });
  try {
    const t0 = Date.now();
    const first = spawnSync(process.execPath, [START], { env, input, encoding: 'utf8', timeout: 5000 });
    assert.equal(first.status, 0);
    assert.ok(Date.now() - t0 < 3000, '시작 스크립트가 너무 오래 걸린다');
    assert.match(JSON.parse(first.stdout).systemMessage, /공사현장 뷰어/);
    const health = (await req(port, 'GET', '/health')).json;
    assert.equal(health.name, 'construction-pets');
    assert.equal(health.sessions, 1);

    // 이미 떠 있으면 새로 띄우지 않는다. 이어 붙인 세션에는 안내를 반복하지 않는다.
    const again = spawnSync(process.execPath, [START], { env, encoding: 'utf8', timeout: 5000,
      input: JSON.stringify({ session_id: 'boot', cwd: '/tmp/my-project', source: 'resume' }) });
    assert.equal(again.status, 0);
    assert.equal(again.stdout, '');
    assert.equal((await req(port, 'GET', '/health')).json.sessions, 1);
  } finally {
    await req(port, 'POST', '/hook/SessionEnd', { session_id: 'boot', cwd: '/tmp/my-project', reason: 'other' }).catch(() => {});
    assert.ok(await waitDown(port, 3000));
  }
});

function run(file, env, input) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [file], { env, stdio: ['pipe', 'pipe', 'ignore'] });
    let stdout = '';
    child.stdout.on('data', (c) => { stdout += c; });
    child.on('close', (status) => resolve({ status, stdout }));
    child.stdin.end(input || '');
  });
}

test('플러그인을 올리면 시작 스크립트가 예전 버전 서버를 내리고 새로 띄운다', async () => {
  // 예전 버전인 척하는 서버: /health만 다른 버전으로 답하고, /quit을 받으면 꺼진다
  const port = await freePort();
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-data-'));
  let quitBody = null;
  const old = http.createServer((q, r) => {
    if (q.url === '/health') { r.writeHead(200, { 'Content-Type': 'application/json' }); return r.end(JSON.stringify({ ok: true, name: 'construction-pets', version: '0.0.1' })); }
    if (q.url === '/quit') {
      let buf = ''; q.on('data', (c) => { buf += c; });
      return q.on('end', () => { quitBody = JSON.parse(buf); r.writeHead(200, { 'Content-Type': 'application/json' }); r.end('{}'); old.close(); old.closeAllConnections(); });
    }
    r.writeHead(404); r.end();
  });
  await new Promise((r) => old.listen(port, '127.0.0.1', r));
  const env = { ...process.env, CONSTRUCTION_PETS_PORT: String(port), CONSTRUCTION_PETS_DATA: data, CONSTRUCTION_PETS_NO_OPEN: '1', CONSTRUCTION_PETS_GRACE_MS: '300', LANG: 'ko_KR.UTF-8' };
  delete env.CLAUDE_PLUGIN_DATA;
  try {
    const out = await run(START, env, JSON.stringify({ session_id: 'up', cwd: '/tmp/p', source: 'startup' }));
    assert.equal(out.status, 0);
    const version = require(path.join(PLUGIN, '.claude-plugin', 'plugin.json')).version;
    assert.equal(quitBody.version, version);
    const health = (await req(port, 'GET', '/health')).json;
    assert.equal(health.version, version, '새 버전 서버가 떠 있다');
    assert.equal(health.sessions, 1);
    // 같은 버전끼리는 내리지 않는다
    assert.equal((await req(port, 'POST', '/quit', { version })).status, 409);
    assert.equal((await req(port, 'GET', '/health')).status, 200);
  } finally {
    await req(port, 'POST', '/hook/SessionEnd', { session_id: 'up', cwd: '/tmp/p', reason: 'other' }).catch(() => {});
    assert.ok(await waitDown(port, 3000));
  }
});

test('그 포트를 다른 프로그램이 쓰고 있으면 조용히 물러난다', async () => {
  const port = await freePort();
  const other = http.createServer((q, r) => r.end('someone else')).listen(port, '127.0.0.1');
  await new Promise((r) => other.once('listening', r));
  const env = { ...process.env, CONSTRUCTION_PETS_PORT: String(port), CONSTRUCTION_PETS_NO_OPEN: '1' };
  try {
    const first = await run(START, env, JSON.stringify({ session_id: 'x', cwd: '/p', source: 'startup' }));
    assert.equal(first.status, 0);
    assert.equal(first.stdout, '');
    const direct = await run(SERVER, env);
    assert.equal(direct.status, 0);
  } finally {
    other.close();
  }
});

function lanReq(port, urlPath, headers, method) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, path: urlPath, method: method || 'GET', headers: headers || {} }, (res) => {
      const chunks = [];
      const done = () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') });
      // 이벤트 스트림은 끝나지 않으므로 첫 화면(snapshot)까지만 읽고 끊는다
      if (String(res.headers['content-type']).includes('event-stream')) setTimeout(() => { res.destroy(); done(); }, 250);
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', () => {});
    });
    r.on('error', reject);
    r.end();
  });
}

test('폰에서 보기는 켰을 때만 열리고, 열쇠가 있어야 하며, 보기만 된다', async () => {
  const lanPort = await freePort();
  const s = await boot({ CONSTRUCTION_PETS_LAN_PORT: String(lanPort) });
  try {
    assert.equal((await req(s.port, 'GET', '/lan')).json.on, false);
    await assert.rejects(lanReq(lanPort, '/'), '끈 상태에서는 포트가 닫혀 있어야 한다');

    const on = (await req(s.port, 'POST', '/lan', { on: true })).json;
    assert.equal(on.on, true);
    assert.equal(on.port, lanPort);
    const key = (await req(s.port, 'GET', '/lan')).json.urls.map((u) => new URL(u.url).searchParams.get('k'))[0]
      || JSON.parse(fs.readFileSync(path.join(s.data, 'prefs.json'), 'utf8')).lan.key;
    assert.match(key, /^[0-9a-f]{16}$/);
    for (const u of on.urls) assert.match(u.url, new RegExp(`^http://\\d+\\.\\d+\\.\\d+\\.\\d+:${lanPort}/\\?k=${key}$`));

    // 열쇠 없이, 틀린 열쇠로는 아무것도 못 본다
    assert.equal((await lanReq(lanPort, '/')).status, 403);
    assert.equal((await lanReq(lanPort, '/?k=0000000000000000')).status, 403);
    assert.equal((await lanReq(lanPort, '/events')).status, 403);
    assert.equal((await lanReq(lanPort, '/config', { Cookie: 'cp_k=ffffffffffffffff' })).status, 403);

    // 열쇠로 들어오면 쿠키를 받고, 그 뒤로는 쿠키로 본다
    const page = await lanReq(lanPort, '/?k=' + key);
    assert.equal(page.status, 200);
    assert.match(page.text, /공사현장 펫 뷰어/);
    const cookie = String(page.headers['set-cookie']).split(';')[0];
    assert.equal(cookie, 'cp_k=' + key);
    assert.match(String(page.headers['set-cookie']), /HttpOnly; SameSite=Strict/);
    assert.equal((await lanReq(lanPort, '/js/main.js', { Cookie: cookie })).status, 200);
    assert.equal((await lanReq(lanPort, '/shared/qr.js', { Cookie: cookie })).status, 200);
    const cfg = JSON.parse((await lanReq(lanPort, '/config', { Cookie: cookie })).text);
    assert.equal(cfg.remote, true);
    assert.deepEqual(Object.keys(cfg.prefs).sort(), ['names', 'settings'], '열쇠는 설정에 실려 나가지 않는다');
    assert.ok(!JSON.stringify(cfg).includes(key));
    const sse = await lanReq(lanPort, '/events', { Cookie: cookie });
    assert.equal(sse.status, 200);
    assert.match(sse.text, /event: snapshot/);

    // 보기만: 훅, 설정 저장, 파일 보기, 브라우저 열기는 이 포트에 없다
    assert.equal((await lanReq(lanPort, '/hook/Stop', { Cookie: cookie, 'Content-Type': 'application/json' }, 'POST')).status, 405);
    assert.equal((await lanReq(lanPort, '/prefs', { Cookie: cookie, 'Content-Type': 'application/json' }, 'POST')).status, 405);
    assert.equal((await lanReq(lanPort, '/file?site=x&path=y', { Cookie: cookie })).status, 404);
    assert.equal((await lanReq(lanPort, '/lan', { Cookie: cookie })).status, 404);
    assert.equal((await lanReq(lanPort, '/js/../../server/server.js', { Cookie: cookie })).status, 404);

    // 이름 저장 같은 다른 설정을 바꿔도 폰에서 보기 상태는 그대로다. 밖에서 넣은 lan 값은 무시한다.
    await req(s.port, 'POST', '/prefs', { names: { claude: '문어씨' }, lan: { on: false, key: 'aaaaaaaaaaaaaaaa' } });
    assert.equal((await lanReq(lanPort, '/config', { Cookie: cookie })).status, 200);

    // 끄면 포트가 닫히고, 다시 켜면 열쇠가 바뀐다
    assert.equal((await req(s.port, 'POST', '/lan', { on: false })).json.on, false);
    await sleep(100);
    await assert.rejects(lanReq(lanPort, '/?k=' + key));
    const again = (await req(s.port, 'POST', '/lan', { on: true })).json;
    assert.equal(again.on, true);
    assert.equal((await lanReq(lanPort, '/?k=' + key)).status, 403, '옛 열쇠는 더 통하지 않는다');
  } finally {
    s.stop();
  }
});

test('폰에서 보기 포트를 다른 프로그램이 쓰고 있으면 켜지지 않고 이유를 알린다', async () => {
  const lanPort = await freePort();
  const other = http.createServer((q, r) => r.end('someone else')).listen(lanPort, '0.0.0.0');
  await new Promise((r) => other.once('listening', r));
  const s = await boot({ CONSTRUCTION_PETS_LAN_PORT: String(lanPort) });
  try {
    const r = (await req(s.port, 'POST', '/lan', { on: true })).json;
    assert.equal(r.on, false);
    assert.equal(r.error, 'port-in-use');
    assert.equal((await req(s.port, 'GET', '/health')).status, 200, 'PC 쪽 서버는 계속 돈다');
  } finally {
    s.stop();
    other.close();
  }
});
