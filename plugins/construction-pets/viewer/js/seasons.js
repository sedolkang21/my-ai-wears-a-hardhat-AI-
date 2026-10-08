// 시즌 시스템. 긴 계절 배경 위에 짧은 행사를 덧씌운다. 날짜는 PC 시계만 쓴다.
(function () {
  'use strict';
  var CP = window.CP;
  var PAL = CP.sprites.PAL;
  var R = function (g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };

  var resolve = CP.calendar.resolve;

  var GROUND = {
    spring: { dirt: '#b9a084', top: '#8fc27a', edge: '#8f7a62', speck: '#a08a70', tuft: '#6aa85f', leaf: '#6aa85f' },
    summer: { dirt: '#b39a7e', top: '#6fae62', edge: '#876f58', speck: '#9a846a', tuft: '#4f9450', leaf: '#4f9450' },
    autumn: { dirt: '#b79c7c', top: '#c4aa62', edge: '#8d7558', speck: '#9e866a', tuft: '#a8904a', leaf: '#7f9a58' },
    winter: { dirt: '#b3aaa0', top: '#f4f7fa', edge: '#d3dbe3', speck: '#9c948a', tuft: '#e3eaf0', leaf: '#7fa08a' },
  };

  // 주 펫이 걸치는 것. 행사 소품이 계절 소품보다 우선한다.
  function accessories(env) {
    var a = {};
    if (env.season === 'spring') a.crown = true;
    else if (env.season === 'summer') { if (env.shower) a.neck = 'raincoat'; else a.head = 'straw'; }
    else if (env.season === 'autumn') a.neck = 'scarf';
    else if (env.season === 'winter') a.muffs = true;
    var E = {
      newyear: { head: 'newyear' }, seollal: { neck: 'hanbok', held: 'pouch' }, valentine: { neck: 'ribbon' },
      aprilfools: { face: 'mustache' }, childrensday: { head: 'paper' }, chuseok: { neck: 'hanbok', held: 'songpyeon' },
      hangul: { held: 'brush' }, halloween: { head: 'witch', back: 'wings' }, christmas: { head: 'santa', neck: 'muffler' },
      birthday: { head: 'party' },
    }[env.theme];
    if (E) {
      if (E.head) { a.head = E.head; a.crown = false; a.muffs = false; }
      for (var k in E) a[k] = E[k];
    }
    return a;
  }

  function banner(env) {
    var d = env.date, t = CP.t;
    if (!env.theme || env.theme === 'valentine') return null;
    if (env.theme === 'newyear') {
      if (d.getMonth() === 11) return t('banner.newyear.count', { n: 32 - d.getDate() });
      return t('banner.newyear', { y: d.getFullYear() });
    }
    var text = t('banner.' + env.theme);
    return text === 'banner.' + env.theme ? null : text; // 사전에 없는 행사는 현수막을 걸지 않는다
  }

  function disc(g, cx, cy, r, c) {
    g.fillStyle = c;
    for (var y = -r; y <= r; y++) { var h = Math.round(Math.sqrt(r * r - y * y)); g.fillRect(Math.round(cx - h), Math.round(cy + y), h * 2 + 1, 1); }
  }

  var LEAVES = {
    spring: [['#efb5cb', '#dc94b0', '#f8dbe6', '#fbeef3']],
    summer: [['#5c9c5a', '#467f4c', '#79b671', '#8fc784']],
    autumn: [['#d3aa45', '#b08a34', '#e5c466', '#f0d98a'], ['#b8544c', '#96403c', '#cf6f60', '#e08f78']],
  };

  // 울타리 뒤 거리 풍경: 전봇대와 전선, 가로수, 덤불. 계절마다 잎이 바뀐다.
  function drawTrees(g, W, gy, env, camX) {
    var par = 0.8, unit = 74, off = camX * par, i, k, h, x;
    var snow = '#f4f7fa', trunk = '#7a624c', trunkL = '#8f755c';

    // 전봇대와 늘어진 전선
    var pu = 148, ph = 42, wire = 'rgba(58,56,70,0.75)';
    var p0 = Math.floor(off / pu) - 1, p1 = Math.floor((off + W) / pu) + 1;
    for (i = p0; i <= p1; i++) {
      x = Math.round(i * pu + 40 - off);
      for (k = 0; k < pu; k += 2) { // 다음 전봇대까지 두 줄
        var t = k / pu, sag = 4 * t * (1 - t);
        R(g, x + k, gy - ph + 1 + sag * 6, 2, 1, wire);
        R(g, x + k, gy - ph + 6 + sag * 8, 2, 1, 'rgba(58,56,70,0.42)');
      }
      h = CP.hash('wire' + i);
      if (env.season !== 'winter' && h % 3 === 0) { // 전선에 앉은 새
        var bt = 0.25 + (h >>> 4) % 50 / 100, bx = x + Math.round(bt * pu), by = gy - ph + Math.round(4 * bt * (1 - bt) * 6);
        R(g, bx, by - 2, 3, 2, '#4a4658'); R(g, bx + 2, by - 3, 2, 2, '#4a4658'); R(g, bx + 4, by - 2, 1, 1, PAL.y);
      }
    }
    for (i = p0; i <= p1 + 1; i++) {
      x = Math.round(i * pu + 40 - off);
      R(g, x, gy - ph - 2, 2, ph + 2, '#6e5a48'); R(g, x, gy - ph - 2, 1, ph + 2, '#8a7460');
      R(g, x - 4, gy - ph, 10, 1, '#5a4a3c'); R(g, x - 3, gy - ph + 5, 8, 1, '#5a4a3c');
      R(g, x - 4, gy - ph - 1, 1, 1, '#d9d4c0'); R(g, x + 5, gy - ph - 1, 1, 1, '#d9d4c0'); R(g, x - 3, gy - ph + 4, 1, 1, '#d9d4c0'); R(g, x + 4, gy - ph + 4, 1, 1, '#d9d4c0');
      if (CP.hash('pole' + i) % 2) { R(g, x + 2, gy - ph + 8, 3, 5, '#8f979f'); R(g, x + 2, gy - ph + 8, 3, 1, '#b4bbc2'); R(g, x + 2, gy - ph + 12, 3, 1, '#6c727a'); } // 변압기
      if (env.season === 'winter') R(g, x - 4, gy - ph - 1, 10, 1, snow);
    }

    // 낮은 덤불
    for (i = Math.floor(off / 37) - 1; i <= Math.floor((off + W) / 37) + 1; i++) {
      h = CP.hash('bush' + i);
      if (h % 3 === 0) continue;
      x = Math.round(i * 37 + (h >>> 3) % 20 - off);
      var bw2 = 7 + (h >>> 8) % 5, leaf = env.ground.leaf, leafD = CP.shade(leaf, -0.2);
      R(g, x, gy - 4, bw2, 4, leaf); R(g, x + 1, gy - 6, bw2 - 3, 2, leaf); R(g, x + 3, gy - 7, 3, 1, leaf);
      R(g, x + bw2 - 3, gy - 3, 3, 3, leafD); R(g, x + 2, gy - 2, 2, 1, leafD);
      if (env.season === 'winter') { R(g, x + 1, gy - 6, bw2 - 3, 1, snow); R(g, x + 3, gy - 7, 3, 1, snow); }
      else if (env.season === 'spring') { R(g, x + 2, gy - 5, 1, 1, PAL.w); R(g, x + bw2 - 2, gy - 3, 1, 1, PAL.p); }
      else if (env.season === 'autumn') { R(g, x + 1, gy - 3, 1, 1, '#b8544c'); R(g, x + 4, gy - 6, 1, 1, '#d3aa45'); }
    }

    // 가로수: 넷 중 하나는 늘푸른 나무
    for (i = Math.floor(off / unit) - 1; i <= Math.floor((off + W) / unit) + 1; i++) {
      h = CP.hash('tree' + i);
      if (h % 5 === 0) continue;
      x = Math.round(i * unit + (h >>> 4) % 30 - off);
      var th = 12 + (h >>> 9) % 8;
      if ((h >>> 20) % 4 === 0) { // 침엽수
        var pine = env.season === 'winter' ? '#4f7f6a' : '#3f7d5a', pineD = '#2f6348';
        R(g, x, gy - 5, 2, 5, trunk);
        for (k = 0; k < 4; k++) {
          var wy = gy - 6 - k * 5, ww = 13 - k * 3;
          for (var r2 = 0; r2 < 5; r2++) { var rw = Math.max(1, ww - (4 - r2) * 2); R(g, x + 1 - Math.floor(rw / 2), wy - 4 + r2, rw, 1, r2 === 4 ? pineD : pine); }
          if (env.season === 'winter') R(g, x + 1 - Math.floor((ww - 6) / 2), wy - 3, Math.max(1, ww - 6), 1, snow);
        }
        if (env.theme === 'christmas') { R(g, x, gy - 27, 2, 1, PAL.y); R(g, x - 2, gy - 14, 1, 1, PAL.r); R(g, x + 3, gy - 19, 1, 1, PAL.y); R(g, x + 1, gy - 9, 1, 1, PAL.b); }
        continue;
      }
      R(g, x, gy - th, 2, th, trunk); R(g, x, gy - th, 1, th, trunkL);
      R(g, x - 2, gy - th + 4, 2, 1, trunk); R(g, x + 2, gy - th + 6, 2, 1, trunk); R(g, x - 1, gy - 1, 4, 1, '#6a5340');
      var cy = gy - th - 3, r = 6 + (h >>> 13) % 3;
      if (env.season === 'winter') { // 잎 진 가지와 쌓인 눈
        R(g, x - 4, cy + 2, 4, 1, trunk); R(g, x + 2, cy, 4, 1, trunk); R(g, x - 3, cy - 3, 3, 1, trunk); R(g, x + 1, cy - 5, 1, 6, trunk);
        R(g, x - 5, cy + 1, 1, 1, trunk); R(g, x + 6, cy - 1, 1, 1, trunk); R(g, x + 2, cy - 4, 3, 1, trunk); R(g, x - 1, cy - 7, 1, 3, trunk);
        R(g, x - 4, cy + 1, 4, 1, snow); R(g, x + 2, cy - 1, 4, 1, snow); R(g, x - 3, cy - 4, 3, 1, snow); R(g, x + 2, cy - 5, 3, 1, snow);
        continue;
      }
      var set = LEAVES[env.season] || LEAVES.spring, c = set[(h >>> 16) % set.length];
      disc(g, x + 1, cy, r, c[0]); disc(g, x - r + 2, cy + 2, 3, c[0]); disc(g, x + r, cy + 1, 3, c[0]);
      disc(g, x + 3, cy + 2, r - 3, c[1]);                    // 그늘
      disc(g, x - 1, cy - 2, r - 2, c[2]);                    // 빛
      disc(g, x - 2, cy - 3, 1, c[3]);
      R(g, x + 3, cy - 1, 1, 1, c[3]); R(g, x - 3, cy + 2, 1, 1, c[3]); R(g, x, cy - 4, 1, 1, c[3]); R(g, x + 5, cy + 3, 1, 1, c[0]); R(g, x - 4, cy - 1, 1, 1, c[1]);
      R(g, x + 1, cy + r - 1, 2, 2, c[1]);
    }
  }

  var JAMO = {
    g: ['kkkk', '...k', '...k', '...k'], n: ['k...', 'k...', 'k...', 'kkkk'], h: ['.kk.', 'kkkk', '.kk.', 'k..k', '.kk.'],
    a: ['k..', 'k..', 'kk.', 'k..', 'k..'], m: ['kkkk', 'k..k', 'k..k', 'kkkk'],
  };

  // 사무소 둘레에 놓는 계절·행사 소품. X(worldX)는 화면 x로 바꿔 준다.
  function drawProps(g, env, X, gy, officeX) {
    var t = env.t, S = CP.sprites, x;
    var LX = officeX - 50, RX = officeX + 46; // 사무소 왼쪽과 오른쪽의 빈터
    // 계절
    if (env.season === 'spring') {
      x = X(RX);
      R(g, x, gy - 2, 26, 2, '#7a624c');
      for (var i = 0; i < 8; i++) { R(g, x + 1 + i * 3, gy - 4 - (i % 2), 1, 2 + (i % 2), '#6aa85f'); R(g, x + i * 3, gy - 5 - (i % 2), 3, 1, [PAL.p, PAL.w, PAL.y, PAL.v][i % 4]); R(g, x + 1 + i * 3, gy - 6 - (i % 2), 1, 1, [PAL.p, PAL.w, PAL.y, PAL.v][i % 4]); }
    } else if (env.season === 'summer') {
      x = X(LX);
      R(g, x + 9, gy - 22, 1, 22, '#6c727a');
      for (var p = 0; p < 5; p++) R(g, x + p * 2, gy - 22 - p + (p > 2 ? (p - 2) * 2 : 0), 19 - p * 4, 1, p % 2 ? PAL.w : PAL.b);
      R(g, x - 1, gy - 22, 21, 1, PAL.b); R(g, x + 1, gy - 23, 17, 1, PAL.w); R(g, x + 4, gy - 24, 11, 1, PAL.b); R(g, x + 7, gy - 25, 5, 1, PAL.w);
      R(g, x + 13, gy - 4, 8, 4, '#a58c6f'); R(g, x + 13, gy - 7, 7, 3, PAL.G); R(g, x + 14, gy - 7, 5, 2, PAL.r); R(g, x + 16, gy - 6, 1, 1, PAL.k);
    } else if (env.season === 'autumn') {
      x = X(RX + 2);
      R(g, x, gy - 3, 12, 3, '#b8544c'); R(g, x + 2, gy - 5, 8, 2, '#d3aa45'); R(g, x + 4, gy - 6, 4, 1, '#cf6f60'); R(g, x + 1, gy - 2, 3, 1, '#e5c466'); R(g, x + 8, gy - 4, 2, 1, '#e5c466');
      R(g, x + 16, gy - 14, 1, 14, '#8a6a4a'); R(g, x + 14, gy - 2, 5, 1, '#6c727a'); R(g, x + 14, gy - 1, 1, 1, '#6c727a'); R(g, x + 16, gy - 1, 1, 1, '#6c727a'); R(g, x + 18, gy - 1, 1, 1, '#6c727a');
    } else if (env.season === 'winter') {
      x = X(LX + 6); // 군고구마 통
      R(g, x, gy - 12, 10, 12, '#5d6470'); R(g, x, gy - 12, 10, 1, '#868d99'); R(g, x + 1, gy - 6, 8, 1, '#444a55'); R(g, x + 3, gy - 4, 4, 3, '#2b2433');
      R(g, x + 4, gy - 3, 2, 2, Math.floor(t * 4) % 2 ? '#ffd680' : '#f2a65a'); R(g, x + 8, gy - 18, 2, 6, '#5d6470');
      var sm = (t * 6) % 12; R(g, x + 8 + Math.sin(t * 2) * 1.5, gy - 20 - sm, 2, 2, 'rgba(240,240,245,' + (1 - sm / 12).toFixed(2) + ')');
      x = X(RX + 8); // 눈사람
      disc(g, x + 4, gy - 4, 4, '#f4f7fa'); disc(g, x + 4, gy - 11, 3, '#f4f7fa'); R(g, x + 3, gy - 12, 1, 1, PAL.k); R(g, x + 5, gy - 12, 1, 1, PAL.k); R(g, x + 2, gy - 9, 5, 1, PAL.r); R(g, x + 4, gy - 5, 1, 1, PAL.k);
    }

    // 행사
    var th = env.theme;
    if (th === 'halloween') {
      var px = [LX + 4, RX + 2, RX + 16];
      for (var j = 0; j < px.length; j++) {
        x = X(px[j]); var glow = env.night > 0.4 || Math.floor(t * 2 + j) % 5 === 0;
        R(g, x + 1, gy - 6, 7, 6, '#c9722e'); R(g, x, gy - 5, 9, 4, '#c9722e'); R(g, x + 4, gy - 8, 1, 2, PAL.G);
        R(g, x + 2, gy - 4, 1, 1, glow ? '#ffe08a' : PAL.k); R(g, x + 6, gy - 4, 1, 1, glow ? '#ffe08a' : PAL.k); R(g, x + 3, gy - 2, 3, 1, glow ? '#ffe08a' : PAL.k);
      }
      x = X(officeX - 20); // 거미줄
      for (var w = 0; w < 7; w++) { R(g, x + w, gy - 22 + w, 1, 1, '#e9edf2'); if (w % 2) { R(g, x, gy - 22 + w, w, 1, 'rgba(233,237,242,0.5)'); } }
      x = X(officeX + 30 + Math.sin(t * 0.5) * 26); var gyy = gy - 40 + Math.sin(t * 1.3) * 3; // 귀여운 유령
      R(g, x + 1, gyy, 6, 1, PAL.w); R(g, x, gyy + 1, 8, 6, PAL.w); R(g, x, gyy + 7, 2, 1, PAL.w); R(g, x + 3, gyy + 7, 2, 1, PAL.w); R(g, x + 6, gyy + 7, 2, 1, PAL.w);
      R(g, x + 2, gyy + 3, 1, 2, PAL.k); R(g, x + 5, gyy + 3, 1, 2, PAL.k); R(g, x + 1, gyy + 5, 1, 1, PAL.p); R(g, x + 6, gyy + 5, 1, 1, PAL.p);
    } else if (th === 'christmas') {
      x = X(LX);
      R(g, x + 7, gy - 4, 3, 4, '#7a624c');
      for (var tier = 0; tier < 4; tier++) for (var row = 0; row < 4; row++) R(g, x + 8 - (row + 1 + tier), gy - 5 - (3 - tier) * 4 + row - 3, (row + 1 + tier) * 2 + 1, 1, row === 3 ? PAL.G : PAL.g);
      for (var o = 0; o < 9; o++) { var on = Math.floor(t * 2 + o) % 3; R(g, x + 3 + (o * 5) % 11, gy - 8 - (o * 3) % 15, 1, 1, [PAL.r, PAL.y, PAL.b][on]); }
      R(g, x + 8, gy - 25, 1, 3, PAL.y); R(g, x + 7, gy - 24, 3, 1, PAL.y);
      R(g, x + 15, gy - 4, 5, 4, PAL.r); R(g, x + 17, gy - 4, 1, 4, PAL.y); R(g, x + 21, gy - 3, 4, 3, PAL.b); R(g, x + 22, gy - 3, 1, 3, PAL.w);
      x = X(officeX - 20); // 지붕 전구
      for (var b = 0; b < 14; b++) R(g, x + b * 3, gy - 22 + (b % 2), 1, 1, Math.floor(t * 3 + b) % 2 ? [PAL.r, PAL.y, PAL.g, PAL.b][b % 4] : '#6c727a');
    } else if (th === 'childrensday' || th === 'birthday') {
      x = X(officeX + 22);
      var cols = [PAL.r, PAL.b, PAL.y, PAL.g, PAL.v];
      for (var q = 0; q < 5; q++) {
        var bx = x - 14 + q * 7 + Math.sin(t * 1.4 + q) * 1.5, byy = gy - 40 - (q % 2) * 5 + Math.sin(t * 1.1 + q * 2) * 1.5;
        R(g, bx + 2, byy + 6, 1, 12, 'rgba(60,60,80,0.5)');
        R(g, bx + 1, byy, 3, 1, cols[q]); R(g, bx, byy + 1, 5, 4, cols[q]); R(g, bx + 1, byy + 5, 3, 1, cols[q]); R(g, bx + 1, byy + 1, 1, 1, PAL.w);
      }
      if (th === 'birthday') { // 케이크
        x = X(RX + 6);
        R(g, x - 1, gy - 5, 14, 5, '#a58c6f'); R(g, x + 1, gy - 10, 10, 5, PAL.c); R(g, x + 1, gy - 8, 10, 1, PAL.p); R(g, x + 1, gy - 11, 10, 1, PAL.w);
        for (var cn = 0; cn < 3; cn++) { R(g, x + 3 + cn * 3, gy - 14, 1, 3, PAL.b); R(g, x + 3 + cn * 3, gy - 15 - (Math.floor(t * 6 + cn) % 2), 1, 1, '#ffd680'); }
      } else { // 바람개비
        x = X(RX + 10);
        R(g, x + 3, gy - 14, 1, 14, '#6c727a'); var ph = Math.floor(t * 6) % 2;
        if (ph) { R(g, x, gy - 17, 3, 3, PAL.r); R(g, x + 4, gy - 14, 3, 3, PAL.b); R(g, x + 4, gy - 17, 3, 3, PAL.y); R(g, x, gy - 14, 3, 3, PAL.g); }
        else { R(g, x + 2, gy - 19, 3, 3, PAL.r); R(g, x + 2, gy - 12, 3, 3, PAL.b); R(g, x + 6, gy - 15, 3, 3, PAL.y); R(g, x - 2, gy - 15, 3, 3, PAL.g); }
      }
    } else if (th === 'chuseok') { // 감나무
      x = X(LX + 6);
      R(g, x + 6, gy - 20, 2, 20, '#6e5642'); R(g, x + 1, gy - 22, 6, 1, '#6e5642'); R(g, x + 7, gy - 26, 7, 1, '#6e5642'); R(g, x + 3, gy - 30, 4, 1, '#6e5642'); R(g, x + 6, gy - 30, 1, 10, '#6e5642');
      var fr = [[1, -21], [4, -21], [12, -25], [9, -25], [3, -29], [7, -18]];
      for (var f = 0; f < fr.length; f++) { R(g, x + fr[f][0], gy + fr[f][1], 2, 2, '#e08a3c'); R(g, x + fr[f][0], gy + fr[f][1] - 1, 1, 1, PAL.G); }
    } else if (th === 'hangul') { // 자모 팻말
      var keys = ['g', 'n', 'h'];
      for (var jm = 0; jm < keys.length; jm++) {
        x = X(RX + jm * 11);
        R(g, x + 3, gy - 6, 1, 6, '#8a6a4a'); R(g, x, gy - 14, 8, 8, PAL.c); R(g, x, gy - 14, 8, 1, '#d6cdb5');
        g.drawImage(S.tile('jamo:' + keys[jm], JAMO[keys[jm]], PAL), x + 2, gy - 12);
      }
    } else if (th === 'aprilfools') { // 거꾸로 선 고깔
      x = X(RX + 8);
      R(g, x + 1, gy - 2, 1, 2, PAL.y); R(g, x, gy - 4, 3, 2, PAL.y); R(g, x - 1, gy - 5, 5, 1, '#3a3f52'); R(g, x, gy - 3, 3, 1, PAL.w);
    }
  }

  // 밤에도 환해야 하는 소품의 불빛. 색조를 입힌 뒤에 덧그린다.
  function drawPropLights(g, env, X, gy, officeX) {
    if (env.night < 0.4) return;
    var t = env.t, x, i, LX = officeX - 50, RX = officeX + 46, th = env.theme;
    if (th === 'halloween') {
      var px = [LX + 4, RX + 2, RX + 16];
      for (i = 0; i < px.length; i++) {
        x = X(px[i]);
        R(g, x - 1, gy - 7, 11, 8, 'rgba(255,190,90,0.12)');
        R(g, x + 2, gy - 4, 1, 1, '#ffe08a'); R(g, x + 6, gy - 4, 1, 1, '#ffe08a'); R(g, x + 3, gy - 2, 3, 1, '#ffe08a');
      }
    } else if (th === 'christmas') {
      x = X(LX);
      for (i = 0; i < 9; i++) R(g, x + 3 + (i * 5) % 11, gy - 8 - (i * 3) % 15, 1, 1, [PAL.r, PAL.y, PAL.b][Math.floor(t * 2 + i) % 3]);
      R(g, x + 8, gy - 25, 1, 3, '#fff3b0'); R(g, x + 7, gy - 24, 3, 1, '#fff3b0');
      x = X(officeX - 20);
      for (i = 0; i < 14; i++) if (Math.floor(t * 3 + i) % 2) R(g, x + i * 3, gy - 22 + (i % 2), 1, 1, [PAL.r, PAL.y, PAL.g, PAL.b][i % 4]);
    } else if (th === 'birthday') {
      x = X(RX + 6);
      for (i = 0; i < 3; i++) R(g, x + 3 + i * 3, gy - 15 - (Math.floor(t * 6 + i) % 2), 1, 1, '#ffd680');
    } else if (th === 'seollal' || th === 'chuseok') {
      x = X(officeX - 20);
      R(g, x - 4, gy - 19, 5, 6, 'rgba(255,170,120,0.25)'); R(g, x + 39, gy - 19, 5, 6, 'rgba(255,170,120,0.25)');
      R(g, x - 3, gy - 18, 3, 2, '#e8707a'); R(g, x + 40, gy - 18, 3, 2, '#e8707a');
    }
    if (env.season === 'winter') {
      x = X(LX + 6);
      R(g, x + 2, gy - 6, 6, 6, 'rgba(255,170,90,0.14)');
      R(g, x + 4, gy - 3, 2, 2, Math.floor(t * 4) % 2 ? '#ffd680' : '#f2a65a');
    }
  }

  // 하늘 장식: 불꽃놀이(새해)와 연(설날). 색조를 입힌 뒤 빛으로 그린다.
  function drawSkyDeco(g, W, H, env) {
    var t = env.t, i, k;
    if (env.theme === 'newyear' && !env.reduced) {
      for (i = 0; i < 3; i++) {
        var cyc = (t * 0.45 + i * 0.37) % 1, n = Math.floor(t * 0.45 + i * 0.37), r = CP.rng(n * 31 + i * 7);
        var cx = Math.floor(W * (0.15 + r() * 0.7)), cy = Math.floor(H * (0.12 + r() * 0.25)), col = [PAL.y, PAL.p, PAL.b, PAL.g, PAL.w][Math.floor(r() * 5)];
        if (cyc < 0.25) { R(g, cx, cy + (0.25 - cyc) * H * 0.9, 1, 3, 'rgba(255,240,200,0.8)'); continue; }
        var e = (cyc - 0.25) / 0.75, rad = 4 + e * 18, a = (1 - e).toFixed(2);
        g.fillStyle = col; g.globalAlpha = +a;
        for (k = 0; k < 14; k++) { var an = k / 14 * Math.PI * 2; g.fillRect(Math.round(cx + Math.cos(an) * rad), Math.round(cy + Math.sin(an) * rad + e * e * 6), 1, 1); if (k % 2) g.fillRect(Math.round(cx + Math.cos(an) * rad * 0.55), Math.round(cy + Math.sin(an) * rad * 0.55 + e * e * 4), 1, 1); }
        g.globalAlpha = 1;
      }
    }
    if (env.theme === 'seollal') {
      for (i = 0; i < 2; i++) {
        var kx = Math.round(W * (0.3 + i * 0.36) + Math.sin(t * 0.6 + i * 2) * 8), ky = Math.round(H * (0.2 + i * 0.07) + Math.sin(t * 0.9 + i) * 4);
        R(g, kx, ky, 9, 11, PAL.c); R(g, kx, ky, 9, 2, i ? PAL.b : PAL.r); R(g, kx, ky + 9, 9, 2, i ? PAL.r : PAL.b); R(g, kx + 3, ky + 4, 3, 3, i ? PAL.r : PAL.B);
        for (k = 0; k < 9; k++) R(g, kx + 4 - k * 2 + Math.sin(t * 2 + k) * 1.5, ky + 11 + k * 3, 1, 2, 'rgba(240,235,220,0.7)');
      }
    }
    if (env.fireflies && !env.reduced) {
      var fr = CP.rng(9);
      for (i = 0; i < 9; i++) {
        var fx = fr() * W + Math.sin(t * (0.3 + fr() * 0.4) + i) * 14, fy = env.groundY - 8 - fr() * 46 + Math.sin(t * (0.5 + fr() * 0.5) + i * 3) * 6;
        var fa = (Math.sin(t * (1 + fr()) + i * 1.7) + 1) / 2 * env.fireflies;
        g.fillStyle = 'rgba(250,240,150,' + fa.toFixed(2) + ')'; g.fillRect(Math.round(fx), Math.round(fy), 1, 1);
        g.fillStyle = 'rgba(250,240,150,' + (fa * 0.2).toFixed(2) + ')'; g.fillRect(Math.round(fx) - 1, Math.round(fy) - 1, 3, 3);
      }
    }
  }

  // 날리는 것들(꽃잎, 낙엽, 눈, 비). 화면 기준으로 떨어진다.
  var parts = [];
  function weather(env, dt, W, H) {
    if (env.reduced) { parts.length = 0; return; }
    var rate = 0, kind = null;
    if (env.shower) { rate = 55; kind = 'rain'; }
    else if (env.season === 'winter' || env.theme === 'christmas') { rate = 7; kind = 'snow'; }
    else if (env.season === 'spring') { rate = 2.2; kind = 'petal'; }
    else if (env.season === 'autumn') { rate = 1.6; kind = 'leaf'; }
    if (env.theme === 'valentine') { rate = 1.2; kind = 'heart'; }
    var n = rate * dt * (W / 320);
    var count = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
    for (var i = 0; i < count && parts.length < 400; i++) {
      var p = { x: Math.random() * (W + 40) - 20, y: -4, kind: kind, s: Math.random() * 6.28 };
      if (kind === 'rain') { p.vx = -30; p.vy = 190 + Math.random() * 40; }
      else if (kind === 'snow') { p.vx = -4 + Math.random() * 8; p.vy = 12 + Math.random() * 12; }
      else if (kind === 'heart') { p.y = env.groundY - 6; p.vx = 0; p.vy = -10 - Math.random() * 6; p.x = Math.random() * W; }
      else { p.vx = -10 - Math.random() * 10; p.vy = 12 + Math.random() * 10; p.c = Math.random(); }
      parts.push(p);
    }
    for (var j = parts.length - 1; j >= 0; j--) {
      var q = parts[j];
      q.s += dt * 3;
      q.x += (q.vx + (q.kind === 'rain' ? 0 : Math.sin(q.s) * 8)) * dt;
      q.y += q.vy * dt;
      if (q.y > env.groundY + 2 || q.y < -10 || q.x < -30) parts.splice(j, 1);
    }
  }

  function drawWeather(g) {
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i], x = Math.round(p.x), y = Math.round(p.y);
      if (p.kind === 'rain') { g.fillStyle = 'rgba(200,225,245,0.6)'; g.fillRect(x, y, 1, 3); }
      else if (p.kind === 'snow') { g.fillStyle = '#ffffff'; g.fillRect(x, y, 1, 1); }
      else if (p.kind === 'petal') { g.fillStyle = p.c > 0.5 ? '#f8dbe6' : '#efb5cb'; g.fillRect(x, y, 2, 1); }
      else if (p.kind === 'leaf') { g.fillStyle = p.c > 0.5 ? '#d3aa45' : '#b8544c'; g.fillRect(x, y, 2, 1); g.fillRect(x + (Math.sin(p.s) > 0 ? 1 : 0), y + 1, 1, 1); }
      else if (p.kind === 'heart') { g.fillStyle = PAL.p; g.fillRect(x, y, 1, 1); g.fillRect(x + 2, y, 1, 1); g.fillRect(x, y + 1, 3, 1); g.fillRect(x + 1, y + 2, 1, 1); }
    }
  }

  CP.seasons = {
    resolve: resolve, GROUND: GROUND, accessories: accessories, banner: banner,
    drawTrees: drawTrees, drawProps: drawProps, drawPropLights: drawPropLights, drawSkyDeco: drawSkyDeco, weather: weather, drawWeather: drawWeather,
    // 미리보기 칩: 각 계절과 행사의 대표 날짜
    samples: function (cfg, year) {
      var out = [{ label: CP.t('season.spring'), date: year + '-04-10' }, { label: CP.t('season.summer'), date: year + '-07-20' }, { label: CP.t('season.autumn'), date: year + '-10-15' }, { label: CP.t('season.winter'), date: year + '-01-20' }];
      ((cfg && cfg.events) || []).forEach(function (ev) {
        if (ev.user) return;
        var d = ev.lunar ? ((cfg.lunar[ev.lunar] || {})[String(year)]) : ev.ranges && ev.ranges[0][1];
        if (d) out.push({ label: String(CP.i18n.pick(ev.label)).split('·')[0].trim(), date: year + '-' + d });
      });
      return out;
    },
  };
})();
