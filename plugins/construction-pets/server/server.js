#!/usr/bin/env node
'use strict';
// 공사현장 펫 뷰어의 로컬 서버. 외부 패키지를 쓰지 않는다.
//  - Claude Code 훅이 보낸 이벤트를 받아(POST /hook/<이벤트>) 뷰어에 밀어준다(GET /events, SSE).
//  - 훅에는 받자마자 본문 없는 200으로 답한다. Claude Code의 작업을 기다리게 하지 않는다.
//  - 유일하게 답을 돌려주는 경우는 '공사현장' 입력을 막고 뷰어 창을 여는 것 하나다.
//  - 기본은 127.0.0.1에만 붙는다. '폰에서 보기'를 켰을 때만 읽기 전용 뷰어 포트를 같은 네트워크에 연다.
//  - 프롬프트와 코드는 디스크에 쓰지 않는다.

const http = require('node:http');
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { openViewer: launchViewer, cleanSize } = require('./open.js');
const { msg, langOf, isOpenWord } = require('./messages.js');
const R = require('../shared/reduce.js');
const { normalize, relPath, countLines, cut } = require('./normalize.js');

const VERSION = require('../.claude-plugin/plugin.json').version;
const HOST = '127.0.0.1';
const PORT = Number(process.env.CONSTRUCTION_PETS_PORT) || 47821;
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = process.env.CONSTRUCTION_PETS_DATA || process.env.CLAUDE_PLUGIN_DATA
  || path.join(os.homedir(), '.construction-pets');
const GRACE_MS = Number(process.env.CONSTRUCTION_PETS_GRACE_MS) || 30000;      // 마지막 세션이 끝난 뒤 기다리는 시간
const IDLE_MS = Number(process.env.CONSTRUCTION_PETS_IDLE_MS) || 24 * 3600e3;  // 하루 동안 아무 이벤트도 없으면 스스로 끝낸다
const NO_OPEN = process.env.CONSTRUCTION_PETS_NO_OPEN === '1';
const LAN_PORT = Number(process.env.CONSTRUCTION_PETS_LAN_PORT) || PORT + 1; // 폰에서 보기용(읽기 전용)
const URL_BASE = `http://${HOST}:${PORT}`;
const MAX_BODY = 8 * 1024 * 1024;
const MAX_FILE = 256 * 1024;
const MAX_SITES = 12;

const HOOK_EVENTS = new Set([
  'SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure',
  'SubagentStart', 'SubagentStop', 'TaskCreated', 'TaskCompleted', 'PermissionRequest',
  'Notification', 'Stop', 'StopFailure', 'PreCompact', 'PostCompact', 'SessionEnd',
]);
const EVENT_TYPES = new Set([
  'session_start', 'prompt', 'tool_pre', 'tool_post', 'tool_fail', 'agent_start', 'agent_stop',
  'task_created', 'task_completed', 'tasks_set', 'permission', 'idle', 'stop', 'stop_fail',
  'compact', 'session_end',
]);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8',
};

const sites = new Map();     // siteId -> { state, cwd, files: Map<상대경로, 절대경로>, chain }
const sessions = new Map();  // session_id -> { siteId, cwd }
const clients = new Set();
let hadSession = false;
let shutdownTimer = null;
let idleTimer = null;
let opens = 0;
let lastOpenAt = 0;

// ---------- 공사장 상태 ----------

function siteIdFor(key) {
  return crypto.createHash('sha1').update(String(key)).digest('hex').slice(0, 10);
}

function siteFor(key, name) {
  const id = siteIdFor(key);
  let site = sites.get(id);
  if (!site) {
    site = { state: R.newSite(id, name), cwd: null, files: new Map(), chain: Promise.resolve() };
    sites.set(id, site);
    if (sites.size > MAX_SITES) {
      let oldest = null;
      for (const [sid, s] of sites) {
        if (sid === id || Object.keys(s.state.pets).length) continue;
        if (!oldest || s.state.updatedAt < sites.get(oldest).state.updatedAt) oldest = sid;
      }
      if (oldest) sites.delete(oldest);
    }
  }
  return site;
}

function broadcast(event, data) {
  const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(frame);
}

function snapshot() {
  return {
    version: VERSION,
    sites: [...sites.values()].map((s) => s.state),
  };
}

