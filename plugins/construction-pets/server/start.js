#!/usr/bin/env node
'use strict';
// SessionStart command 훅이 부르는 스크립트.
//  1) 서버가 떠 있는지 본다. 없으면 분리된 프로세스로 띄우고 바로 끝난다.
//  2) SessionStart 이벤트를 서버에 넘긴다(SessionStart는 HTTP 훅을 못 써서 여기서 대신 보낸다).
//  3) 표준 출력에는 JSON만 쓴다. 일반 텍스트를 쓰면 Claude의 컨텍스트에 들어가 토큰을 쓰기 때문이다.
// 어떤 경우에도 0으로 끝나고, Claude Code의 작업을 막지 않는다.

const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { msg, langOf } = require('./messages.js');

const VERSION = require('../.claude-plugin/plugin.json').version;
const HOST = '127.0.0.1';
const PORT = Number(process.env.CONSTRUCTION_PETS_PORT) || 47821;
const DATA_DIR = process.env.CONSTRUCTION_PETS_DATA || process.env.CLAUDE_PLUGIN_DATA
  || path.join(os.homedir(), '.construction-pets');

function request(method, urlPath, body, timeoutMs) {
  return new Promise((resolve) => {
    const data = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const req = http.request({
      host: HOST, port: PORT, path: urlPath, method, timeout: timeoutMs,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {},
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* 본문 없음 */ }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
    if (data) req.write(data);
    req.end();
  });
}

function readStdin(timeoutMs) {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve(null);
    const chunks = [];
    const done = () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { resolve(null); }
    };
    const timer = setTimeout(done, timeoutMs);
    process.stdin.on('data', (c) => chunks.push(c));
    process.stdin.on('end', () => { clearTimeout(timer); done(); });
    process.stdin.on('error', () => { clearTimeout(timer); resolve(null); });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function isOurs() {
  const r = await request('GET', '/health', undefined, 200);
  if (!r) return 'down';
  if (!r.json || r.json.name !== 'construction-pets') return 'foreign';
  return r.json.version === VERSION ? 'up' : 'old';
}

function readSettings() {
  try {
    const prefs = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'prefs.json'), 'utf8'));
    return (prefs && prefs.settings) || {};
  } catch {
    return {};
  }
}

async function main() {
  const payload = await readStdin(800);
  let state = await isOurs();
  if (state === 'foreign') return; // 그 포트를 다른 프로그램이 쓰는 중. 조용히 끝낸다.

  // 플러그인을 올린 뒤 예전 버전 서버가 아직 떠 있으면 내리고 새로 띄운다.
  // 0.2.0 서버는 이 요청을 모른다. 그때는 그대로 쓰고, 마지막 세션이 끝나 서버가 꺼진 뒤부터 새 버전이 뜬다.
  if (state === 'old') {
    const bye = await request('POST', '/quit', { version: VERSION }, 400);
    state = 'up';
    if (bye && bye.status === 200) {
      for (let i = 0; i < 10 && state !== 'down'; i++) { await sleep(60); state = await isOurs(); }
      if (state !== 'down') state = 'up';
    }
  }

  if (state === 'down') {
    const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
      detached: true, stdio: 'ignore', windowsHide: true,
      env: { ...process.env, CONSTRUCTION_PETS_DATA: DATA_DIR },
    });
    child.on('error', () => {});
    child.unref();
    for (let i = 0; i < 10 && state !== 'up'; i++) { // Windows는 첫 실행이 느릴 수 있어 넉넉히 기다린다(최대 3초쯤)
      await sleep(100);
      state = await isOurs();
    }
    if (state !== 'up') return;
  }

  if (payload) await request('POST', '/hook/SessionStart', payload, 800);

  const settings = readSettings();
  const fresh = !payload || payload.source === undefined || payload.source === 'startup';
  if (fresh && settings.autoOpen === true) await request('POST', '/open', {}, 800);
  if (fresh && settings.announce !== false) {
    return JSON.stringify({ systemMessage: msg(langOf(settings), 'announce', { url: `http://${HOST}:${PORT}` }) });
  }
}

// 표준 입력이 열려 있어도 기다리지 않고 끝낸다.
main().catch(() => undefined).then((out) => {
  if (typeof out === 'string') process.stdout.write(out, () => process.exit(0));
  else process.exit(0);
});
