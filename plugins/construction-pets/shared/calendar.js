// 날짜 -> 계절과 행사. 서버 없이도, 브라우저 없이도 돌아가는 순수 계산이라 따로 시험한다.
// 날짜는 PC 시계(지역 시간)만 쓴다.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.CP = root.CP || {}).calendar = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var DAY = 86400000;

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function md(d) { return pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function atNoon(y, mmdd) { return new Date(y, +mmdd.slice(0, 2) - 1, +mmdd.slice(3, 5), 12); }
  function noonOf(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime(); }

  // 범위 안이면 그 범위의 날 수를, 아니면 0을 돌려준다. '12-29'~'01-03'처럼 해를 넘는 범위도 된다.
  function inRange(date, from, to) {
    var y = date.getFullYear(), noon = noonOf(date);
    for (var k = -1; k <= 1; k++) {
      var a = atNoon(y + k, from).getTime(), b = atNoon(from > to ? y + k + 1 : y + k, to).getTime();
      if (noon >= a && noon <= b) return Math.round((b - a) / DAY) + 1;
    }
    return 0;
  }

  // cfg: config/seasons.json, birthday: 'MM-DD' 또는 빈 값
  function resolve(date, cfg, birthday) {
    var out = { season: 'spring', seasonLabel: '봄', event: null, theme: null, date: date };
    if (!cfg) return out;
    var m = date.getMonth() + 1;
    (cfg.seasons || []).forEach(function (s) { if (s.months.indexOf(m) >= 0) { out.season = s.id; out.seasonLabel = s.label; } });
    var off = cfg.disabled || [], best = null, bestDays = 1e9;
    (cfg.events || []).forEach(function (ev) {
      if (off.indexOf(ev.id) >= 0) return;
      var days = 0;
      if (ev.user === 'birthday') {
        if (birthday && birthday === md(date)) days = -1; // 생일이 가장 우선
      } else if (ev.lunar) {
        var table = (cfg.lunar || {})[ev.lunar] || {}, pad = ev.pad || 0;
        var center = table[String(date.getFullYear())];
        if (center && Math.abs(noonOf(date) - atNoon(date.getFullYear(), center).getTime()) <= pad * DAY + 1000) days = pad * 2 + 1;
      } else {
        (ev.ranges || []).forEach(function (r) { var n = inRange(date, r[0], r[1]); if (n) days = n; });
      }
      if (days !== 0 && days < bestDays) { best = ev; bestDays = days; } // 겹치면 짧은 쪽이 우선
    });
    if (best) { out.event = { id: best.id, label: best.label }; out.theme = best.id; }
    return out;
  }

  return { resolve: resolve, inRange: inRange, md: md };
});
