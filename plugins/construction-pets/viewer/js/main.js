// 시작점: 설정을 읽고, 서버에 연결하고(없으면 데모), 1초에 30번 그린다.
(function () {
  'use strict';
  var CP = window.CP, Rd = CP.reduce;
  var canvas, ctx, wc, wg;
  var env = {
    t: 0, dt: 0, W: 320, H: 180, groundY: 150, reduced: CP.reducedMotion,
    sky: { top: [140, 195, 228], bot: [226, 241, 243] }, tint: [255, 255, 255], tintA: 0, night: 0, dayT: 0.4,
    season: 'spring', theme: null, event: null, date: new Date(),
    ground: CP.seasons.GROUND.spring, acc: {}, shower: false, fireflies: 0, craneBusy: false,
  };
  var dateOverride = null, dateStamp = 0, last = 0, demo = null, pinned = false;

  var app = (CP.app = {
    S: 4, W: 320, H: 180, config: null, prefs: { names: {}, settings: {} }, sites: [], byId: {}, scene: null,
    pointer: { inside: false, sx: 0, sy: 0, wx: 0, wyUp: 0 }, live: false, remote: false, standalone: false, env: env,

    date: function () { return dateOverride ? new Date(dateOverride.getTime()) : new Date(); },
    setDate: function (s) {
      var m = s && /^(\d{4})-(\d\d)-(\d\d)$/.exec(s);
      dateOverride = m ? new Date(+m[1], +m[2] - 1, +m[3], 12) : null;
      dateStamp = 0;
    },
    savePrefs: function (patch) {
      dateStamp = 0;
      if (app.remote) return; // 폰으로 들어온 화면은 보기만 한다
      if (app.live) {
        fetch('prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }).catch(function () {});
      } else CP.store.set('prefs', app.prefs);
    },
    loadFile: function (sc, path) {
      if (app.remote) return Promise.resolve(null); // 폰에서는 마지막으로 고친 부분만 본다
      if (!app.live || sc.demo) {
        var lines = CP.demo.files(CP.i18n.lang)[path];
        return Promise.resolve(lines ? { text: lines.join('\n'), note: CP.t('code.demo') } : null);
      }
      return fetch('file?site=' + encodeURIComponent(sc.id) + '&path=' + encodeURIComponent(path)).then(function (r) { return r.ok ? r.json() : null; });
    },
    show: function (id, pin) {
      var sc = app.byId[id];
      if (!sc || sc === app.scene) { if (pin) pinned = true; return; }
      app.scene = sc; sc.cam.ready = false; sc.dirty = true;
      if (pin) pinned = true;
      CP.ui.reset();
    },
  });

  function addScene(state, isDemo) {
    var sc = new CP.Scene(state);
    sc.demo = !!isDemo;
    app.byId[state.id] = sc;
    app.sites.push(sc);
    return sc;
  }

  function clearScenes() { app.sites = []; app.byId = {}; app.scene = null; CP.ui.reset(); }

  function placeholder() {
    var sc = addScene(Rd.newSite('empty', ''));
    sc.empty = true;
    app.scene = sc;
  }

  // 이벤트 하나를 알맞은 공사장에 넘긴다.
  function route(ev, isDemo) {
    var sc = app.byId[ev.site];
    if (!sc) {
      if (app.scene && app.scene.empty) clearScenes();
      sc = addScene(Rd.newSite(ev.site, ev.siteName || ev.site), isDemo);
      if (!app.scene) app.scene = sc;
    }
    // 고정해 두지 않았다면, 새로 일이 시작된 공사장으로 화면을 옮긴다
    if (sc !== app.scene && !pinned && (ev.type === 'prompt' || ev.type === 'session_start' || app.scene.state.ended)) app.show(sc.id);
    sc.handle(ev);
  }

  function startDemo() {
    clearScenes();
    demo = CP.demo.player(function (ev) {
      if (ev.type === '__reset') { clearScenes(); return; }
      var e = {}; for (var k in ev) e[k] = ev[k];
      e.siteName = ev.site; e.site = 'demo'; e.ts = Date.now();
      route(e, true);
    }, function () { return CP.i18n.lang; });
    CP.ui.status('demo', 'status.demo');
  }

  function connect() {
    var es = new EventSource('events');
    es.addEventListener('snapshot', function (m) {
      var snap = JSON.parse(m.data), keep = app.scene && app.scene.id;
      clearScenes();
      (snap.sites || []).forEach(function (s) { addScene(s); });
      if (!app.sites.length) placeholder();
      else {
        var best = app.byId[keep] || app.sites.slice().sort(function (a, b) { return b.state.updatedAt - a.state.updatedAt; })[0];
        app.scene = best;
      }
      CP.ui.status('live', app.remote ? 'status.phone' : 'status.live');
    });
    es.addEventListener('ev', function (m) { route(JSON.parse(m.data)); });
    es.addEventListener('prefs', function (m) {
      app.prefs = JSON.parse(m.data); dateStamp = 0;
      if (!app.prefs.names) app.prefs.names = {};
      if (!app.prefs.settings) app.prefs.settings = {};
      CP.i18n.set(CP.i18n.resolve(app.prefs.settings.lang, app.remote)); // 다른 창에서 언어를 바꿨을 수 있다
      CP.ui.syncSettings();
      if (app.scene) app.scene.dirty = true;
    });
    es.onerror = function () { CP.ui.status('', 'status.retry'); }; // 브라우저가 알아서 다시 붙는다
  }

  function resize() {
    var vw = Math.max(200, window.innerWidth), vh = Math.max(160, window.innerHeight);
    // 도트 한 칸의 크기. 세로로는 장면이 110칸 넘게 보이게, 가로로는 넓은 창에서 260칸 넘게 보이게 맞춘다.
    // 그래서 가로로 긴 띠 모양 창에서도 펫이 작아지지 않고, 세로로 긴 폰 화면에서도 건물이 잘리지 않는다.
    var S = CP.clamp(Math.floor(vh / 110), 2, 6);
    S = Math.max(1, Math.min(S, vw >= 600 ? Math.max(2, Math.floor(vw / 260)) : Math.floor(vw / 124)));
    app.S = S; app.W = env.W = Math.ceil(vw / S); app.H = env.H = Math.ceil(vh / S);
    canvas.width = wc.width = app.W; canvas.height = wc.height = app.H;
    canvas.style.width = app.W * S + 'px'; canvas.style.height = app.H * S + 'px';
    ctx.imageSmoothingEnabled = false; wg.imageSmoothingEnabled = false;
    // 땅 띠는 아래 조작부와 건물 이름표가 들어갈 만큼 둔다
    var hud = document.getElementById('hud');
    env.groundY = app.H - Math.max(26, Math.ceil(((hud ? hud.offsetHeight : 44) + 26) / S) + 5);
    if (app.scene) app.scene.cam.ready = false;
  }

  function updateEnv(dt) {
    env.t += dt; env.dt = dt;
    var now = performance.now();
    if (!dateStamp || now - dateStamp > 30000) {
      dateStamp = now;
      var info = CP.seasons.resolve(app.date(), app.config.seasons, (app.prefs.settings || {}).birthday);
      env.season = info.season; env.theme = info.theme; env.event = info.event; env.date = info.date;
      env.ground = CP.seasons.GROUND[env.season] || CP.seasons.GROUND.spring;
      if (app.scene) app.scene.dirty = true;
    }
    var target = CP.world.SKY[app.scene ? Rd.phase(app.scene.state) : 'day'];
    var k = env.reduced ? 1 : 1 - Math.exp(-dt * 0.9); // 몇 초에 걸쳐 천천히 바뀐다
    env.sky.top = CP.mixRgb(env.sky.top, target.top, k);
    env.sky.bot = CP.mixRgb(env.sky.bot, target.bot, k);
    env.tint = CP.mixRgb(env.tint, target.tint, k);
    env.tintA += (target.alpha - env.tintA) * k;
    env.night += (target.night - env.night) * k;
    env.dayT += (target.dayT - env.dayT) * k;
    env.shower = env.season === 'summer' && !env.theme && (env.t % 80) > 58;
    env.fireflies = env.season !== 'winter' && env.night > 0.6 ? (env.night - 0.6) / 0.4 : 0;
    env.acc = CP.seasons.accessories(env);
    env.craneBusy = false;
  }

  function frame(ts) {
    requestAnimationFrame(frame);
    if (ts - last < 31) return; // 30fps로 제한
    var dt = Math.min(0.1, (ts - last) / 1000);
    last = ts;
    if (demo) demo.tick(dt);
    if (!app.scene) placeholder();
    var sc = app.scene;
    updateEnv(dt);
    sc.update(dt, env);
    for (var i = 0; i < app.sites.length; i++) if (app.sites[i] !== sc) app.sites[i].update(dt, env); // 안 보이는 공사장도 계속 짓는다

    var W = env.W, H = env.H, cam = Math.round(sc.cam.x);
    CP.world.drawSky(ctx, W, H, env);
    CP.world.drawFar(ctx, W, env.groundY, env, cam);
    CP.world.drawCrane(ctx, W, env.groundY, env, cam);
    var ff = env.fireflies; env.fireflies = 0;
    CP.seasons.drawSkyDeco(ctx, W, H, env);
    env.fireflies = ff;

    wg.clearRect(0, 0, W, H);
    sc.draw(wg, env);
    if (env.tintA > 0.01) { // 그린 곳에만 시간대 색을 입힌다
      wg.globalCompositeOperation = 'source-atop';
      wg.fillStyle = CP.css(env.tint, env.tintA.toFixed(3));
      wg.fillRect(0, 0, W, H);
      wg.globalCompositeOperation = 'source-over';
    }
    ctx.drawImage(wc, 0, 0);
    sc.drawLights(ctx, env);
    if (ff) { var th = env.theme; env.theme = null; CP.seasons.drawSkyDeco(ctx, W, H, env); env.theme = th; }
    CP.seasons.weather(env, dt, W, H);
    CP.seasons.drawWeather(ctx);
    CP.ui.frame(env);
  }

  function boot(cfg, live) {
    app.config = cfg; app.live = live; app.remote = !!cfg.remote;
    app.prefs = live ? (cfg.prefs || app.prefs) : CP.store.get('prefs', { names: {}, settings: {} });
    if (!app.prefs.names) app.prefs.names = {};
    if (!app.prefs.settings) app.prefs.settings = {};
    CP.i18n.set(CP.i18n.resolve(app.prefs.settings.lang, !live || app.remote), true);
    try { app.standalone = window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: minimal-ui)').matches; } catch (e) { app.standalone = false; }
    var skins = cfg.skins || {};
    for (var name in skins) CP.sprites.addSkin(name, skins[name]);

    var q = new URLSearchParams(location.search), hash = (location.hash || '').slice(1);
    var date = q.get('date') || (/^\d{4}-\d\d-\d\d$/.test(hash) ? hash : null);
    if (date) app.setDate(date);

    canvas = document.getElementById('world'); ctx = canvas.getContext('2d');
    wc = document.createElement('canvas'); wg = wc.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', function () { last = performance.now(); CP.audio.pause(document.hidden); });
    CP.ui.init();
    homeIcon();
    if (!live || q.get('demo') === '1' || hash === 'demo') startDemo(); else connect();
    if (live && !app.remote && app.standalone) oneWindow();
    requestAnimationFrame(function (ts) { last = ts - 33; frame(ts); });
  }

  // 전용 창은 하나만 둔다. 새 창이 뜨면 먼저 떠 있던 창이 스스로 닫힌다.
  function oneWindow() {
    try {
      var me = Date.now() + ':' + Math.random(), ch = new BroadcastChannel('cp-window');
      ch.onmessage = function (m) { if (m.data && m.data.hello && m.data.hello !== me) { try { window.close(); } catch (e) { /* 못 닫으면 둔다 */ } } };
      ch.postMessage({ hello: me });
    } catch (e) { /* BroadcastChannel이 없으면 그대로 둔다 */ }
  }

  // 폰 홈 화면에 추가했을 때 쓰이는 아이콘. 이미지 파일 없이 펫 그림으로 만든다.
  function homeIcon() {
    try {
      var small = document.createElement('canvas'); small.width = 20; small.height = 20;
      var kind = app.config.pets.kinds.claude;
      CP.sprites.drawPet(small.getContext('2d'), 10, 18, { species: kind.species, colors: kind.colors, helmet: (app.config.pets.helmets || ['#F2C230'])[0], face: 1, eyes: {} });
      var big = document.createElement('canvas'); big.width = 180; big.height = 180;
      var g = big.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.fillStyle = '#9cc9e3'; g.fillRect(0, 0, 180, 180);
      g.fillStyle = '#8fc27a'; g.fillRect(0, 140, 180, 8);
      g.fillStyle = '#b9a084'; g.fillRect(0, 148, 180, 32);
      g.drawImage(small, 0, 0, 20, 20, 10, -6, 160, 160);
      var link = document.createElement('link'); link.rel = 'apple-touch-icon'; link.href = big.toDataURL('image/png');
      document.head.appendChild(link);
    } catch (e) { /* 아이콘은 없어도 된다 */ }
  }

  function start() {
    if (window.CP_BOOT) return boot(window.CP_BOOT, false); // 서버 없이 여는 데모 파일
    var tries = 0;
    (function load() {
      fetch('config').then(function (r) { return r.json(); }).then(function (cfg) {
        if (!cfg || !cfg.pets) throw new Error('bad config');
        boot(cfg, true);
      }).catch(function () {
        document.getElementById('status-text').textContent = CP.i18n.auto() === 'ko' ? '서버를 기다리는 중' : 'Waiting for the server';
        if (tries++ < 200) setTimeout(load, 3000);
      });
    })();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
