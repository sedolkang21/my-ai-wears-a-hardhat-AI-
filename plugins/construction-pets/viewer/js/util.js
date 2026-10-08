// 작은 도구 모음. 모든 뷰어 코드는 전역 CP 아래에 붙는다.
(function () {
  'use strict';
  var CP = (window.CP = window.CP || {});

  CP.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  CP.lerp = function (a, b, t) { return a + (b - a) * t; };

  // 문자열 -> 32비트 해시. 건물 모양을 파일 이름으로 정할 때 쓴다(같은 파일은 늘 같은 건물).
  CP.hash = function (s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };

  CP.rng = function (seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  CP.pick = function (list, r) {
    if (!list || !list.length) return undefined;
    return list[Math.floor((r === undefined ? Math.random() : r) * list.length) % list.length];
  };

  function rgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  CP.rgb = rgb;
  CP.mixRgb = function (a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  };
  CP.css = function (c, alpha) {
    var s = Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]);
    return alpha === undefined ? 'rgb(' + s + ')' : 'rgba(' + s + ',' + alpha + ')';
  };
  CP.shade = function (hex, t) { // t<0 어둡게, t>0 밝게
    var c = rgb(hex);
    return CP.css(CP.mixRgb(c, t < 0 ? [20, 22, 40] : [255, 255, 255], Math.abs(t)));
  };

  CP.baseName = function (p) {
    if (!p) return '';
    var i = p.lastIndexOf('/');
    return i >= 0 ? p.slice(i + 1) : p;
  };

  // 저장소는 없어도 화면이 정상으로 나와야 한다.
  CP.store = {
    get: function (key, fallback) {
      try {
        var raw = window.localStorage.getItem('cp:' + key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    set: function (key, value) {
      try { window.localStorage.setItem('cp:' + key, JSON.stringify(value)); } catch (e) { /* 저장 불가 */ }
    },
  };

  CP.reducedMotion = (function () {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  })();

  CP.el = function (tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };

  CP.pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
  CP.ymd = function (d) { return d.getFullYear() + '-' + CP.pad2(d.getMonth() + 1) + '-' + CP.pad2(d.getDate()); };
})();
