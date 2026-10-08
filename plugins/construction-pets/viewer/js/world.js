// 하늘, 먼 배경, 땅, 건물을 그린다. 여기 있는 것은 모두 "그리기만" 하고 상태를 바꾸지 않는다.
// 캐릭터는 sprites.js와 pets.js 몫이고, 이 파일은 배경과 건물만 맡는다.
(function () {
  'use strict';
  var CP = window.CP;
  var PAL = CP.sprites.PAL;

  function R(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }

  // 바둑판 무늬로 반만 칠한다(레트로 게임의 반투명·그러데이션 표현). 무늬는 (x, y)에 붙어 따라다닌다.
  var patterns = {};
  function dither(g, x, y, w, h, c, sparse) {
    var key = c + (sparse ? ':s' : '');
    var p = patterns[key];
    if (!p) {
      var t = document.createElement('canvas');
      t.width = sparse ? 4 : 2; t.height = 2;
      var tg = t.getContext('2d');
      tg.fillStyle = c; tg.fillRect(0, 0, 1, 1);
      tg.fillRect(sparse ? 2 : 1, 1, 1, 1); // 촘촘하면 반, 성기면 넷 중 하나
      p = patterns[key] = g.createPattern(t, 'repeat');
    }
    x = Math.round(x); y = Math.round(y);
    g.save(); g.translate(x, y); g.fillStyle = p; g.fillRect(0, 0, Math.round(w), Math.round(h)); g.restore();
  }

  // 진행률에 따른 하늘. 값은 env.sky로 천천히 섞인다.
  var SKY = {
    dawn: { top: [62, 60, 112], bot: [235, 186, 164], tint: [150, 118, 176], alpha: 0.16, night: 0.3, dayT: 0.0 },
    day: { top: [140, 195, 228], bot: [226, 241, 243], tint: [255, 255, 255], alpha: 0.0, night: 0.0, dayT: 0.4 },
    dusk: { top: [112, 96, 152], bot: [247, 190, 146], tint: [240, 150, 104], alpha: 0.17, night: 0.2, dayT: 0.8 },
    night: { top: [18, 24, 48], bot: [46, 54, 96], tint: [34, 42, 96], alpha: 0.5, night: 1.0, dayT: 1.0 },
  };

  var WALLS = {
    js: '#ecdc9c', jsx: '#ecdc9c', ts: '#b4c8e2', tsx: '#b4c8e2', py: '#b2d2ae', rb: '#e6b4b8',
    css: '#e7bbd3', scss: '#e7bbd3', html: '#efd0aa', md: '#e2ddc8', json: '#cdc4ea', yml: '#cdc4ea', yaml: '#cdc4ea',
    go: '#b4dcd8', rs: '#dfc4a4', java: '#dcc3ae', sh: '#c9d6b6',
  };
  var WALL_FALLBACK = ['#e0d2b8', '#c6d8cf', '#dccadc', '#d2dbb9'];
  var ROOFS = ['#5f8f8a', '#5b6b8c', '#7a8c5a', '#8a6a85', '#6d7f93'];
  var FLAGS = ['#f2c230', '#6fb1d9', '#8fcb7a', '#e58a9a', '#b79ae0'];
  var CURTAINS = ['#f3ead2', '#f0c7d2', '#c9e3d0', '#cfd8ee'];

  function buildingLook(path) {
    var h = CP.hash(path), h2 = CP.hash('look:' + path);
    var ext = (path.split('.').pop() || '').toLowerCase();
    return {
      seed: h, seed2: h2,
      bw: 28 + (h % 3) * 4,
      wall: WALLS[ext] || WALL_FALLBACK[(h >>> 3) % WALL_FALLBACK.length],
      roof: ROOFS[(h >>> 6) % ROOFS.length],
      roofType: (h >>> 10) % 3,
      door: (h >>> 12) % 2,
      extra: (h >>> 14) % 4,
      mat: h2 % 3,              // 0 벽돌, 1 판자, 2 패널
      win: (h2 >>> 3) % 3,      // 0 오르내리창, 1 커튼, 2 꽃 상자
      awning: (h2 >>> 6) % 2,   // 줄무늬 차양
      ac: (h2 >>> 8) % 2,       // 실외기
      pipe: (h2 >>> 10) % 2,    // 빗물 홈통
    };
  }

  var FH = 10; // 한 층 높이

  // ---------- 건물 ----------
  // 건물 그림은 단계가 바뀔 때만 작은 캔버스에 새로 그려 두고, 매 프레임에는 그것을 찍기만 한다.
  // b: { look, floors, vis(0..4), done, rebuilt, flags, pop, smoke, clock }, x는 화면 기준 가운데.
  var PADX = 14, PADT = 44;

  function drawBuilding(g, b, x, gy, env) {
    var L = b.look, n = Math.max(1, b.floors);
    var key = [b.vis, n, b.done ? 1 : 0, b.rebuilt ? 1 : 0, env.season, env.theme || '', env.ground.leaf].join('|');
    var tw = L.bw + PADX * 2, th = 3 + n * FH + PADT;
    if (b._key !== key || !b._cv) {
      if (!b._cv) b._cv = document.createElement('canvas');
      b._cv.width = tw; b._cv.height = th;
      var tg = b._cv.getContext('2d');
      tg.clearRect(0, 0, tw, th);
      paintBuilding(tg, b, tw / 2, th, env);
      b._key = key;
    }
    var bounce = b.pop > 0 ? Math.round(Math.sin(b.pop * Math.PI) * 3) : 0;
    var dx = Math.round(x - tw / 2);
    // 한 단계 올라갈 때 살짝 늘어났다 돌아온다(바닥은 땅에 붙어 있다)
    g.drawImage(b._cv, 0, 0, tw, th, dx, gy - th - bounce, tw, th + bounce);
    var x0 = Math.round(x - L.bw / 2), top = gy - 3 - n * FH - bounce;
    drawFlags(g, b, x0, top, L.bw);
    if (b.done && !b.rebuilt && L.roofType === 1 && !env.reduced) { // 굴뚝 연기
      var cxm = x0 + L.bw - 8, cym = top - Math.floor((L.bw + 2) / 4) - 5;
      for (var s = 0; s < 3; s++) {
        var ph = ((b.clock || 0) * 0.5 + s / 3) % 1;
        R(g, cxm + Math.sin(ph * 5 + s) * 2 + ph * 3, cym - ph * 9, 2, 2, 'rgba(240,240,244,' + (0.55 * (1 - ph)).toFixed(2) + ')');
      }
    }
  }

  function paintBuilding(g, b, x, gy, env) {
    var L = b.look, bw = L.bw, n = Math.max(1, b.floors);
    var x0 = Math.round(x - bw / 2), wh = n * FH;
    var top = gy - 3 - wh;
    var vis = b.vis, i, k;
    var wood = '#b08a5e', woodD = '#8a6a4a';

    // 터: 말뚝과 줄, 측량 깃발
    if (vis <= 1) {
      R(g, x0 - 3, gy - 6, 1, 6, PAL.n); R(g, x0 + bw + 2, gy - 6, 1, 6, PAL.n);
      R(g, x0 - 3, gy - 5, bw + 6, 1, '#e9e2cc');
      for (i = x0; i < x0 + bw + 2; i += 6) R(g, i, gy - 5, 2, 1, PAL.r); // 빨간 띠가 섞인 줄
      R(g, x0 - 3, gy - 7, 1, 1, PAL.r); R(g, x0 + bw + 2, gy - 7, 1, 1, PAL.r);
      if (vis < 1) { // 측량 표시
        R(g, x0 + bw - 6, gy - 9, 1, 9, '#6c727a'); R(g, x0 + bw - 5, gy - 9, 3, 2, PAL.b);
        R(g, x0 + 4, gy - 1, 3, 1, '#e9e2cc'); R(g, x0 + 5, gy - 2, 1, 1, '#e9e2cc');
      }
    }
    if (vis < 1) return;

    // 1 터닦기: 기초 슬래브, 거푸집, 철근, 흙더미
    R(g, x0 - 2, gy - 3, bw + 4, 3, '#b3b2ab');
    R(g, x0 - 2, gy - 3, bw + 4, 1, '#c9c8c1');
    R(g, x0 - 2, gy - 1, bw + 4, 1, '#8f8e88');
    for (i = x0 + 2; i < x0 + bw; i += 7) R(g, i, gy - 2, 1, 1, '#9b9a94'); // 줄눈
    if (vis === 1) {
      R(g, x0 - 3, gy - 4, 1, 4, wood); R(g, x0 + bw + 2, gy - 4, 1, 4, wood); // 거푸집 판
      R(g, x0 - 2, gy - 4, bw + 4, 1, woodD);
      for (i = x0 + 2; i < x0 + bw - 1; i += 4) { // 철근과 노란 안전 캡
        R(g, i, gy - 8, 1, 4, '#6a5648'); R(g, i, gy - 9, 1, 1, PAL.y);
      }
      R(g, x0 + 1, gy - 6, bw - 2, 1, '#7a665a');
      // 흙더미와 삽
      R(g, x0 - 12, gy - 3, 10, 3, '#a58c6f'); R(g, x0 - 10, gy - 5, 6, 2, '#a58c6f'); R(g, x0 - 9, gy - 6, 3, 1, '#b39a7c');
      R(g, x0 - 11, gy - 1, 9, 1, '#8a7359'); R(g, x0 - 8, gy - 4, 1, 1, '#8a7359'); R(g, x0 - 6, gy - 2, 1, 1, '#8a7359');
      R(g, x0 - 5, gy - 11, 1, 6, woodD); R(g, x0 - 6, gy - 12, 3, 1, woodD); R(g, x0 - 6, gy - 5, 3, 2, '#9aa0a6');
      // 시멘트 포대와 양동이
      R(g, x0 + bw + 4, gy - 3, 7, 3, '#cfc8b8'); R(g, x0 + bw + 5, gy - 6, 6, 3, '#dcd6c8'); R(g, x0 + bw + 4, gy - 1, 7, 1, '#a9a394');
      R(g, x0 + bw + 6, gy - 5, 3, 1, '#8fa3b5');
      return;
    }

    var steel = '#6a7d92', steelD = '#4c5c6e', steelL = '#8fa2b6';
    if (vis === 2) {
      // 2 골조: 기둥과 보, 층마다 가새, 바닥 데크
      var cols = Math.max(2, Math.round(bw / 10)), bay = (bw - 2) / cols;
      for (var f = 0; f < n; f++) {
        var fy = top + f * FH;
        for (var d = 0; d < cols; d++) {
          if ((d + f) % 2) continue;
          var bx = x0 + Math.round(bay * d) + 2, bwid = Math.round(bay) - 2;
          for (k = 0; k < bwid; k++) R(g, bx + k, fy + 1 + Math.round((FH - 3) * (f % 2 ? k : bwid - 1 - k) / Math.max(1, bwid - 1)), 1, 1, steelD);
        }
        if (f > 0) dither(g, x0 + 2, fy + 1, bw - 4, 1, '#b9b7ae'); // 데크 플레이트
      }
      for (var c = 0; c <= cols; c++) {
        var px = x0 + Math.round(bay * c);
        R(g, px, top, 2, wh, steel); R(g, px, top, 1, wh, steelL);
        for (var f3 = 0; f3 <= n; f3++) R(g, px, top + f3 * FH - (f3 === n ? 2 : 0), 2, 1, '#3b4a5a'); // 이음판
      }
      for (var f2 = 0; f2 <= n; f2++) R(g, x0, top + f2 * FH - (f2 === n ? 1 : 0), bw, f2 === 0 ? 2 : 1, steelD);
      R(g, x0, top, bw, 1, steelL);
      // 꼭대기에 올려 둔 다음 보와 경고등
      R(g, x0 + 4, top - 2, bw - 12, 1, steel); R(g, x0 + 6, top - 3, 6, 1, steelD);
      R(g, x0 + bw - 2, top - 3, 1, 3, steelD); R(g, x0 + bw - 2, top - 4, 1, 1, PAL.r);
      drawScaffold(g, x0, top, bw, wh, gy, env, b);
      return;
    }

    // 3 벽, 4 지붕
    var wall = L.wall, wallD = CP.shade(wall, -0.18), wallL = CP.shade(wall, 0.3), line = CP.shade(wall, -0.42), tex = CP.shade(wall, -0.09);
    var finished = b.done && !b.rebuilt;
    R(g, x0 - 1, top - 1, bw + 2, wh + 1, line); // 윤곽선: 하늘과 또렷이 갈린다
    R(g, x0, top, bw, wh, wall);
    // 벽 재질
    if (L.mat === 0) { // 벽돌: 줄눈을 엇갈려 놓는다
      for (var by = top + 2, row = 0; by < top + wh - 1; by += 3, row++) {
        R(g, x0 + 1, by, bw - 3, 1, tex);
        for (var jx = x0 + (row % 2 ? 3 : 6); jx < x0 + bw - 2; jx += 6) R(g, jx, by - 2, 1, 2, tex);
      }
    } else if (L.mat === 1) { // 판자: 가로 줄
      for (var sy = top + 1; sy < top + wh - 1; sy += 2) R(g, x0 + 1, sy, bw - 3, 1, tex);
    } else { // 패널: 세로 이음과 작은 얼룩
      for (var vx = x0 + 9; vx < x0 + bw - 3; vx += 9) R(g, vx, top, 1, wh, tex);
      var pr = CP.rng(L.seed2);
      for (i = 0; i < n * 4; i++) R(g, x0 + 2 + Math.floor(pr() * (bw - 5)), top + 1 + Math.floor(pr() * (wh - 3)), 1, 1, pr() > 0.5 ? tex : wallL);
    }
    R(g, x0, top, 1, wh, wallL);
    R(g, x0 + bw - 2, top, 2, wh, wallD);
    for (var fl = 1; fl < n; fl++) { R(g, x0, top + fl * FH, bw, 1, wallD); R(g, x0 + 1, top + fl * FH - 1, bw - 3, 1, wallL); }
    R(g, x0, top + wh - 2, bw, 2, wallD); // 걸레받이
    if (finished && L.pipe) { // 빗물 홈통
      var pc = CP.shade(wall, -0.34);
      R(g, x0 + 2, top + 1, 1, wh - 1, pc);
      for (var py = top + 4; py < top + wh - 2; py += 8) R(g, x0 + 1, py, 3, 1, pc);
    }

    var wins = windowsOf(b, x0, top);
    var trim = finished ? '#f6f2e4' : wallD;
    for (var w = 0; w < wins.length; w++) {
      var wn = wins[w], wh2 = CP.hash(b.path + ':w' + w);
      R(g, wn.x - 1, wn.y - 1, 6, 7, finished ? CP.shade(wall, -0.3) : wallD);
      if (finished) {
        R(g, wn.x - 1, wn.y - 1, 6, 1, trim);                      // 인방
        R(g, wn.x, wn.y, 4, 5, '#a9cfe0');
        R(g, wn.x, wn.y, 2, 1, '#e3f3f8'); R(g, wn.x, wn.y + 1, 1, 1, '#e3f3f8'); // 유리 반짝임
        R(g, wn.x + 3, wn.y + 3, 1, 2, '#8fbdd2');
        if (L.win === 0) R(g, wn.x, wn.y + 2, 4, 1, trim);          // 오르내리창
        else if (L.win === 1 && wh2 % 3) {                           // 커튼
          var cur = CURTAINS[(wh2 >>> 4) % CURTAINS.length];
          R(g, wn.x, wn.y, 4, 1, cur); R(g, wn.x, wn.y + 1, 1, 3, cur); R(g, wn.x + 3, wn.y + 1, 1, 2, cur);
        }
        R(g, wn.x - 1, wn.y + 5, 6, 1, trim);                       // 창턱
        if (L.win === 2 && wh2 % 2) {                                // 꽃 상자
          R(g, wn.x - 1, wn.y + 5, 6, 1, '#8a5f48');
          R(g, wn.x, wn.y + 4, 4, 1, env.ground.leaf);
          if (env.season !== 'winter') { R(g, wn.x, wn.y + 4, 1, 1, PAL.p); R(g, wn.x + 2, wn.y + 4, 1, 1, wh2 % 4 > 1 ? PAL.y : PAL.w); }
          else R(g, wn.x, wn.y + 4, 4, 1, '#f4f7fa');
        }
      } else {
        R(g, wn.x, wn.y, 4, 5, '#4a4f66');
        if (vis >= 4 && wh2 % 2) { R(g, wn.x, wn.y, 4, 5, '#7f9fb4'); R(g, wn.x, wn.y, 1, 2, '#a5c2d2'); }
        else if (vis >= 4) { // 새 유리에 붙인 X 테이프
          R(g, wn.x, wn.y, 4, 5, '#7f9fb4');
          R(g, wn.x, wn.y, 1, 1, PAL.w); R(g, wn.x + 1, wn.y + 1, 1, 1, PAL.w); R(g, wn.x + 2, wn.y + 3, 1, 1, PAL.w); R(g, wn.x + 3, wn.y + 4, 1, 1, PAL.w);
          R(g, wn.x + 3, wn.y, 1, 1, PAL.w); R(g, wn.x + 2, wn.y + 1, 1, 1, PAL.w); R(g, wn.x + 1, wn.y + 3, 1, 1, PAL.w); R(g, wn.x, wn.y + 4, 1, 1, PAL.w);
        } else if (wh2 % 4 === 0) { // 비닐로 막아 둔 창
          R(g, wn.x, wn.y, 4, 5, '#7fb0cf'); R(g, wn.x + 1, wn.y, 1, 5, '#a5cbe2');
        } else R(g, wn.x, wn.y + 4, 4, 1, '#3a3f52');
      }
    }

    if (b.done || vis >= 4) {
      // 문: 문틀, 작은 창, 손잡이, 디딤돌
      var dx = x0 + (L.door ? bw - 11 : 5);
      R(g, dx - 1, gy - 3 - 8, 7, 8, CP.shade(wall, -0.3));
      R(g, dx, gy - 3 - 7, 5, 7, '#7a5f48');
      R(g, dx, gy - 3 - 7, 1, 7, '#8f7258'); R(g, dx + 4, gy - 3 - 7, 1, 7, '#654c38');
      R(g, dx + 1, gy - 3 - 6, 3, 2, finished ? '#a9cfe0' : '#4a4f66');
      R(g, dx + 1, gy - 3 - 3, 3, 2, '#6b513c');
      R(g, dx + 3, gy - 3 - 4, 1, 1, PAL.y);
      R(g, dx - 2, gy - 3, 9, 1, '#d6d4cc'); R(g, dx - 1, gy - 2, 7, 1, '#a3a29b');
    }

    if (vis >= 4) drawRoof(g, b, x0, top, bw, env, finished);
    else { // 지붕 전: 철근이 삐죽, 맨 위 벽돌은 쌓다 만 모양
      for (var s = 2; s < bw - 2; s += 5) { R(g, x0 + s, top - 3, 1, 3, '#6a5648'); R(g, x0 + s, top - 4, 1, 1, PAL.y); }
      R(g, x0 + 3, top - 1, 6, 1, wall); R(g, x0 + bw - 12, top - 1, 8, 1, wall);
    }

    if (!finished) drawScaffold(g, x0, top, bw, wh, gy, env, b);

    if (finished) {
      var ax = x0 + (L.door ? bw - 13 : 3);
      if (L.awning) { // 줄무늬 차양
        for (i = 0; i < 11; i++) { R(g, ax + i, gy - 3 - 11, 1, 2, i % 4 < 2 ? L.roof : '#f6f2e4'); if (i % 2 === 0) R(g, ax + i, gy - 3 - 9, 1, 1, i % 4 < 2 ? L.roof : '#f6f2e4'); }
        R(g, ax, gy - 3 - 12, 11, 1, CP.shade(L.roof, -0.25));
      } else {
        R(g, ax, gy - 3 - 10, 11, 2, L.roof); R(g, ax, gy - 3 - 10, 11, 1, CP.shade(L.roof, 0.25));
      }
      R(g, x0 + (L.door ? bw - 13 : 10), gy - 3 - 6, 1, 2, '#3b4252'); // 문 옆 등(밤에는 drawBuildingLights가 켠다)
      // 화분과 덤불, 우편함
      var pxp = x0 + (L.door ? 4 : bw - 8), leaf = env.ground.leaf, leafD = CP.shade(leaf, -0.22);
      R(g, pxp, gy - 6, 3, 3, '#a56f4f'); R(g, pxp, gy - 6, 3, 1, '#be8563');
      R(g, pxp - 1, gy - 9, 5, 3, leaf); R(g, pxp, gy - 10, 3, 1, leaf); R(g, pxp + 2, gy - 8, 2, 2, leafD);
      if (env.season === 'spring') { R(g, pxp, gy - 9, 1, 1, PAL.p); R(g, pxp + 3, gy - 8, 1, 1, PAL.w); }
      else if (env.season === 'winter') R(g, pxp, gy - 10, 3, 1, '#f4f7fa');
      if (L.extra >= 2) { // 문 반대쪽 덤불
        var bxs = x0 + (L.door ? 9 : bw - 15);
        R(g, bxs, gy - 6, 6, 3, leaf); R(g, bxs + 1, gy - 7, 4, 1, leaf); R(g, bxs + 3, gy - 5, 3, 2, leafD);
        if (env.season === 'winter') R(g, bxs + 1, gy - 7, 4, 1, '#f4f7fa');
        else if (env.season === 'autumn') { R(g, bxs + 1, gy - 6, 1, 1, '#d3aa45'); R(g, bxs + 4, gy - 7, 1, 1, '#b8544c'); }
      }
      if (L.extra % 2) { // 우편함
        var mx = x0 + (L.door ? bw - 15 : 12);
        R(g, mx, gy - 7, 1, 4, '#6c727a'); R(g, mx - 1, gy - 9, 3, 2, PAL.r); R(g, mx - 1, gy - 9, 3, 1, '#de7480');
      }
      if (L.ac && n >= 2) { // 벽 밖으로 걸린 실외기
        var acx = L.door ? x0 - 4 : x0 + bw + 1, acy = top + FH + 4;
        R(g, acx, acy, 4, 4, '#d9dde0'); R(g, acx, acy, 4, 1, '#f1f3f4'); R(g, acx + 1, acy + 1, 2, 2, '#8f979f'); R(g, acx, acy + 4, 4, 1, '#6c727a');
      }
    }
  }

  function windowsOf(b, x0, top) {
    var L = b.look, n = Math.max(1, b.floors), out = [];
    var cols = Math.max(2, Math.floor((L.bw - 4) / 8));
    var gap = (L.bw - cols * 4) / (cols + 1);
    for (var f = 0; f < n; f++) {
      for (var c = 0; c < cols; c++) {
        var wx = Math.round(x0 + gap + c * (4 + gap));
        var ground = f === n - 1;
        if (ground) { // 1층은 문 자리를 비운다
          var doorX = x0 + (L.door ? L.bw - 11 : 5);
          if (wx + 4 > doorX - 2 && wx < doorX + 7) continue;
        }
        out.push({ x: wx, y: top + f * FH + 3, lit: ((L.seed >>> ((f * 3 + c) % 24)) & 3) !== 0 });
      }
    }
    return out;
  }

  function roofTop(b) {
    var L = b.look;
    return L.roofType === 1 ? Math.floor((L.bw + 2) / 4) + 1 : L.roofType === 2 ? 9 : 4;
  }

  function drawRoof(g, b, x0, top, bw, env, finished) {
    var L = b.look, roof = L.roof, roofD = CP.shade(roof, -0.25), roofL = CP.shade(roof, 0.25), snow = env.season === 'winter', i;
    if (L.roofType === 1) { // 박공지붕: 기와 무늬와 용마루
      var rows = Math.floor((bw + 2) / 4);
      for (i = 0; i < rows; i++) {
        var rx = x0 - 2 + i * 2, rw = bw + 4 - i * 4;
        R(g, rx, top - 1 - i, rw, 1, roof);
        for (var tx = rx + 1 + (i % 2) * 2; tx < rx + rw - 1; tx += 4) R(g, tx, top - 1 - i, 1, 1, roofD); // 기와 이음
        R(g, rx, top - 1 - i, 1, 1, roofL); R(g, rx + rw - 1, top - 1 - i, 1, 1, roofD);
      }
      R(g, x0 - 3, top - 1, bw + 6, 1, roofD); // 처마
      R(g, x0 - 2 + (rows - 1) * 2, top - rows, bw + 4 - (rows - 1) * 4, 1, roofL);
      if (rows >= 7) { var ox = x0 + Math.floor(bw / 2) - 1; R(g, ox - 1, top - 6, 4, 4, roofD); R(g, ox, top - 5, 2, 2, finished ? '#a9cfe0' : '#4a4f66'); } // 다락 창
      var chx = x0 + bw - 9; // 굴뚝
      R(g, chx, top - rows - 3, 3, 5, '#9a8f86'); R(g, chx, top - rows - 3, 1, 5, '#b3a89f'); R(g, chx - 1, top - rows - 4, 5, 1, '#7d736b');
      if (snow) { for (i = 1; i < rows; i += 2) R(g, x0 - 2 + i * 2, top - 1 - i, 3, 1, '#f4f7fa'); R(g, x0 - 2 + (rows - 1) * 2, top - rows, bw + 4 - (rows - 1) * 4, 1, '#f4f7fa'); R(g, chx - 1, top - rows - 5, 5, 1, '#f4f7fa'); }
    } else if (L.roofType === 2) { // 옥탑이 있는 평지붕
      R(g, x0 - 1, top - 3, bw + 2, 3, roof); R(g, x0 - 1, top - 3, bw + 2, 1, roofL); R(g, x0 - 1, top - 1, bw + 2, 1, roofD);
      var wl = L.wall, hx = x0 + 4;
      R(g, hx - 1, top - 10, 14, 7, CP.shade(wl, -0.42)); R(g, hx, top - 9, 12, 6, wl); R(g, hx + 10, top - 9, 2, 6, CP.shade(wl, -0.18));
      R(g, hx - 1, top - 11, 14, 2, roof); R(g, hx - 1, top - 11, 14, 1, roofL);
      R(g, hx + 2, top - 7, 3, 3, finished ? '#a9cfe0' : '#4a4f66'); R(g, hx + 7, top - 8, 3, 5, '#7a5f48');
      for (i = x0 + bw - 10; i < x0 + bw; i += 3) R(g, i, top - 6, 1, 3, '#6c727a'); // 난간
      R(g, x0 + bw - 11, top - 6, 12, 1, '#6c727a');
      if (finished && L.extra % 2 === 0) { R(g, x0 + bw - 8, top - 5, 5, 2, env.ground.leaf); R(g, x0 + bw - 8, top - 4, 5, 1, '#8a5f48'); } // 옥상 텃밭
      if (snow) { R(g, x0 - 1, top - 4, bw + 2, 1, '#f4f7fa'); R(g, hx - 1, top - 12, 14, 1, '#f4f7fa'); }
    } else { // 평지붕: 물탱크나 안테나, 태양광 판
      R(g, x0 - 1, top - 3, bw + 2, 3, roof); R(g, x0 - 1, top - 3, bw + 2, 1, roofL); R(g, x0 - 1, top - 1, bw + 2, 1, roofD);
      if (L.extra % 2) { // 파란 물탱크
        var tkx = x0 + bw - 11;
        R(g, tkx + 1, top - 4, 1, 1, '#6c727a'); R(g, tkx + 5, top - 4, 1, 1, '#6c727a');
        R(g, tkx, top - 9, 7, 5, PAL.b); R(g, tkx, top - 9, 2, 5, '#93c7e6'); R(g, tkx + 5, top - 9, 2, 5, PAL.B); R(g, tkx + 1, top - 10, 5, 1, '#93c7e6');
      } else { // 안테나
        R(g, x0 + 4, top - 9, 1, 6, '#6c727a'); R(g, x0 + 2, top - 9, 5, 1, '#6c727a'); R(g, x0 + 3, top - 7, 3, 1, '#6c727a');
      }
      if (L.extra >= 2) { // 태양광 판
        var spx = x0 + (L.extra % 2 ? 3 : 10);
        R(g, spx, top - 6, 9, 3, '#34507a'); R(g, spx, top - 6, 9, 1, '#5d7fae'); R(g, spx + 3, top - 6, 1, 3, '#8fa9cc'); R(g, spx + 6, top - 6, 1, 3, '#8fa9cc'); R(g, spx + 1, top - 3, 1, 1, '#6c727a');
      }
      if (snow) R(g, x0 - 1, top - 4, bw + 2, 1, '#f4f7fa');
    }
  }

  function drawScaffold(g, x0, top, bw, wh, gy, env, b) {
    var pole = '#7a6a58', poleL = '#9a8974', plank = '#c2a57c', plankD = '#a3875f';
    var sides = [x0 - 8, x0 + bw + 2], s, y, k;
    for (s = 0; s < 2; s++) {
      var sx = sides[s], lvl = 0;
      // 바깥쪽 낙하물 방지망(초록 그물)
      dither(g, sx + (s ? 3 : 0), top - 2, 3, gy - top - 2, 'rgba(92,150,104,0.75)');
      for (y = gy; y > top - 2; y -= 10, lvl++) {
        var y1 = Math.max(top - 3, y - 10);
        for (k = 0; k < 4; k++) { // 가새는 층마다 방향을 바꾼다
          var kk = (lvl + s) % 2 ? k : 3 - k;
          R(g, sx + 1 + kk, y - 2 - k * 2, 1, 2, pole);
        }
        R(g, sx - 1, y1, 8, 1, plank); R(g, sx - 1, y1 + 1, 8, 1, plankD);
        if (y1 > top) R(g, sx - 1, y1 - 3, 8, 1, poleL); // 난간대
      }
      R(g, sx, top - 5, 1, gy - top + 5, pole);
      R(g, sx + 5, top - 5, 1, gy - top + 5, pole);
      R(g, sx - 1, gy - 1, 3, 1, '#5d5246'); R(g, sx + 4, gy - 1, 3, 1, '#5d5246'); // 받침
    }
    R(g, x0 - 8, top - 4, bw + 16, 1, pole);
    // 사다리(오른쪽)와 양동이
    for (y = gy - 2; y > top; y -= 2) R(g, x0 + bw + 4, y, 2, 1, plankD);
    R(g, x0 - 7, top - 3, 1, 3, '#59606b'); R(g, x0 - 8, top, 3, 2, '#8fa3b5');
    // 야간 작업등
    R(g, x0 + bw + 7, top - 7, 1, 3, pole); R(g, x0 + bw + 6, top - 8, 3, 1, '#d9d4c0');
    if (env.theme === 'valentine') { // 하트 모양 비계
      var hs = CP.sprites.tile('heart', ['.p.p.', 'ppppp', 'ppppp', '.ppp.', '..p..'], PAL);
      g.drawImage(hs, x0 - 8, top - 10); g.drawImage(hs, x0 + bw + 2, top - 10);
    }
    if (env.season === 'winter') { R(g, x0 - 7, top - 5, bw + 14, 1, '#f4f7fa'); }
  }

  function drawFlags(g, b, x0, top, bw) {
    if (!b.flags || b.vis < 3) return;
    var n = Math.min(b.flags, 5), ry = top - (b.vis >= 4 ? roofTop(b) : 2);
    for (var i = 0; i < n; i++) {
      var fx = x0 + 3 + i * Math.floor((bw - 6) / 5);
      R(g, fx, ry - 7, 1, 7, '#6c727a');
      var wave = Math.floor((b.clock || 0) * 3 + i) % 2;
      R(g, fx + 1, ry - 7 + wave, 4, 3, FLAGS[i % FLAGS.length]);
      R(g, fx + 1, ry - 7 + wave, 4, 1, CP.shade(FLAGS[i % FLAGS.length], 0.3));
    }
  }

  // 밤에 켜지는 창과 등. 색조를 입힌 뒤에 덧그려서 환하게 보인다.
  function drawBuildingLights(g, b, x, gy, env) {
    if (env.night < 0.45 || b.vis < 2) return;
    var L = b.look, n = Math.max(1, b.floors);
    var x0 = Math.round(x - L.bw / 2), top = gy - 3 - n * FH;
    var a = CP.clamp((env.night - 0.45) / 0.4, 0, 1);
    if (!b.done || b.rebuilt) { // 공사 중: 비계 작업등
      g.fillStyle = 'rgba(255,236,170,' + a + ')'; g.fillRect(x0 + L.bw + 6, top - 8, 3, 1);
      g.fillStyle = 'rgba(255,224,150,' + (a * 0.12).toFixed(3) + ')'; g.fillRect(x0 + L.bw + 3, top - 7, 9, 8);
      return;
    }
    if (b.vis < 4) return;
    var wins = windowsOf(b, x0, top);
    for (var i = 0; i < wins.length; i++) {
      if (!wins[i].lit) continue;
      g.fillStyle = 'rgba(255,214,128,' + a + ')';
      g.fillRect(wins[i].x, wins[i].y, 4, 5);
      g.fillStyle = 'rgba(255,240,190,' + a * 0.9 + ')';
      g.fillRect(wins[i].x, wins[i].y, 2, 2);
      if (L.win === 0) { g.fillStyle = 'rgba(120,90,50,' + a * 0.55 + ')'; g.fillRect(wins[i].x, wins[i].y + 2, 4, 1); }
      g.fillStyle = 'rgba(255,200,110,' + a * 0.14 + ')';
      g.fillRect(wins[i].x - 2, wins[i].y - 2, 8, 9);
    }
    // 문 옆 등
    var lx = x0 + (L.door ? L.bw - 13 : 10), ly = gy - 3 - 6;
    g.fillStyle = 'rgba(255,236,170,' + a + ')'; g.fillRect(lx, ly, 1, 2);
    g.fillStyle = 'rgba(255,224,150,' + (a * 0.13).toFixed(3) + ')'; g.fillRect(lx - 3, ly - 1, 7, 9);
  }

  // ---------- 하늘 ----------
  var skyCv = null, skyKey = '';

  function skyBase(W, H, top, bot) {
    var key = W + 'x' + H + ':' + top.map(Math.round).join(',') + ':' + bot.map(Math.round).join(',');
    if (key === skyKey && skyCv) return skyCv;
    if (!skyCv) skyCv = document.createElement('canvas');
    if (skyCv.width !== W || skyCv.height !== H) { skyCv.width = W; skyCv.height = H; }
    var g = skyCv.getContext('2d'), bands = 18, bh = Math.ceil(H / bands), cols = [], i;
    for (i = 0; i < bands; i++) {
      var t = i / (bands - 1);
      cols.push(CP.css(CP.mixRgb(top, bot, t * t * 0.4 + t * 0.6)));
      g.fillStyle = cols[i]; g.fillRect(0, i * bh, W, bh);
    }
    for (i = 1; i < bands; i++) { // 띠 사이를 점묘로 풀어 준다
      dither(g, 0, i * bh - 1, W, 1, cols[i]);
    }
    skyKey = key;
    return skyCv;
  }

  function cloud(g, x, y, w, c, cd, cl) {
    x = Math.round(x);
    R(g, x, y, w, 3, c);
    R(g, x + 3, y - 2, w - 9, 2, c);
    R(g, x + Math.round(w * 0.3), y - 4, Math.round(w * 0.34), 2, c);
    R(g, x + 2, y + 3, w - 5, 1, cd);                       // 아랫면 그늘
    R(g, x + Math.round(w * 0.55), y + 2, Math.round(w * 0.4), 1, cd);
    R(g, x + Math.round(w * 0.3) + 1, y - 4, Math.round(w * 0.34) - 3, 1, cl); // 윗면 빛
    R(g, x + 4, y - 2, 4, 1, cl);
    if (w > 24) { R(g, x + w - 8, y - 1, 5, 1, c); R(g, x - 2, y + 1, 3, 2, c); }
  }

  function drawSky(g, W, H, env) {
    g.drawImage(skyBase(W, H, env.sky.top, env.sky.bot), 0, 0);
    var i, yy, half;
    // 별
    if (env.night > 0.35) {
      var a = CP.clamp((env.night - 0.35) / 0.5, 0, 1), r = CP.rng(77);
      for (var s = 0; s < 70; s++) {
        var sx = Math.floor(r() * W), sy = Math.floor(r() * H * 0.6), tw = (Math.sin(env.t * (0.6 + r()) + s) + 1) / 2, big = r() > 0.88;
        g.fillStyle = 'rgba(255,250,230,' + (a * (0.35 + 0.65 * tw)).toFixed(2) + ')';
        g.fillRect(sx, sy, 1, 1);
        if (big && tw > 0.5) { g.fillStyle = 'rgba(255,250,230,' + (a * 0.4 * tw).toFixed(2) + ')'; g.fillRect(sx - 1, sy, 3, 1); g.fillRect(sx, sy - 1, 1, 3); }
      }
      if (!env.reduced) { // 가끔 별똥별
        var cyc = (env.t % 23) / 0.7;
        if (cyc < 1) {
          var n0 = Math.floor(env.t / 23), rr0 = CP.rng(n0 * 13 + 5), mxs = W * (0.2 + rr0() * 0.6), mys = H * (0.05 + rr0() * 0.2);
          for (i = 0; i < 6; i++) { g.fillStyle = 'rgba(255,250,230,' + (a * (1 - i / 6) * (1 - cyc)).toFixed(2) + ')'; g.fillRect(Math.round(mxs - cyc * 40 + i * 2), Math.round(mys + cyc * 18 - i), 1, 1); }
        }
      }
    }
    // 해와 달
    var d = env.dayT;
    if (d < 0.97) {
      var u = CP.clamp(d / 0.9, 0, 1);
      var sunX = Math.round(CP.lerp(W * 0.14, W * 0.86, u)), sunY = Math.round(H * 0.56 - Math.sin(Math.PI * u) * H * 0.42);
      var sa = CP.clamp((0.97 - d) / 0.12, 0, 1);
      for (var ring = 0; ring < 3; ring++) {
        var rr = ring === 2 ? 3 : ring ? 5 : 9;
        g.fillStyle = ring === 2 ? 'rgba(255,250,228,' + sa + ')' : ring ? 'rgba(255,241,200,' + sa + ')' : 'rgba(255,236,178,' + (0.2 * sa) + ')';
        for (yy = -rr; yy <= rr; yy++) { half = Math.round(Math.sqrt(rr * rr - yy * yy)); g.fillRect(sunX - half, sunY + yy, half * 2 + 1, 1); }
      }
      // 햇살: 여덟 방향으로 깜빡인다
      g.fillStyle = 'rgba(255,241,200,' + (0.55 * sa).toFixed(2) + ')';
      var ph = Math.floor(env.t * 1.2) % 2, RAY = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
      for (i = 0; i < 8; i++) {
        if (i % 2 !== ph && !env.reduced) continue;
        var dist = i % 2 ? 9 : 11;
        g.fillRect(sunX + RAY[i][0] * dist, sunY + RAY[i][1] * dist, 1, 1);
        g.fillRect(sunX + RAY[i][0] * (dist + 2), sunY + RAY[i][1] * (dist + 2), 1, 1);
      }
    }
    if (env.night > 0.5) {
      var ma = CP.clamp((env.night - 0.5) / 0.4, 0, 1), bigM = env.theme === 'chuseok';
      var mr = bigM ? 9 : 5, mx = Math.round(W * 0.78), my = Math.round(H * (bigM ? 0.2 : 0.16));
      g.fillStyle = 'rgba(250,244,220,' + (ma * 0.08).toFixed(3) + ')'; // 달무리
      for (yy = -mr - 5; yy <= mr + 5; yy++) { half = Math.round(Math.sqrt((mr + 5) * (mr + 5) - yy * yy)); g.fillRect(mx - half, my + yy, half * 2 + 1, 1); }
      g.fillStyle = 'rgba(250,244,220,' + ma + ')';
      for (yy = -mr; yy <= mr; yy++) {
        half = Math.round(Math.sqrt(mr * mr - yy * yy));
        if (bigM) { g.fillRect(mx - half, my + yy, half * 2 + 1, 1); continue; }
        // 초승달: 오른쪽으로 비껴 놓은 원을 뺀 나머지만 칠한다
        var cut = mr * mr - (yy + 1) * (yy + 1), inner = cut > 0 ? Math.round(Math.sqrt(cut)) : -1;
        var x1 = mx - half, x2 = inner < 0 ? mx + half : Math.min(mx + half, mx + 3 - inner - 1);
        if (x2 >= x1) g.fillRect(x1, my + yy, x2 - x1 + 1, 1);
      }
      if (bigM) { g.fillStyle = 'rgba(226,214,180,' + ma + ')'; g.fillRect(mx - 4, my - 3, 3, 2); g.fillRect(mx + 2, my + 2, 3, 3); g.fillRect(mx - 2, my + 4, 2, 1); g.fillRect(mx + 3, my - 5, 2, 2); g.fillRect(mx - 6, my + 1, 2, 2); }
    }
    // 구름 두 겹: 먼 것은 작고 느리다
    var base = CP.mixRgb([255, 255, 255], env.sky.bot, 0.12 + env.night * 0.45), alpha = (0.92 - env.night * 0.5).toFixed(2);
    var cMain = CP.css(base, alpha), cDark = CP.css(CP.mixRgb(base, env.sky.top, 0.3), alpha), cLite = CP.css(CP.mixRgb(base, [255, 255, 255], 0.6), alpha);
    var cr = CP.rng(5);
    for (var c = 0; c < 9; c++) {
      var far = c >= 5, span = W + 100;
      var cx = ((cr() * span + env.t * (far ? 0.5 + cr() * 0.5 : 1.2 + cr() * 1.5)) % span) - 50;
      var cy = Math.floor(H * (far ? 0.3 + cr() * 0.16 : 0.07 + cr() * 0.24)), cw = far ? 12 + Math.floor(cr() * 8) : 20 + Math.floor(cr() * 18);
      cloud(g, cx, cy, cw, cMain, cDark, cLite);
    }
    // 낮에는 새 떼가 가끔 지나간다
    if (env.night < 0.3 && !env.reduced) {
      var bc = (env.t % 47) / 16;
      if (bc < 1) {
        var bn = Math.floor(env.t / 47), br = CP.rng(bn * 7 + 3), by0 = H * (0.12 + br() * 0.2), dir = br() > 0.5 ? 1 : -1;
        g.fillStyle = 'rgba(60,64,90,' + (0.7 * (1 - env.night / 0.3)).toFixed(2) + ')';
        for (i = 0; i < 5; i++) {
          var bxx = Math.round(dir > 0 ? -20 + bc * (W + 60) - i * 7 : W + 20 - bc * (W + 60) + i * 7), byy = Math.round(by0 + Math.abs(i - 2) * 3 + Math.sin(env.t * 2 + i) * 1.5);
          var flap = Math.floor(env.t * 6 + i) % 2;
          g.fillRect(bxx, byy, 1, 1);
          g.fillRect(bxx - 1, byy - (flap ? 1 : 0), 1, 1); g.fillRect(bxx + 1, byy - (flap ? 1 : 0), 1, 1);
          if (!flap) { g.fillRect(bxx - 2, byy, 1, 1); g.fillRect(bxx + 2, byy, 1, 1); }
        }
      }
    }
  }

  // ---------- 먼 배경 ----------
  var HILL = { spring: [126, 170, 132], summer: [88, 146, 106], autumn: [178, 138, 96], winter: [206, 216, 228] };

  // 능선 두 겹과 도시 실루엣 두 겹. 하늘색에 섞어 그려서 따로 색조를 입히지 않아도 어울린다.
  function drawFar(g, W, gy, env, camX) {
    var x, i, w;
    // 능선
    for (var hl = 0; hl < 2; hl++) {
      var hoff = camX * (hl ? 0.1 : 0.05), hcol = CP.mixRgb(env.sky.bot, HILL[env.season] || HILL.spring, hl ? 0.42 : 0.24);
      hcol = CP.mixRgb(hcol, env.sky.top, 0.18 + env.night * 0.3);
      var hc = CP.css(hcol), hd = CP.css(CP.mixRgb(hcol, [30, 40, 60], 0.14));
      for (x = 0; x < W; x += 2) {
        var wx = x + hoff + hl * 300;
        var hh = (hl ? 30 : 44) + Math.sin(wx * 0.011) * (hl ? 9 : 13) + Math.sin(wx * 0.027 + 2) * 5 + Math.sin(wx * 0.071 + hl) * 2;
        hh = Math.round(hh + ((CP.hash('h' + hl + ':' + Math.floor(wx / 2)) & 3) === 0 ? 1 : 0)); // 나무 윤곽
        g.fillStyle = hc; g.fillRect(x, gy - hh, 2, hh);
        if ((Math.floor(wx / 2) % 5) === 0) { g.fillStyle = hd; g.fillRect(x, gy - hh + 2 + (Math.floor(wx / 2) % 7), 1, 2); }
      }
      if (!hl) { // 능선 위 송전탑과 전망 탑
        var unit0 = 520, st = Math.floor(hoff / unit0) - 1;
        for (i = st; i <= st + Math.ceil(W / unit0) + 1; i++) {
          var tx = Math.round(i * unit0 + 180 - hoff), wx2 = tx + hoff;
          var th = Math.round(44 + Math.sin(wx2 * 0.011) * 13 + Math.sin(wx2 * 0.027 + 2) * 5);
          g.fillStyle = hd;
          g.fillRect(tx, gy - th - 14, 1, 14); g.fillRect(tx - 1, gy - th - 9, 3, 2); g.fillRect(tx - 1, gy - th - 4, 3, 4);
          if (env.night > 0.5 && Math.floor(env.t * 1.5) % 2) { g.fillStyle = 'rgba(255,110,110,0.9)'; g.fillRect(tx, gy - th - 15, 1, 1); }
        }
      }
    }
    // 도시
    for (var layer = 0; layer < 2; layer++) {
      var par = layer ? 0.3 : 0.16, col = CP.mixRgb(env.sky.bot, env.sky.top, layer ? 0.5 : 0.3);
      col = CP.mixRgb(col, [40, 44, 70], layer ? 0.24 : 0.12);
      var cMain = CP.css(col), cWin = CP.css(CP.mixRgb(col, [30, 34, 60], 0.16)), cEdge = CP.css(CP.mixRgb(col, [255, 255, 255], 0.14));
      var lit = 'rgba(255,220,150,' + (CP.clamp((env.night - 0.4) / 0.4, 0, 1) * (layer ? 0.75 : 0.5)).toFixed(2) + ')';
      var off = Math.floor(camX * par), unit = layer ? 19 : 25, start = Math.floor(off / unit) - 1;
      for (i = start; i < start + Math.ceil(W / unit) + 3; i++) {
        var hsh = CP.hash('far' + layer + ':' + i), bh = (layer ? 12 : 18) + (hsh % (layer ? 30 : 40)), bw = unit - 2 - (hsh >>> 8) % 5;
        var bx = i * unit - off, topY = gy - bh, style = (hsh >>> 12) % 6;
        g.fillStyle = cMain;
        g.fillRect(bx, topY, bw, bh);
        if (style === 0) g.fillRect(bx + 2, topY - 3, bw - 4, 3);                                   // 단 올림
        else if (style === 1) { g.fillRect(bx + 3, topY - 2, bw - 6, 2); g.fillRect(bx + Math.floor(bw / 2), topY - 8, 1, 6); } // 첨탑
        else if (style === 2) { g.fillRect(bx + 2, topY - 4, 4, 4); g.fillRect(bx + 3, topY - 5, 2, 1); }  // 물탱크
        else if (style === 3) { for (w = 0; w < 4; w++) g.fillRect(bx, topY - 1 - w, Math.max(0, bw - 2 - w * 3), 1); } // 비스듬한 지붕
        else if (style === 4 && layer) { g.fillRect(bx + 1, topY - 5, 1, 5); g.fillRect(bx + 1, topY - 5, bw - 2, 3); } // 옥상 간판
        g.fillStyle = cEdge; g.fillRect(bx, topY, 1, bh);                                             // 빛 받는 모서리
        // 창: 낮에는 살짝 어둡게, 밤에는 몇 개만 켠다
        var rows = Math.floor((bh - 4) / 4), colsN = Math.floor((bw - 3) / 3);
        for (var ry = 0; ry < rows; ry++) {
          for (var rx = 0; rx < colsN; rx++) {
            var bit = CP.hash(hsh + ':' + ry + ':' + rx);
            if (bit % 3 === 0) continue;
            var on = env.night > 0.4 && bit % 7 < (layer ? 3 : 2);
            g.fillStyle = on ? lit : cWin;
            g.fillRect(bx + 2 + rx * 3, topY + 3 + ry * 4, 1, 2);
          }
        }
        if (style === 1 && env.night > 0.5 && Math.floor(env.t + i) % 2) { g.fillStyle = 'rgba(255,110,110,0.85)'; g.fillRect(bx + Math.floor(bw / 2), topY - 9, 1, 1); }
      }
    }
  }

  // 타워 크레인. 배경에 느리게 따라오고, Bash 작업 때 트롤리와 갈고리가 바삐 움직인다.
  function drawCrane(g, W, gy, env, camX) {
    var par = 0.55, span = 360, off = camX * par, k, y;
    var col = CP.css(CP.mixRgb([226, 186, 62], env.sky.bot, 0.38)), colD = CP.css(CP.mixRgb([160, 126, 40], env.sky.bot, 0.38)), colL = CP.css(CP.mixRgb([246, 222, 130], env.sky.bot, 0.3));
    var glass = CP.css(CP.mixRgb([70, 90, 120], env.sky.bot, 0.3)), gray = CP.css(CP.mixRgb([150, 140, 126], env.sky.bot, 0.3));
    for (var i = Math.floor(off / span) - 1; i <= Math.floor((off + W) / span) + 1; i++) {
      var x = Math.round(i * span + 250 - off), h = Math.min(gy - 18, 122), ty = gy - h;
      if (x < -80 || x > W + 80) continue;
      // 기둥: 격자
      for (y = ty; y < gy; y += 4) { R(g, x, y, 5, 1, colD); R(g, x + (Math.floor((y - ty) / 4) % 2 ? 1 : 3), y + 1, 1, 3, colD); }
      R(g, x, ty, 1, h, col); R(g, x + 4, ty, 1, h, col);
      R(g, x - 2, gy - 3, 9, 3, gray); // 기초
      // 팔: 위아래 줄과 지그재그
      R(g, x - 22, ty - 1, 78, 1, col); R(g, x - 22, ty, 78, 1, colD); R(g, x - 20, ty - 4, 74, 1, colD);
      for (k = -20; k < 54; k += 4) { R(g, x + k, ty - 3, 1, 2, colD); R(g, x + k + 2, ty - 3, 1, 1, col); }
      R(g, x + 55, ty - 3, 1, 4, col);
      // 균형추, 운전실, 꼭대기 지지선
      R(g, x - 22, ty + 1, 8, 5, colD); R(g, x - 22, ty + 1, 8, 1, gray); R(g, x - 18, ty + 1, 1, 5, gray);
      R(g, x - 1, ty - 9, 7, 8, col); R(g, x - 1, ty - 9, 7, 1, colL); R(g, x + 1, ty - 7, 3, 3, glass); R(g, x + 1, ty - 7, 1, 1, colL);
      R(g, x + 2, ty - 16, 1, 7, colD);
      for (k = 1; k < 18; k++) { R(g, x + 2 + k * 2, ty - 16 + Math.round(k * 0.7), 1, 1, colD); if (k < 10) R(g, x + 2 - k * 2, ty - 16 + Math.round(k * 1.3), 1, 1, colD); }
      if (env.night > 0.5 && Math.floor(env.t * 1.2 + i) % 2) R(g, x + 2, ty - 17, 1, 1, 'rgba(255,110,110,0.95)');
      var busy = env.craneBusy, sp = busy ? 1.6 : 0.25;
      var tx = x + 22 + Math.round(Math.sin(env.t * sp + i) * 20);
      var len = 18 + Math.round((Math.sin(env.t * sp * 1.3 + i * 2) + 1) * (busy ? 16 : 6));
      R(g, tx - 2, ty + 1, 5, 2, colD);
      R(g, tx, ty + 3, 1, len, colD);
      R(g, tx - 1, ty + 3 + len, 3, 2, colD); R(g, tx, ty + 5 + len, 1, 1, colD);
      if (busy) { R(g, tx - 3, ty + 6 + len, 1, 1, colD); R(g, tx + 3, ty + 6 + len, 1, 1, colD); R(g, tx - 4, ty + 7 + len, 9, 4, gray); R(g, tx - 4, ty + 7 + len, 9, 1, colD); R(g, tx - 4, ty + 9 + len, 9, 1, colD); }
    }
  }

  // ---------- 땅 ----------
  var FOSSIL = ['.cc...', 'c..c.c', '.cc.c.', '...c..'];
  var BONE = ['c...c', 'ccccc', 'c...c'];

  function drawGround(g, W, H, gy, env, camX) {
    var G = env.ground, depth = H - gy, i, h, x;
    var d2 = CP.shade(G.dirt, -0.07), d3 = CP.shade(G.dirt, -0.14), light = CP.shade(G.dirt, 0.16), track = CP.shade(G.dirt, -0.1);
    var off = Math.floor(camX);
    R(g, 0, gy, W, depth, G.dirt);
    // 지층: 아래로 갈수록 어둡다
    if (depth > 12) { dither(g, -(off % 2), gy + 11, W + 2, 1, d2); R(g, 0, gy + 12, W, depth - 12, d2); }
    if (depth > 26) { dither(g, -(off % 2), gy + 25, W + 2, 1, d3); R(g, 0, gy + 26, W, depth - 26, d3); }
    R(g, 0, gy, W, 2, G.top);
    R(g, 0, gy + 2, W, 1, G.edge);
    // 바퀴 자국 두 줄
    for (x = -(off % 4); x < W; x += 4) {
      var seg = Math.floor((x + off) / 96);
      if (CP.hash('trk' + seg) % 3 === 0) continue;
      R(g, x, gy + 5, 2, 1, track); R(g, x + 2, gy + 8, 2, 1, track);
    }
    var start = Math.floor(off / 9) - 1;
    for (i = start; i < start + Math.ceil(W / 9) + 3; i++) {
      h = CP.hash('g' + i); x = i * 9 - off + (h % 7);
      R(g, x, gy + 5 + (h >>> 4) % Math.max(1, depth - 6), 1 + (h >>> 9) % 3, 1, G.speck);
      if ((h >>> 12) % 3 === 0) R(g, x + 3, gy - 1, 1, 1, G.tuft);
      if ((h >>> 15) % 5 === 0) { R(g, x, gy - 2, 1, 2, G.tuft); R(g, x + 1, gy - 1, 1, 1, G.tuft); R(g, x + 2, gy - 3, 1, 3, G.tuft); }
      if ((h >>> 18) % 4 === 0) R(g, x + 5, gy + 2, 2, 1, G.top);        // 풀이 흙 위로 늘어진 곳
      if ((h >>> 20) % 6 === 0) { // 자갈
        var py = gy + 4 + (h >>> 23) % Math.max(1, Math.min(18, depth - 6));
        R(g, x + 1, py, 2, 1, light); R(g, x + 1, py + 1, 3, 1, d3); R(g, x, py + 1, 1, 1, light);
      }
      // 계절 장식
      var bit = (h >>> 24) % 8;
      if (env.season === 'spring' && bit < 2) { R(g, x + 4, gy - 3, 1, 2, G.tuft); R(g, x + 4, gy - 4, 1, 1, [PAL.p, PAL.w, PAL.y][h % 3]); }
      else if (env.season === 'summer' && bit === 0) { R(g, x + 4, gy - 4, 1, 3, G.tuft); R(g, x + 3, gy - 5, 3, 1, PAL.y); R(g, x + 4, gy - 5, 1, 1, PAL.n); }
      else if (env.season === 'autumn' && bit < 3) R(g, x + 4, gy + (bit ? 0 : 1), 2, 1, bit === 1 ? '#b8544c' : '#d3aa45');
      else if (env.season === 'winter') { if (bit < 2) R(g, x + 4, gy + 1, 2, 1, '#dde6ee'); if (bit === 7) { R(g, x + 2, gy, 1, 1, '#c9d4de'); R(g, x + 5, gy + 1, 1, 1, '#c9d4de'); } }
    }
    if (env.shower) { // 소나기에는 웅덩이
      for (i = Math.floor(off / 140) - 1; i <= Math.floor((off + W) / 140) + 1; i++) {
        x = i * 140 + 70 + CP.hash('pud' + i) % 40 - off;
        R(g, x, gy + 1, 12, 1, '#8fb6d0'); R(g, x + 2, gy, 8, 1, '#8fb6d0'); R(g, x + 3, gy, 3, 1, '#cfe4f0');
      }
    }
    // 맨홀 뚜껑과 땅속 화석(아주 가끔)
    for (i = Math.floor(off / 310) - 1; i <= Math.floor((off + W) / 310) + 1; i++) {
      x = i * 310 + 160 - off;
      R(g, x, gy + 6, 8, 1, '#8a8f98'); R(g, x + 1, gy + 5, 6, 1, '#a1a6ae'); R(g, x + 1, gy + 7, 6, 1, '#6c727a'); R(g, x + 3, gy + 6, 2, 1, '#6c727a');
      if (depth > 34) {
        h = CP.hash('fossil' + i);
        CP.sprites.stamp(g, 'fossil' + (h % 2) + G.dirt, h % 2 ? FOSSIL : BONE, x + 60 + h % 90, gy + 20 + (h >>> 8) % Math.max(1, depth - 28), { c: light });
      }
    }
  }

  // ---------- 현장 사무소와 자재 ----------
  var TOILET = [
    '.BBBBBBBB.',
    'BbbbbbbbbB',
    'Bbbbbbbbbb',
    'BbbwwwwbbB',
    'BbbwBBwbbB',
    'BbbwwwwbbB',
    'BbbbbbbbbB',
    'BbbbbbbybB',
    'BbbbbbbbbB',
    'BbbbbbbbbB',
    'BbbbbbbbbB',
    'BbbbbbbbbB',
    'BBBBBBBBBB',
    'EE......EE',
  ];
  var BARROW = [
    '.......eeeeee.',
    'nn.....EeeeeE.',
    '.nnnnnnEEEEE..',
    '.......kk.E...',
    '......kEEk.E..',
    '.......kk..E..',
  ];
  var DRUM = ['.tttt.', 'tGGGGt', 'tttttt', 'tGGGGt', 'tttttt', 'tGGGGt', '.tttt.'];
  var EXCAVATOR_BODY = [
    '.....kkkkkkk......',
    '.....kaaaakyy.....',
    '.....kaaaakyyy....',
    '.....kaaaakyyyy...',
    '..yyyyyyyyyyyyyy..',
    '..yYYyyyyyyyyYYy..',
    '..YYYYYYYYYYYYYY..',
    '.kkkkkkkkkkkkkkkk.',
    'kEeEeEeEeEeEeEeEek',
    'kEEEEEEEEEEEEEEEEk',
    '.kkkkkkkkkkkkkkkk.',
  ];
  var EXCAVATOR_ARM = [
    '......yy......',
    '.....yYyy.....',
    '....yY..yy....',
    '...yY....yy...',
    '..yY......yy..',
    '.yY........yy.',
    '.yY.........yY',
    '.yY..........Y',
    'EEEE..........',
    'EeeE..........',
    'E..E..........',
  ];

  function drawOffice(g, x, gy, env) {
    var x0 = Math.round(x - 20), y0 = gy - 22, i;
    var body = '#6f8f93', dark = '#55737a', light = '#8fb0b3', deep = '#3f565c';
    // 컨테이너: 골진 벽, 모서리 기둥, 받침 블록
    R(g, x0 - 1, y0 - 1, 42, 23, deep);
    R(g, x0, y0, 40, 22, body); R(g, x0, y0, 40, 2, light); R(g, x0, gy - 2, 40, 2, dark);
    for (i = 3; i < 40; i += 3) R(g, x0 + i, y0 + 2, 1, 18, i % 6 === 3 ? dark : light);
    R(g, x0, y0, 2, 22, dark); R(g, x0 + 38, y0, 2, 22, dark);
    R(g, x0 + 1, gy - 1, 5, 1, '#8f8e88'); R(g, x0 + 34, gy - 1, 5, 1, '#8f8e88');
    // 창: 네 칸 유리와 블라인드
    R(g, x0 + 4, y0 + 5, 12, 9, '#35405a'); R(g, x0 + 5, y0 + 6, 10, 7, env.night > 0.5 ? '#ffd680' : '#a9cfe0');
    R(g, x0 + 9, y0 + 6, 1, 7, '#35405a'); R(g, x0 + 5, y0 + 9, 10, 1, '#35405a');
    if (env.night <= 0.5) { R(g, x0 + 5, y0 + 6, 4, 1, '#e3f3f8'); R(g, x0 + 10, y0 + 6, 5, 2, '#dfe6ea'); R(g, x0 + 10, y0 + 7, 5, 1, '#c3ccd2'); }
    R(g, x0 + 3, y0 + 14, 14, 1, light);
    // 문: 유리창, 손잡이, 디딤판, 문 위 등
    R(g, x0 + 23, y0 + 5, 11, 17, '#35405a'); R(g, x0 + 24, y0 + 6, 9, 16, '#7a5f48'); R(g, x0 + 24, y0 + 6, 1, 16, '#8f7258');
    R(g, x0 + 26, y0 + 8, 5, 4, env.night > 0.5 ? '#ffd680' : '#a9cfe0'); R(g, x0 + 31, y0 + 14, 1, 2, PAL.y);
    R(g, x0 + 22, gy - 1, 13, 1, '#b3b2ab'); R(g, x0 + 27, y0 + 3, 3, 1, '#d9d4c0');
    // 게시판(안전 수칙)과 헬멧 걸이
    R(g, x0 + 17, y0 + 6, 5, 6, '#e9e2cc'); R(g, x0 + 17, y0 + 6, 5, 1, PAL.G); R(g, x0 + 18, y0 + 8, 3, 1, '#9aa0a6'); R(g, x0 + 18, y0 + 10, 2, 1, '#9aa0a6');
    R(g, x0 + 35, y0 + 7, 3, 2, PAL.y); R(g, x0 + 35, y0 + 9, 3, 1, PAL.Y); R(g, x0 + 35, y0 + 12, 3, 2, PAL.w); R(g, x0 + 35, y0 + 14, 3, 1, '#cfcabb');
    // 지붕 위: 실외기, 안테나, 안전제일 깃발(초록 십자)
    R(g, x0 + 4, y0 - 5, 7, 4, '#d9dde0'); R(g, x0 + 4, y0 - 5, 7, 1, '#f1f3f4'); R(g, x0 + 6, y0 - 4, 3, 2, '#8f979f');
    R(g, x0 + 16, y0 - 8, 1, 7, '#6c727a'); R(g, x0 + 14, y0 - 8, 5, 1, '#6c727a'); R(g, x0 + 15, y0 - 6, 3, 1, '#6c727a');
    var fl = Math.floor(env.t * 2.5) % 2 && !env.reduced ? 1 : 0;
    R(g, x0 + 30, y0 - 13, 1, 12, '#6c727a');
    R(g, x0 + 31, y0 - 13 + fl, 8, 6, PAL.w); R(g, x0 + 34, y0 - 12 + fl, 2, 4, PAL.G); R(g, x0 + 33, y0 - 11 + fl, 4, 2, PAL.G);
    if (env.theme === 'seollal' || env.theme === 'chuseok') { // 한옥풍: 기와지붕과 청사초롱
      var tile = '#3f4a5c', tileL = '#5c6a80';
      R(g, x0 - 5, y0 - 2, 50, 2, tile); R(g, x0 - 3, y0 - 4, 46, 2, tile); R(g, x0, y0 - 6, 40, 2, tile); R(g, x0 + 4, y0 - 8, 32, 2, tileL);
      R(g, x0 - 6, y0 - 3, 2, 1, tile); R(g, x0 + 44, y0 - 3, 2, 1, tile);
      for (var t = -2; t < 46; t += 3) R(g, x0 + t, y0 - 1, 1, 1, tileL);
      R(g, x0 - 2, y0 + 1, 1, 3, PAL.k); R(g, x0 - 3, y0 + 4, 3, 2, PAL.r); R(g, x0 - 3, y0 + 6, 3, 2, PAL.B);
      R(g, x0 + 41, y0 + 1, 1, 3, PAL.k); R(g, x0 + 40, y0 + 4, 3, 2, PAL.r); R(g, x0 + 40, y0 + 6, 3, 2, PAL.B);
    } else if (env.season === 'winter') {
      R(g, x0 - 1, y0 - 2, 42, 2, '#f4f7fa'); R(g, x0 + 3, y0 - 3, 30, 1, '#f4f7fa'); R(g, x0 + 4, y0 - 6, 7, 1, '#f4f7fa');
    }
    // 벽돌 더미(엇갈린 줄눈), 시멘트 포대, 고깔
    R(g, x0 + 44, gy - 6, 11, 6, '#b5705f'); R(g, x0 + 47, gy - 10, 8, 4, '#b5705f');
    for (var b = 0; b < 5; b++) {
      var byy = gy - 2 - b * 2;
      R(g, x0 + (b >= 3 ? 47 : 44), byy + 1, b >= 3 ? 8 : 11, 1, '#8f5547');
      for (i = (b % 2 ? 2 : 0); i < (b >= 3 ? 8 : 11); i += 4) R(g, x0 + (b >= 3 ? 47 : 44) + i, byy, 1, 1, '#8f5547');
    }
    R(g, x0 + 44, gy - 6, 11, 1, '#c98877'); R(g, x0 + 47, gy - 10, 8, 1, '#c98877');
    R(g, x0 - 13, gy - 5, 9, 5, '#cfc8b8'); R(g, x0 - 12, gy - 8, 8, 3, '#dcd6c8'); R(g, x0 - 13, gy - 3, 9, 1, '#a9a394');
    R(g, x0 - 10, gy - 7, 4, 1, '#8fa3b5'); R(g, x0 - 11, gy - 2, 5, 1, '#8fa3b5'); R(g, x0 - 13, gy - 5, 9, 1, '#e6e1d4');
    cone(g, x0 + 59, gy);
  }

  // 현장 왼쪽 끝의 간이 화장실과 드럼통, 오른쪽 끝(다음 터 너머)의 굴착기와 흙더미
  function drawYard(g, X, gy, env, endX) {
    var S = CP.sprites, x = X(3);
    S.stamp(g, 'toilet', TOILET, x, gy - 14);
    if (env.season === 'winter') R(g, x, gy - 15, 10, 1, '#f4f7fa');
    x = X(endX);
    // 흙더미와 꽂아 둔 삽
    R(g, x - 26, gy - 4, 16, 4, '#a58c6f'); R(g, x - 23, gy - 7, 10, 3, '#a58c6f'); R(g, x - 20, gy - 9, 5, 2, '#b39a7c');
    R(g, x - 25, gy - 1, 14, 1, '#8a7359'); R(g, x - 21, gy - 5, 2, 1, '#8a7359'); R(g, x - 16, gy - 3, 2, 1, '#8a7359'); R(g, x - 19, gy - 8, 2, 1, '#c2aa8c');
    if (env.season === 'winter') { R(g, x - 20, gy - 10, 5, 1, '#f4f7fa'); R(g, x - 23, gy - 8, 3, 1, '#f4f7fa'); }
    // 굴착기: 팔이 천천히 오르내린다
    var bob = env.reduced ? 0 : Math.round(Math.sin(env.t * 0.8) * 1.2);
    S.stamp(g, 'exc-arm', EXCAVATOR_ARM, x - 6, gy - 16 + bob);
    S.stamp(g, 'exc-body', EXCAVATOR_BODY, x + 1, gy - 11);
    // 손수레와 드럼통, 쌓아 둔 관
    S.stamp(g, 'barrow', BARROW, x + 24, gy - 6);
    S.stamp(g, 'drum', DRUM, x + 42, gy - 7); S.stamp(g, 'drum', DRUM, x + 49, gy - 7);
    R(g, x + 58, gy - 3, 12, 3, '#9aa0a6'); R(g, x + 60, gy - 6, 8, 3, '#9aa0a6'); R(g, x + 58, gy - 3, 12, 1, '#c3c8cd'); R(g, x + 60, gy - 6, 8, 1, '#c3c8cd');
    for (var i = 0; i < 3; i++) { R(g, x + 59 + i * 4, gy - 2, 2, 2, '#4a4f58'); if (i < 2) R(g, x + 61 + i * 4, gy - 5, 2, 2, '#4a4f58'); }
  }

  function cone(g, x, gy) {
    R(g, x - 1, gy - 1, 5, 1, '#3a3f52'); R(g, x, gy - 3, 3, 2, PAL.y); R(g, x + 1, gy - 5, 1, 2, PAL.y); R(g, x, gy - 3, 3, 1, PAL.w);
  }

  // 공사장 울타리: 건물 뒤로 이어지는 노랑/먹색 안전 바리케이드
  function drawFence(g, fromX, toX, gy) {
    for (var x = Math.round(fromX); x < toX; x += 24) {
      R(g, x, gy - 8, 1, 8, '#6c727a'); R(g, x + 17, gy - 8, 1, 8, '#6c727a');
      R(g, x - 1, gy - 1, 3, 1, '#4f555e'); R(g, x + 16, gy - 1, 3, 1, '#4f555e'); // 받침
      R(g, x - 1, gy - 8, 20, 3, PAL.y); R(g, x - 1, gy - 8, 20, 1, '#f8dc78');
      for (var k = 1; k < 19; k += 6) { R(g, x + k, gy - 8, 2, 1, PAL.k); R(g, x + k + 1, gy - 7, 2, 1, PAL.k); R(g, x + k + 2, gy - 6, 2, 1, PAL.k); }
      R(g, x + 1, gy - 4, 16, 1, '#8b9099'); // 아래 가로대
      R(g, x + 8, gy - 10, 2, 2, '#b99a4c'); R(g, x + 8, gy - 10, 1, 1, '#e6cf8a'); // 경고등(밤에 깜빡인다)
      R(g, x + 20, gy - 5, 2, 1, '#8b9099'); // 다음 칸과 잇는 사슬
    }
  }

  // 울타리 경고등의 불빛(색조를 입힌 뒤)
  function drawFenceLights(g, fromX, toX, gy, env) {
    if (env.night < 0.5) return;
    var a = CP.clamp((env.night - 0.5) / 0.3, 0, 1), n = 0;
    for (var x = Math.round(fromX); x < toX; x += 24, n++) {
      if ((Math.floor(env.t * 1.6) + n) % 2 && !env.reduced) continue;
      g.fillStyle = 'rgba(255,214,110,' + a + ')'; g.fillRect(x + 8, gy - 10, 2, 2);
      g.fillStyle = 'rgba(255,214,110,' + (a * 0.16).toFixed(3) + ')'; g.fillRect(x + 6, gy - 12, 6, 6);
    }
  }

  // 가로등: 건물 사이 빈자리에 선다. worldXs는 화면 x 목록.
  function drawLamps(g, xs, gy) {
    for (var i = 0; i < xs.length; i++) {
      var x = xs[i];
      R(g, x, gy - 32, 1, 32, '#59606b'); R(g, x - 1, gy - 2, 3, 2, '#474d57');
      R(g, x, gy - 33, 5, 1, '#59606b'); R(g, x + 3, gy - 32, 3, 1, '#d9d4c0'); R(g, x + 1, gy - 31, 1, 1, '#59606b');
    }
  }
  function drawLampLights(g, xs, gy, env) {
    if (env.night < 0.4) return;
    var a = CP.clamp((env.night - 0.4) / 0.35, 0, 1);
    for (var i = 0; i < xs.length; i++) {
      var x = xs[i];
      g.fillStyle = 'rgba(255,240,190,' + a + ')'; g.fillRect(x + 3, gy - 32, 3, 1);
      for (var k = 0; k < 6; k++) { // 아래로 퍼지는 빛
        g.fillStyle = 'rgba(255,226,150,' + (a * (0.13 - k * 0.018)).toFixed(3) + ')';
        g.fillRect(x + 2 - k * 2, gy - 31 + k * 5, 5 + k * 4, 5);
      }
      g.fillStyle = 'rgba(255,226,150,' + (a * 0.1).toFixed(3) + ')'; g.fillRect(x - 9, gy - 1, 26, 2);
    }
  }

  CP.world = {
    SKY: SKY, FH: FH,
    R: R, dither: dither, buildingLook: buildingLook, drawBuilding: drawBuilding, drawBuildingLights: drawBuildingLights,
    drawSky: drawSky, drawFar: drawFar, drawCrane: drawCrane, drawGround: drawGround,
    drawOffice: drawOffice, drawYard: drawYard, drawFence: drawFence, drawFenceLights: drawFenceLights,
    drawLamps: drawLamps, drawLampLights: drawLampLights, cone: cone, roofTop: roofTop,
    heightOf: function (b) { return 3 + Math.max(1, b.floors) * FH + (b.vis >= 4 ? roofTop(b) : 0); },
  };
})();