async function totalLines(abs) {
  try {
    const st = await fsp.stat(abs);
    if (!st.isFile() || st.size > 2 * 1024 * 1024) return 0;
    return countLines(await fsp.readFile(abs, 'utf8'));
  } catch {
    return 0;
  }
}

// 정규화된 이벤트 하나를 상태에 반영하고 뷰어에 보낸다. 공사장마다 순서를 지킨다.
function ingest(ev, siteKey, siteName, absFile) {
  const site = siteFor(siteKey, siteName);
  ev.site = site.state.id;
  ev.ts = Date.now();
  site.chain = site.chain.then(async () => {
    if (ev.type === 'session_start') ev.siteName = siteName || site.state.name;
    if (ev.type === 'tool_post' && ev.kind === 'edit' && ev.file) {
      if (absFile) {
        site.files.set(ev.file, absFile);
        const n = await totalLines(absFile);
        if (n) ev.lines = n;
      }
    }
    R.apply(site.state, ev);
    broadcast('ev', ev);
  }).catch(() => {});
  return site;
}

function trackSession(ev, cwd) {
  if (ev.type === 'session_end') {
    sessions.delete(ev.session);
    if (hadSession && sessions.size === 0) armShutdown();
    return;
  }
  if (!sessions.has(ev.session)) {
    sessions.set(ev.session, { cwd });
    hadSession = true;
  }
  if (shutdownTimer) { clearTimeout(shutdownTimer); shutdownTimer = null; }
}

function armShutdown() {
  if (shutdownTimer) clearTimeout(shutdownTimer);
  shutdownTimer = setTimeout(() => { if (sessions.size === 0) shutdown(); }, GRACE_MS);
}

function touchIdle() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(shutdown, IDLE_MS);
  idleTimer.unref();
}

function shutdown() {
  for (const res of clients) { try { res.end(); } catch { /* 이미 닫힘 */ } }
  stopLan();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 500).unref();
}

// ---------- 훅 처리 ----------

function handleHook(name, payload) {
  touchIdle();
  const session = String(payload.session_id || 'unknown');
  const known = sessions.get(session);
  const cwd = (known && known.cwd) || payload.cwd || 'unknown';
  const events = normalize(name, payload);
  for (const ev of events) {
    trackSession(ev, cwd);
    let abs = null;
    if (ev.type === 'tool_post' && ev.kind === 'edit' && payload.tool_input) {
      const raw = payload.tool_input.file_path || payload.tool_input.notebook_path;
      if (typeof raw === 'string' && path.isAbsolute(raw)) {
        abs = raw;
        ev.file = relPath(raw, cwd); // cd로 작업 폴더가 바뀌어도 건물 이름은 프로젝트 기준으로 둔다
      }
    } else if (ev.file && payload.tool_input) {
      const raw = payload.tool_input.file_path || payload.tool_input.notebook_path;
      if (typeof raw === 'string') ev.file = relPath(raw, cwd);
    }
    ingest(ev, cwd, path.basename(String(cwd).replace(/\\/g, '/')) || '공사현장', abs);
  }
}

function isOpenRequest(payload) {
  return typeof payload.prompt === 'string' && isOpenWord(payload.prompt);
}

// 뷰어를 띄운다. 설정에 따라 전용 창(앱 창)이나 기본 브라우저의 탭으로 연다.
function openBrowser(url) {
  opens++;
  lastOpenAt = Date.now();
  if (NO_OPEN) return;
  const s = readPrefs().settings;
  launchViewer(url, { appWindow: s.appWindow !== false, size: s.win, dataDir: DATA_DIR });
}

function lang() {
  return langOf(readPrefs().settings);
}

// ---------- 설정과 이름 저장 ----------

const PREFS_FILE = path.join(DATA_DIR, 'prefs.json');

function defaultPrefs() {
  return { names: {}, settings: { autoOpen: false, announce: true, birthday: '', lang: '', appWindow: true, win: null }, lan: { on: false, key: '' } };
}

// 뷰어에 내보내는 설정. 폰에서 보기의 열쇠는 여기에 넣지 않는다.
function publicPrefs(prefs) {
  return { names: prefs.names, settings: prefs.settings };
}

