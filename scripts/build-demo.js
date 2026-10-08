#!/usr/bin/env node
'use strict';
// 뷰어를 파일 하나로 묶는다. 서버 없이 더블클릭으로 열어 가짜 이벤트로 구경하는 용도다.
//   node scripts/build-demo.js            -> demo.html (저장소 맨 위)
//   node scripts/build-demo.js --fragment <경로>  -> <head>/<body> 없는 조각(웹에 올릴 때)
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const plugin = path.join(root, 'plugins', 'construction-pets');
const html = fs.readFileSync(path.join(plugin, 'viewer', 'index.html'), 'utf8');

function between(name) {
  const a = html.indexOf(`<!--CP:${name}-START-->`), b = html.indexOf(`<!--CP:${name}-END-->`);
  if (a < 0 || b < 0) throw new Error('marker missing: ' + name);
  return html.slice(a + `<!--CP:${name}-START-->`.length, b).trim();
}

const boot = {
  pets: JSON.parse(fs.readFileSync(path.join(plugin, 'config', 'pets.json'), 'utf8')),
  seasons: JSON.parse(fs.readFileSync(path.join(plugin, 'config', 'seasons.json'), 'utf8')),
  skins: {},
};
const scripts = between('SCRIPTS').replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
  const file = src.startsWith('shared/') ? path.join(plugin, src) : path.join(plugin, 'viewer', src);
  return `<script>\n${fs.readFileSync(file, 'utf8').replace(/<\/script/g, '<\\/script')}\n</script>`;
});
const bootTag = `<script>window.CP_BOOT = ${JSON.stringify(boot).replace(/</g, '\\u003c')};</script>`;
const title = (html.match(/<title>[^<]*<\/title>/) || ['<title>공사현장 펫 뷰어</title>'])[0];
const fragment = [title, between('HEAD'), between('BODY'), bootTag, scripts].join('\n');

const i = process.argv.indexOf('--fragment');
if (i > 0) {
  fs.writeFileSync(process.argv[i + 1], fragment);
  console.log('wrote', process.argv[i + 1], fragment.length, 'bytes');
} else {
  const full = `<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${title}\n${between('HEAD')}\n</head>\n<body>\n${between('BODY')}\n${bootTag}\n${scripts}\n</body>\n</html>\n`;
  fs.writeFileSync(path.join(root, 'demo.html'), full);
  console.log('wrote demo.html', full.length, 'bytes');
}
