// 작은 QR 코드 만들기. 폰에서 뷰어 주소를 찍어 열 때 쓴다. 외부 패키지 없이 직접 계산한다.
// 바이트 모드, 오류 정정 수준 M, 버전 1~6(글자 106바이트까지)만 다룬다. 주소 하나에는 충분하다.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.CP = root.CP || {}).qr = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 버전별(수준 M): 블록 수, 블록당 데이터 코드워드, 블록당 오류 정정 코드워드
  var VERSIONS = [null,
    { blocks: 1, data: 16, ec: 10 }, { blocks: 1, data: 28, ec: 16 }, { blocks: 1, data: 44, ec: 26 },
    { blocks: 2, data: 32, ec: 18 }, { blocks: 2, data: 43, ec: 24 }, { blocks: 4, data: 27, ec: 16 }];

  // GF(256), 원시 다항식 0x11d
  var EXP = new Array(512), LOG = new Array(256);
  (function () {
    var x = 1, i;
    for (i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
    for (i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();
  function mul(a, b) { return a && b ? EXP[LOG[a] + LOG[b]] : 0; }

  function generator(n) { // 최고차항부터, 맨 앞은 1
    var g = [1];
    for (var i = 0; i < n; i++) {
      var next = g.concat([0]);
      for (var j = 0; j < g.length; j++) next[j + 1] ^= mul(g[j], EXP[i]);
      g = next;
    }
    return g;
  }

  function remainder(data, gen) {
    var n = gen.length - 1, res = new Array(n).fill(0);
    for (var i = 0; i < data.length; i++) {
      var factor = data[i] ^ res[0];
      res.shift(); res.push(0);
      for (var j = 0; j < n; j++) res[j] ^= mul(gen[j + 1], factor);
    }
    return res;
  }

  function utf8(text) {
    var out = [], s = unescape(encodeURIComponent(String(text)));
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
    return out;
  }

  function codewords(bytes, version) {
    var V = VERSIONS[version], capacity = V.blocks * V.data, bits = [];
    var push = function (value, len) { for (var i = len - 1; i >= 0; i--) bits.push((value >>> i) & 1); };
    push(4, 4); push(bytes.length, 8);
    for (var i = 0; i < bytes.length; i++) push(bytes[i], 8);
    push(0, Math.min(4, capacity * 8 - bits.length));
    while (bits.length % 8) bits.push(0);
    var data = [];
    for (i = 0; i < bits.length; i += 8) {
      var b = 0;
      for (var k = 0; k < 8; k++) b = (b << 1) | bits[i + k];
      data.push(b);
    }
    for (var pad = 0xec; data.length < capacity; pad ^= 0xec ^ 0x11) data.push(pad);

    var gen = generator(V.ec), blocks = [], ecs = [], out = [];
    for (i = 0; i < V.blocks; i++) {
      var block = data.slice(i * V.data, (i + 1) * V.data);
      blocks.push(block); ecs.push(remainder(block, gen));
    }
    for (i = 0; i < V.data; i++) for (k = 0; k < V.blocks; k++) out.push(blocks[k][i]);
    for (i = 0; i < V.ec; i++) for (k = 0; k < V.blocks; k++) out.push(ecs[k][i]);
    return out;
  }

  var MASKS = [
    function (x, y) { return (x + y) % 2 === 0; },
    function (x, y) { return y % 2 === 0; },
    function (x, y) { return x % 3 === 0; },
    function (x, y) { return (x + y) % 3 === 0; },
    function (x, y) { return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; },
    function (x, y) { return (x * y) % 2 + (x * y) % 3 === 0; },
    function (x, y) { return ((x * y) % 2 + (x * y) % 3) % 2 === 0; },
    function (x, y) { return ((x + y) % 2 + (x * y) % 3) % 2 === 0; },
  ];

  function penalty(m, size) {
    var score = 0, x, y, dark = 0;
    for (var pass = 0; pass < 2; pass++) {
      for (y = 0; y < size; y++) {
        var run = 1, hist = '';
        for (x = 0; x < size; x++) {
          var v = pass ? m[x][y] : m[y][x];
          hist += v ? '1' : '0';
          if (x > 0) {
            var prev = pass ? m[x - 1][y] : m[y][x - 1];
            if (v === prev) { run++; if (run === 5) score += 3; else if (run > 5) score++; } else run = 1;
          }
        }
        var at = -1;
        while ((at = hist.indexOf('10111010000', at + 1)) >= 0) score += 40;
        at = -1;
        while ((at = hist.indexOf('00001011101', at + 1)) >= 0) score += 40;
      }
    }
    for (y = 0; y < size - 1; y++) for (x = 0; x < size - 1; x++) {
      var c = m[y][x];
      if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) score += 3;
    }
    for (y = 0; y < size; y++) for (x = 0; x < size; x++) dark += m[y][x];
    score += Math.floor(Math.abs(dark * 100 / (size * size) - 50) / 5) * 10;
    return score;
  }

  // 글자를 QR로 바꾼다. 반환: { size, rows } (rows[y][x]가 1이면 검은 칸). 너무 길면 null.
  function make(text) {
    var bytes = utf8(text), version = 0, v, x, y, i;
    for (v = 1; v < VERSIONS.length; v++) {
      if (12 + bytes.length * 8 <= VERSIONS[v].blocks * VERSIONS[v].data * 8) { version = v; break; }
    }
    if (!version) return null;
    var size = 17 + version * 4, m = [], fn = [];
    for (y = 0; y < size; y++) { m.push(new Array(size).fill(0)); fn.push(new Array(size).fill(false)); }
    var set = function (sx, sy, dark) { m[sy][sx] = dark ? 1 : 0; fn[sy][sx] = true; };

    for (i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); } // 타이밍 무늬
    var finder = function (cx, cy) {
      for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
        var fx = cx + dx, fy = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
        if (fx >= 0 && fx < size && fy >= 0 && fy < size) set(fx, fy, d !== 2 && d !== 4);
      }
    };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    if (version >= 2) { // 정렬 무늬는 이 범위의 버전에서 오른쪽 아래 하나뿐이다
      for (y = -2; y <= 2; y++) for (x = -2; x <= 2; x++) set(size - 7 + x, size - 7 + y, Math.max(Math.abs(x), Math.abs(y)) !== 1);
    }
    var format = function (mask) { // 오류 정정 수준 M은 00
      var data = mask, rem = data, bit = function (n) { return ((bits >>> n) & 1) !== 0; }, bits, k;
      for (k = 0; k < 10; k++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      bits = ((data << 10) | rem) ^ 0x5412;
      for (k = 0; k <= 5; k++) set(8, k, bit(k));
      set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
      for (k = 9; k < 15; k++) set(14 - k, 8, bit(k));
      for (k = 0; k < 8; k++) set(size - 1 - k, 8, bit(k));
      for (k = 8; k < 15; k++) set(8, size - 15 + k, bit(k));
      set(8, size - 8, true);
    };
    format(0); // 자리만 먼저 잡아 둔다

    var data = codewords(bytes, version), n = 0;
    for (var right = size - 1; right >= 1; right -= 2) { // 오른쪽 아래부터 두 칸씩 지그재그
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) {
        for (var j = 0; j < 2; j++) {
          x = right - j;
          y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
          if (!fn[y][x] && n < data.length * 8) { m[y][x] = (data[n >>> 3] >>> (7 - (n & 7))) & 1; n++; }
        }
      }
    }

    var apply = function (mask) {
      for (var yy = 0; yy < size; yy++) for (var xx = 0; xx < size; xx++) if (!fn[yy][xx] && MASKS[mask](xx, yy)) m[yy][xx] ^= 1;
    };
    var best = 0, bestScore = Infinity;
    for (i = 0; i < 8; i++) {
      apply(i); format(i);
      var s = penalty(m, size);
      if (s < bestScore) { bestScore = s; best = i; }
      apply(i);
    }
    apply(best); format(best);
    return { size: size, rows: m, version: version, mask: best };
  }

  return { make: make };
});