function readPrefs() {
  try {
    const raw = JSON.parse(fs.readFileSync(PREFS_FILE, 'utf8'));
    return cleanPrefs(raw, { ...defaultPrefs(), lan: raw && raw.lan });
  } catch {
    return defaultPrefs();
  }
}

// 저장하는 것은 펫 이름과 뷰어 설정뿐이다. 그 밖의 값은 버린다.
function cleanPrefs(incoming, base) {
  const out = { names: { ...base.names }, settings: { ...base.settings }, lan: { on: false, key: '' } };
  const lanFrom = base.lan || {}; // 폰에서 보기 상태는 /lan으로만 바꾼다. 들어온 값은 쓰지 않는다
  if (lanFrom.on === true && /^[0-9a-f]{16}$/.test(String(lanFrom.key))) out.lan = { on: true, key: lanFrom.key };
  if (incoming && typeof incoming.names === 'object' && incoming.names) {
    for (const [k, v] of Object.entries(incoming.names)) {
      if (typeof k !== 'string' || k.length > 40 || !/^[\w:.-]+$/.test(k)) continue;
      if (v === null || v === '') { delete out.names[k]; continue; }
      if (typeof v === 'string') out.names[k] = [...v.replace(/[\u0000-\u001f]/g, '')].slice(0, 12).join('');
    }
    const keys = Object.keys(out.names);
    for (const k of keys.slice(0, Math.max(0, keys.length - 60))) delete out.names[k];
  }
  if (incoming && typeof incoming.settings === 'object' && incoming.settings) {
    const s = incoming.settings;
    if (typeof s.autoOpen === 'boolean') out.settings.autoOpen = s.autoOpen;
    if (typeof s.announce === 'boolean') out.settings.announce = s.announce;
    if (typeof s.birthday === 'string' && (/^\d\d-\d\d$/.test(s.birthday) || s.birthday === '')) {
      out.settings.birthday = s.birthday;
    }
    if (s.lang === 'ko' || s.lang === 'en' || s.lang === '') out.settings.lang = s.lang;
    if (typeof s.appWindow === 'boolean') out.settings.appWindow = s.appWindow;
    if (s.win && typeof s.win === 'object') { // 전용 창의 크기와 고른 모양
      const size = cleanSize(s.win);
      out.settings.win = { preset: /^[a-z]{0,12}$/.test(String(s.win.preset || '')) ? String(s.win.preset || '') : '', w: size.w, h: size.h };
    }
  }
  return out;
}

function writePrefs(prefs) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = PREFS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(prefs, null, 2));
  fs.renameSync(tmp, PREFS_FILE);
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function readSkins() {
  const dir = path.join(ROOT, 'skins');
  const out = {};
  let names = [];
  try { names = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).slice(0, 20); } catch { /* 폴더 없음 */ }
  for (const f of names) {
    try {
      const full = path.join(dir, f);
      if (fs.statSync(full).size > 64 * 1024) continue;
      out[path.basename(f, '.json')] = JSON.parse(fs.readFileSync(full, 'utf8'));
    } catch { /* 잘못된 스킨은 건너뛴다 */ }
  }
  return out;
}

function config() {
  return {
    version: VERSION,
    url: URL_BASE,
    pets: readJson(path.join(ROOT, 'config', 'pets.json'), null),
    seasons: readJson(path.join(ROOT, 'config', 'seasons.json'), null),
    skins: readSkins(),
    prefs: publicPrefs(readPrefs()),
  };
}

// ---------- HTTP ----------

const ALLOWED_HOSTS = new Set([`${HOST}:${PORT}`, `localhost:${PORT}`]);
const ALLOWED_ORIGINS = new Set([`http://${HOST}:${PORT}`, `http://localhost:${PORT}`]);

// 브라우저의 다른 사이트가 이 서버를 읽거나 조작하지 못하게 한다.
function guard(req) {
  if (!ALLOWED_HOSTS.has(String(req.headers.host || ''))) return 403;
  const origin = req.headers.origin;
  if (origin !== undefined && !ALLOWED_ORIGINS.has(origin)) return 403;
  if (req.headers['sec-fetch-site'] === 'cross-site') return 403;
  if (req.method === 'POST' && !/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) return 415;
  return 0;
}

