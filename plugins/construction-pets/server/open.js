'use strict';
// 뷰어를 띄운다. 먼저 주소창과 탭이 없는 "전용 창"(Edge/Chrome 계열의 앱 창)을 시도하고,
// 그런 브라우저가 없거나 사용자가 껐으면 기본 브라우저의 탭으로 연다.
// 명령은 셸을 거치지 않고 인자 배열로 실행한다(따옴표나 & 문제를 겪지 않는다).

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const DEFAULT_SIZE = { w: 1280, h: 400 }; // 가로로 긴 띠 모양

function isWsl() {
  try { return /microsoft/i.test(fs.readFileSync('/proc/version', 'utf8')); } catch { return false; }
}

// 기본 브라우저로 여는 명령 목록. 앞의 것이 없으면(실행 파일을 못 찾으면) 다음 것으로 넘어간다.
function openCommands(platform, url, wsl) {
  if (platform === 'win32') return [['rundll32', ['url.dll,FileProtocolHandler', url]], ['explorer.exe', [url]]];
  if (platform === 'darwin') return [['open', [url]]];
  if (wsl) return [['wslview', [url]], ['explorer.exe', [url]], ['xdg-open', [url]]]; // WSL에서는 Windows 쪽 브라우저를 연다
  return [['xdg-open', [url]], ['wslview', [url]]];
}

// 앱 창을 열 수 있는 브라우저의 후보 경로. Windows에는 Edge가 기본으로 깔려 있어 맨 앞에 둔다.
function appCandidates(platform, env, wsl) {
  const out = [];
  if (env.CONSTRUCTION_PETS_BROWSER) out.push(env.CONSTRUCTION_PETS_BROWSER);
  if (platform === 'win32') {
    const roots = [env['ProgramFiles(x86)'], env.ProgramFiles, env.LOCALAPPDATA].filter(Boolean);
    const apps = [
      ['Microsoft', 'Edge', 'Application', 'msedge.exe'],
      ['Google', 'Chrome', 'Application', 'chrome.exe'],
      ['Naver', 'Naver Whale', 'Application', 'whale.exe'],
      ['BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'],
    ];
    for (const app of apps) for (const root of roots) out.push(path.win32.join(root, ...app));
  } else if (platform === 'darwin') {
    const apps = [
      'Google Chrome.app/Contents/MacOS/Google Chrome', 'Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      'Chromium.app/Contents/MacOS/Chromium', 'Brave Browser.app/Contents/MacOS/Brave Browser',
    ];
    for (const app of apps) {
      out.push('/Applications/' + app);
      if (env.HOME) out.push(env.HOME + '/Applications/' + app);
    }
  } else {
    if (wsl) {
      out.push('/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/mnt/c/Program Files/Microsoft/Edge/Application/msedge.exe',
        '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe');
    }
    const names = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'microsoft-edge-stable', 'brave-browser'];
    const dirs = String(env.PATH || '').split(':').filter(Boolean);
    for (const name of names) for (const dir of dirs) out.push(dir + '/' + name);
  }
  return out;
}

function cleanSize(size) {
  const w = Math.round(Number(size && size.w)), h = Math.round(Number(size && size.h));
  if (!(w >= 240 && w <= 6000 && h >= 200 && h <= 4000)) return { ...DEFAULT_SIZE };
  return { w, h };
}

// 앱 창 인자. profileDir를 주면 전용 프로필로 띄운다: 이미 떠 있는 브라우저에 얹히지 않아서 창 크기가 그대로 먹고,
// 평소 쓰는 브라우저의 탭·확장 프로그램과 섞이지 않는다.
function appArgs(url, size, profileDir) {
  const s = cleanSize(size);
  const args = [`--app=${url}`, `--window-size=${s.w},${s.h}`, '--no-first-run', '--no-default-browser-check'];
  if (profileDir) args.push(`--user-data-dir=${profileDir}`);
  return args;
}

function run(tries, i, opts, onFail) {
  if (i >= tries.length) { if (onFail) onFail(); return; }
  let failed = false;
  const next = () => { if (!failed) { failed = true; run(tries, i + 1, opts, onFail); } };
  try {
    const child = spawn(tries[i][0], tries[i][1], { stdio: 'ignore', detached: true, ...opts });
    child.on('error', next);
    child.unref();
  } catch {
    next();
  }
}

function openInBrowser(url) {
  // 콘솔 창이 번쩍이지 않게 숨긴다(rundll32 같은 도우미는 그래도 브라우저를 정상으로 띄운다)
  run(openCommands(process.platform, url, process.platform === 'linux' && isWsl()), 0, { windowsHide: true });
}

// opts: { appWindow: 전용 창을 쓸지(기본 true), size: { w, h }, dataDir: 프로필을 둘 폴더 }
// 돌려주는 값: 'app' | 'browser' | null(열지 않음)
function openViewer(url, opts) {
  if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(url)) return null; // 이 서버의 뷰어 주소만 연다
  const o = opts || {};
  if (o.appWindow !== false) {
    const wsl = process.platform === 'linux' && isWsl();
    const found = appCandidates(process.platform, process.env, wsl).filter((p) => { try { return fs.statSync(p).isFile(); } catch { return false; } });
    if (found.length) {
      // WSL에서는 Windows 브라우저에 리눅스 경로를 프로필로 줄 수 없어 기본 프로필을 쓴다
      const profile = o.dataDir && !wsl ? path.join(o.dataDir, 'window-profile') : null;
      const args = appArgs(url, o.size, profile);
      // 브라우저 창 자체는 숨기면 안 된다(windowsHide를 켜면 창이 보이지 않게 뜰 수 있다)
      run(found.map((exe) => [exe, args]), 0, { windowsHide: false }, () => openInBrowser(url));
      return 'app';
    }
  }
  openInBrowser(url);
  return 'browser';
}

module.exports = { openViewer, openCommands, appCandidates, appArgs, cleanSize, DEFAULT_SIZE };
