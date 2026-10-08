#!/usr/bin/env node
'use strict';
// 가짜 이벤트를 서버에 보낸다. Claude Code 없이 뷰어를 시험하는 용도다.
//   node server/server.js --print     (다른 터미널에서 서버를 띄우고)
//   node scripts/fake-events.js       (각본을 한 번 재생)
//   node scripts/fake-events.js --fast   (4배 빠르게)
//   node scripts/fake-events.js --en     (영어 각본)
const http = require('node:http');
const path = require('node:path');
const demo = require(path.join(__dirname, '..', 'viewer', 'js', 'demo.js'));

const PORT = Number(process.env.CONSTRUCTION_PETS_PORT) || 47821;
const speed = process.argv.includes('--fast') ? 4 : 1;
const lang = process.argv.includes('--en') ? 'en' : 'ko';

function post(ev) {
  return new Promise((resolve) => {
    const data = Buffer.from(JSON.stringify(ev));
    const req = http.request({ host: '127.0.0.1', port: PORT, path: '/event', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length } }, (res) => { res.resume(); res.on('end', () => resolve(true)); });
    req.on('error', () => resolve(false));
    req.end(data);
  });
}

(async () => {
  for (const step of demo.script(lang)) {
    await new Promise((r) => setTimeout(r, step.wait * 1000 / speed));
    if (step.ev.type === '__reset') break;
    const ok = await post(step.ev);
    if (!ok) {
      console.error(lang === 'en' ? `Cannot reach the server (127.0.0.1:${PORT}). Run node server/server.js first.`
        : `서버에 닿지 않아요 (127.0.0.1:${PORT}). 먼저 node server/server.js 를 실행하세요.`);
      process.exit(1);
    }
    console.log(step.ev.type, step.ev.session, step.ev.file || '');
  }
})();