function send(res, code, body, type) {
  const buf = body === undefined ? Buffer.alloc(0) : Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  const headers = {
    'Content-Type': type || 'text/plain; charset=utf-8',
    'Content-Length': buf.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  if (res.cpCookie) headers['Set-Cookie'] = res.cpCookie;
  res.writeHead(code, headers);
  res.end(buf);
}

function sendJson(res, code, obj) {
  send(res, code, JSON.stringify(obj), MIME['.json']);
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    let over = false;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { over = true; return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (over) return resolve(null);
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { resolve(null); }
    });
    req.on('error', () => resolve(null));
  });
}

function serveStatic(res, urlPath) {
  let file;
  if (urlPath === '/' || urlPath === '/index.html') file = path.join(ROOT, 'viewer', 'index.html');
  else if (/^\/shared\/[\w-]+\.js$/.test(urlPath)) file = path.join(ROOT, urlPath);
  else if (/^\/js\/[\w.-]+\.js$/.test(urlPath)) file = path.join(ROOT, 'viewer', urlPath);
  else return send(res, 404, 'not found');
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'not found');
    send(res, 200, buf, MIME[path.extname(file)] || 'application/octet-stream');
  });
}

async function serveFile(res, query) {
  const site = sites.get(String(query.get('site') || ''));
  const rel = String(query.get('path') || '');
  const abs = site && site.files.get(rel);
  // 이번 세션에서 Claude가 다룬 파일만, 읽기만 한다.
  if (!abs) return sendJson(res, 404, { error: 'not-in-session' });
  try {
    const st = await fsp.stat(abs);
    if (!st.isFile()) return sendJson(res, 404, { error: 'gone' });
    const fd = await fsp.open(abs, 'r');
    try {
      const len = Math.min(st.size, MAX_FILE);
      const buf = Buffer.alloc(len);
      await fd.read(buf, 0, len, 0);
      if (buf.subarray(0, 8192).includes(0)) return sendJson(res, 200, { path: rel, binary: true });
      sendJson(res, 200, { path: rel, text: buf.toString('utf8'), truncated: st.size > MAX_FILE });
    } finally {
      await fd.close();
    }
  } catch {
    sendJson(res, 404, { error: 'gone' });
  }
}

function sanitizeEvent(raw) {
  if (!raw || typeof raw !== 'object' || !EVENT_TYPES.has(raw.type)) return null;
  const ev = { type: raw.type, session: cut(String(raw.session || 'adapter'), 80), ai: cut(String(raw.ai || 'other'), 16) };
  for (const k of ['agent', 'agentType', 'tool', 'kind', 'file', 'detail', 'text', 'id', 'subject', 'error', 'phase', 'source', 'reason']) {
    if (typeof raw[k] === 'string') ev[k] = raw[k].slice(0, 200);
  }
  for (const k of ['lines', 'gain', 'added', 'removed']) {
    if (Number.isFinite(raw[k])) ev[k] = Math.max(0, Math.min(1e6, Math.floor(raw[k])));
  }
  if (typeof raw.isNew === 'boolean') ev.isNew = raw.isNew;
  if (Array.isArray(raw.snippet)) ev.snippet = raw.snippet.slice(0, 10).map((l) => String(l).slice(0, 64));
  if (Array.isArray(raw.tasks)) {
    ev.tasks = raw.tasks.slice(0, 60).map((t) => ({ subject: cut(String(t && t.subject || ''), 60), done: !!(t && t.done) }));
  }
  return ev;
}

function stream(req, res) {
  const headers = {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  };
  if (res.cpCookie) headers['Set-Cookie'] = res.cpCookie;
  res.writeHead(200, headers);
  res.write('retry: 2000\n\n');
  res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot())}\n\n`);
  clients.add(res);
  req.on('close', () => clients.delete(res));
}

// ---------- 폰에서 보기 ----------
// 따로 켜야 열리는 두 번째 포트다. 같은 네트워크의 기기가 뷰어를 "보기만" 할 수 있다.
//  - 주소에 든 열쇠가 맞아야 한다. 열쇠는 켤 때마다 새로 만든다.
//  - GET만 받는다. 훅, 설정 저장, 파일 전체 보기, 브라우저 열기는 이 포트에 없다.

let lan = { on: false, key: '' };
let lanServer = null;
let lanError = null;

function lanAddresses() {
  const virtual = /vEthernet|WSL|Hyper-V|VirtualBox|VMware|vboxnet|docker|^br-|^veth|Tailscale|ZeroTier|Loopback|^utun|^tun|^tap/i;
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if ((a.family !== 'IPv4' && a.family !== 4) || a.internal || a.address.startsWith('169.254.')) continue;
      let score = a.address.startsWith('192.168.') ? 3 : a.address.startsWith('10.') ? 2 : /^172\.(1[6-9]|2\d|3[01])\./.test(a.address) ? 1 : 0;
      if (virtual.test(name)) score -= 10; // 가상 어댑터 주소는 폰에서 닿지 않는 일이 많아 뒤로 보낸다
      out.push({ name, address: a.address, score });
    }
  }
  return out.sort((x, y) => y.score - x.score);
}

function lanInfo() {
  const on = lan.on && !!lanServer;
  return {
    on,
    port: LAN_PORT,
    error: lanError,
    urls: on ? lanAddresses().map((a) => ({ name: a.name, url: `http://${a.address}:${LAN_PORT}/?k=${lan.key}` })) : [],
  };
}

function keyMatches(given) {
  if (!lan.on || typeof given !== 'string' || given.length !== lan.key.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(lan.key));
}

function lanHandler(req, res) {
  const deny = (code, text) => send(res, code, text || '');
  if (req.method !== 'GET') return deny(405);
  let url;
  try { url = new URL(req.url, 'http://lan'); } catch { return deny(400); }
  const fromQuery = url.searchParams.get('k');
  const fromCookie = (/(?:^|;\s*)cp_k=([0-9a-f]+)/.exec(String(req.headers.cookie || '')) || [])[1];
  if (!keyMatches(fromQuery) && !keyMatches(fromCookie)) {
    return deny(403, msg(/^ko\b/i.test(String(req.headers['accept-language'] || '')) ? 'ko' : 'en', 'lanDenied')); // 폰의 언어로 안내한다
  }
  // 한 번 열쇠로 들어오면 그 뒤 요청(스크립트, 이벤트)은 쿠키로 확인한다
  if (keyMatches(fromQuery)) res.cpCookie = `cp_k=${lan.key}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Strict`;
  const p = url.pathname;
  if (p === '/events') return stream(req, res);
  if (p === '/config') return sendJson(res, 200, { ...config(), url: null, remote: true });
  return serveStatic(res, p);
}

function startLan() {
  return new Promise((resolve) => {
    if (lanServer) return resolve(true);
    const srv = http.createServer((req, res) => {
      try { lanHandler(req, res); } catch { try { send(res, 500, ''); } catch { /* 이미 끊김 */ } }
    });
    srv.once('error', (err) => { lanError = err && err.code === 'EADDRINUSE' ? 'port-in-use' : 'listen-failed'; resolve(false); });
    srv.listen(LAN_PORT, '0.0.0.0', () => { lanServer = srv; lanError = null; resolve(true); });
  });
}

function stopLan() {
  if (!lanServer) return;
  const srv = lanServer;
  lanServer = null;
  srv.close();
  if (srv.closeAllConnections) srv.closeAllConnections();
}

async function setLan(on) {
  const prefs = readPrefs();
  if (on) {
    if (!lan.on) lan = { on: true, key: crypto.randomBytes(8).toString('hex') };
    if (!(await startLan())) lan = { on: false, key: '' };
  } else {
    lan = { on: false, key: '' };
    lanError = null;
    stopLan();
  }
  prefs.lan = { ...lan };
  try { writePrefs(prefs); } catch { /* 저장이 안 돼도 이번 실행 동안은 동작한다 */ }
  return lanInfo();
}

const server = http.createServer(async (req, res) => {
  const blocked = guard(req);
  if (blocked) return send(res, blocked, '');
  const url = new URL(req.url, URL_BASE);
  const p = url.pathname;

  if (req.method === 'POST' && p.startsWith('/hook/')) {
    const name = p.slice(6);
    if (!HOOK_EVENTS.has(name)) return send(res, 404, '');
    if (name !== 'UserPromptSubmit') {
      send(res, 200); // 받자마자 본문 없이 답하고, 처리는 그 뒤에 한다
      const payload = await readBody(req);
      if (payload) { try { handleHook(name, payload); } catch { /* 뷰어 쪽 문제로 훅을 건드리지 않는다 */ } }
      return;
    }
    const payload = await readBody(req);
    if (payload && isOpenRequest(payload)) {
      touchIdle();
      openBrowser(URL_BASE + '/');
      return sendJson(res, 200, {
        decision: 'block',
        reason: msg(lang(), 'opened', { url: URL_BASE }),
        hookSpecificOutput: { hookEventName: 'UserPromptSubmit', suppressOriginalPrompt: true },
      });
    }
    send(res, 200);
    if (payload) { try { handleHook(name, payload); } catch { /* 위와 같음 */ } }
    return;
  }

  // 다른 AI CLI용 어댑터와 가짜 이벤트 스크립트가 쓰는 길. 이미 정규화된 이벤트를 받는다.
  if (req.method === 'POST' && p === '/event') {
    const body = await readBody(req);
    const list = Array.isArray(body) ? body : [body];
    let n = 0;
    for (const raw of list.slice(0, 200)) {
      const ev = sanitizeEvent(raw);
      if (!ev) continue;
      touchIdle();
      const key = typeof raw.cwd === 'string' ? raw.cwd : 'name:' + String(raw.site || '공사현장');
      trackSession(ev, key);
      ingest(ev, key, cut(String(raw.site || path.basename(String(raw.cwd || '')) || '공사현장'), 40), null);
      n++;
    }
    return sendJson(res, 200, { accepted: n });
  }

  if (req.method === 'POST' && p === '/prefs') {
    const body = await readBody(req);
    if (!body) return sendJson(res, 400, { error: 'bad-json' });
    const next = cleanPrefs(body, readPrefs());
    try { writePrefs(next); } catch { return sendJson(res, 500, { error: 'write-failed' }); }
    broadcast('prefs', publicPrefs(next));
    return sendJson(res, 200, publicPrefs(next));
  }

  if (req.method === 'POST' && p === '/lan') {
    const body = await readBody(req);
    if (!body || typeof body.on !== 'boolean') return sendJson(res, 400, { error: 'bad-json' });
    return sendJson(res, 200, await setLan(body.on));
  }

  // 플러그인을 올린 뒤 새 버전의 시작 스크립트가 예전 서버를 내리는 길. 같은 버전이 보낸 요청은 무시한다.
  if (req.method === 'POST' && p === '/quit') {
    const body = await readBody(req);
    if (!body || typeof body.version !== 'string' || body.version === VERSION) return sendJson(res, 409, { version: VERSION });
    sendJson(res, 200, { bye: VERSION });
    return setTimeout(shutdown, 20);
  }

  if (req.method === 'POST' && p === '/open') {
    await readBody(req);
    if (Date.now() - lastOpenAt > 1500) openBrowser(URL_BASE + '/');
    return sendJson(res, 200, { url: URL_BASE, lang: lang() });
  }

  if (req.method !== 'GET') return send(res, 405, '');

  if (p === '/events') return stream(req, res);
  if (p === '/lan') return sendJson(res, 200, lanInfo());
  if (p === '/health') {
    return sendJson(res, 200, { ok: true, name: 'construction-pets', version: VERSION, sessions: sessions.size, viewers: clients.size, opens, lang: lang() });
  }
  if (p === '/config') return sendJson(res, 200, config());
  if (p === '/file') return serveFile(res, url.searchParams);
  return serveStatic(res, p);
});

// 뷰어 쪽 문제로 서버가 죽으면 훅마다 오류 알림이 뜬다. 예상 못 한 오류는 삼키고 계속 돈다.
process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});

server.on('error', (err) => {
  // 포트를 다른 프로그램이 쓰고 있으면 조용히 끝낸다. Claude Code는 영향을 받지 않는다.
  if (err && err.code === 'EADDRINUSE') process.exit(0);
  process.exit(1);
});

setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 20000).unref();

server.listen(PORT, HOST, () => {
  touchIdle();
  // 지난번에 폰에서 보기를 켜 두었다면 같은 열쇠로 다시 연다
  const saved = readPrefs().lan;
  if (saved && saved.on) { lan = { ...saved }; startLan().then((ok) => { if (!ok) lan = { on: false, key: '' }; }); }
  if (process.argv.includes('--print')) console.log(msg(lang(), 'print', { url: URL_BASE }));
});
