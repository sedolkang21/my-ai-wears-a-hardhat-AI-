// 화면 위 글자 층과 조작부. 말풍선·간판·이름표는 DOM으로 그려서 글자가 또렷하게 보인다.
// 여기서 일어나는 상호작용은 모두 뷰어 안에서 끝나고, Claude Code로는 아무것도 보내지 않는다.
(function () {
  'use strict';
  var CP = window.CP, t = CP.t, $ = function (id) { return document.getElementById(id); };
  var overlay, stage, canvas;
  var bubbles = {}, boards = {}, tags = {};
  var bannerEl = null, signEl = null;
  var card = { pet: null };
  var drag = null, hover = null, rub = { pet: null, dist: 0, at: 0, lx: 0 }, calmTimer = null;
  var snackMode = false, lastPanel = '', lastHud = '', statusKey = ['', 'status.connecting'];

  function scene() { return CP.app.scene; }

  function place(el, cssX, cssY, anchor) { // anchor: 'bc' 아래 가운데, 'tc' 위 가운데
    var w = el.offsetWidth, h = el.offsetHeight, vw = stage.clientWidth;
    var x = CP.clamp(cssX - w / 2, 8, Math.max(8, vw - w - 8));
    var y = anchor === 'tc' ? cssY : cssY - h;
    el.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(Math.max(6, y)) + 'px)';
  }

  // ---------- 도트 아이콘 ----------
  // 9x9 글자 그림을 SVG 사각형으로 옮긴다. 색은 글자색(currentColor)을 따라가서 테마와 눌린 상태에 맞는다.
  var ICONS = {
    snack: ['..#####..', '.#######.', '##.###.##', '#########', '###.#####', '#####.###', '##.######', '.#######.', '..#####..'],
    cheer: ['....#....', '....#....', '...###...', '#########', '.#######.', '..#####..', '..##.##..', '.##...##.', '.#.....#.'],
    sound: ['....#....', '...##.#..', '#####..#.', '#####.#.#', '#####.#.#', '#####.#.#', '#####..#.', '...##.#..', '....#....'],
    phone: ['.#######.', '.#.....#.', '.#.....#.', '.#.....#.', '.#.....#.', '.#.....#.', '.#######.', '.###.###.', '.#######.'],
    full: ['###...###', '#.......#', '#.......#', '.........', '.........', '.........', '#.......#', '#.......#', '###...###'],
    detail: ['.........', '#.######.', '.........', '.........', '#.######.', '.........', '.........', '#.######.', '.........'],
    close: ['.........', '.##...##.', '.###.###.', '..#####..', '...###...', '..#####..', '.###.###.', '.##...##.', '.........'],
  };
  function icons(root) {
    var list = (root || document).querySelectorAll('svg[data-ico]'), NS = 'http://www.w3.org/2000/svg';
    for (var i = 0; i < list.length; i++) {
      var svg = list[i], rows = ICONS[svg.getAttribute('data-ico')];
      if (!rows || svg.firstChild) continue;
      svg.setAttribute('viewBox', '0 0 9 9'); svg.setAttribute('shape-rendering', 'crispEdges'); svg.setAttribute('aria-hidden', 'true');
      for (var y = 0; y < rows.length; y++) {
        for (var x = 0; x < rows[y].length; x++) {
          if (rows[y][x] !== '#') continue;
          var run = 1; while (rows[y][x + run] === '#') run++;
          var r = document.createElementNS(NS, 'rect');
          r.setAttribute('x', x); r.setAttribute('y', y); r.setAttribute('width', run); r.setAttribute('height', 1); r.setAttribute('fill', 'currentColor');
          svg.appendChild(r); x += run - 1;
        }
      }
    }
  }

  // ---------- 말풍선 ----------
  function bubble(pet, text, ms) {
    if (!overlay || !pet) return;
    var b = bubbles[pet.id];
    if (!b) {
      b = bubbles[pet.id] = { el: CP.el('div', 'bubble'), pet: pet };
      b.txt = CP.el('span'); b.el.appendChild(b.txt);
      overlay.appendChild(b.el);
    }
    b.pet = pet;
    b.txt.textContent = text;
    b.el.classList.remove('pop'); void b.el.offsetWidth; b.el.classList.add('pop');
    b.until = performance.now() + (ms || 2500);
  }

  // ---------- 코드 간판 ----------
  function board(b, lines) {
    if (!overlay) return;
    var key = b.path, o = boards[key];
    for (var other in boards) if (other !== key) { boards[other].el.remove(); delete boards[other]; } // 간판은 한 번에 하나만
    if (!o) {
      o = boards[key] = { el: CP.el('div', 'board'), b: b };
      o.title = CP.el('b'); o.pre = CP.el('pre');
      o.el.appendChild(o.title); o.el.appendChild(o.pre);
      overlay.appendChild(o.el);
    }
    o.title.textContent = b.name;
    o.pre.textContent = lines.slice(0, 5).join('\n');
    o.el.classList.remove('fade');
    o.until = performance.now() + 5200;
  }

  function activityText(pet) {
    var sc = scene(), info = sc && sc.state.pets[pet.id], a = info && info.activity;
    if (pet.leaving) return t('act.leaving');
    if (!a) return t('act.around');
    var f = a.file ? CP.baseName(a.file) : '';
    switch (a.kind) {
      case 'edit': return t('act.edit', { f: f || t('act.edit.none') });
      case 'read': return t('act.read', { f: f || a.detail || t('act.read.none') });
      case 'web': return t('act.web', { f: a.detail || t('act.web.none') });
      case 'bash': return t('act.bash', { f: a.detail || t('act.bash.none') });
      case 'plan': return t('act.plan');
      case 'delegate': return t('act.delegate');
      case 'prompt': return t('act.prompt');
      case 'permission': return t('act.permission');
      case 'idle': return t('act.idle');
      case 'done': return t('act.done');
      case 'fail': return t('act.fail');
      case 'lunch': return t('act.lunch');
      case 'worried': return t('act.worried');
      case 'sweep': return t('act.sweep');
      default: return t('act.tool', { f: a.tool || t('act.tool.none') });
    }
  }

  function siteName(sc) { return sc.empty || sc.state.name === '공사현장' ? t('site.default') : sc.state.name; }
  function seasonText(env) { return t('season.' + env.season) + (env.event ? ' · ' + CP.i18n.pick(env.event.label) : ''); }

  // ---------- 매 프레임: 글자 층 위치 맞추기 ----------
  function frame(env) {
    var sc = scene(), S = CP.app.S, now = performance.now(), id, key;
    if (!sc) return;
    var cam = Math.round(sc.cam.x), gy = sc.groundY;

    for (id in bubbles) {
      var bb = bubbles[id], p = bb.pet;
      if (now > bb.until || p.gone || p.scene !== sc) { bb.el.remove(); delete bubbles[id]; continue; }
      var bsx = (p.x - cam) * S;
      bb.el.hidden = bsx < -20 || bsx > stage.clientWidth + 20; // 화면 밖 펫의 말은 띄우지 않는다
      if (!bb.el.hidden) place(bb.el, bsx, (gy - p.z - (p.species === 'mini' ? 15 : 24)) * S - 12, 'bc');
    }
    for (key in boards) {
      var bo = boards[key];
      if (bo.b !== sc.B[key]) { bo.el.remove(); delete boards[key]; continue; }
      if (now > bo.until + 400) { bo.el.remove(); delete boards[key]; continue; }
      if (now > bo.until) bo.el.classList.add('fade');
      place(bo.el, (bo.b.x - cam) * S, (gy - CP.world.heightOf(bo.b) - 8) * S, 'bc');
    }
    // 건물 이름표
    for (key in tags) if (tags[key].b !== sc.B[key]) { tags[key].el.remove(); delete tags[key]; }
    for (var i = 0; i < sc.list.length; i++) {
      var b = sc.list[i], tg = tags[b.path];
      if (!tg) { tg = tags[b.path] = { el: CP.el('div', 'tag', b.name), b: b, done: null }; tg.el.style.maxWidth = Math.max(60, sc.pitch * S - 14) + 'px'; overlay.appendChild(tg.el); }
      if (tg.done !== b.done) { tg.done = b.done; tg.el.classList.toggle('done', !!b.done); }
      var sx = (b.x - cam) * S;
      var off = sx < -100 || sx > stage.clientWidth + 100 || b.vis < 1;
      tg.el.hidden = off;
      if (!off) tg.el.style.transform = 'translate(' + Math.round(sx - tg.el.offsetWidth / 2) + 'px,' + Math.round((gy + 5) * S) + 'px)';
    }
    // 현장 표지판
    if (!signEl) { signEl = CP.el('div', 'sitesign'); overlay.appendChild(signEl); }
    var signText = siteName(sc) + '\n' + t('site.sign');
    if (signEl.dataset.t !== signText) { signEl.dataset.t = signText; signEl.textContent = ''; signEl.appendChild(document.createTextNode(siteName(sc))); signEl.appendChild(CP.el('small', '', t('site.sign'))); }
    var ssx = (33 - cam) * S;
    signEl.hidden = ssx < -160 || ssx > stage.clientWidth + 160;
    // 만우절에는 표지판이 거꾸로 달린다
    if (!signEl.hidden) signEl.style.transform = 'translate(' + Math.round(ssx - signEl.offsetWidth / 2) + 'px,' + Math.round((gy - 22) * S - signEl.offsetHeight + 4) + 'px)' + (env.theme === 'aprilfools' ? ' rotate(180deg)' : '');
    // 행사 현수막
    var text = CP.seasons.banner(env);
    if (text) {
      if (!bannerEl) { bannerEl = CP.el('div', 'banner'); overlay.appendChild(bannerEl); }
      if (bannerEl.textContent !== text) bannerEl.textContent = text;
      var bx = (sc.officeX - cam) * S;
      bannerEl.hidden = bx < -160 || bx > stage.clientWidth + 160;
      if (!bannerEl.hidden) bannerEl.style.transform = 'translate(' + Math.round(bx - bannerEl.offsetWidth / 2) + 'px,' + Math.round((gy - 38) * S - bannerEl.offsetHeight) + 'px)';
    } else if (bannerEl) { bannerEl.remove(); bannerEl = null; }

    if (card.pet) {
      if (card.pet.gone || card.pet.scene !== sc) closeCard();
      else {
        var el = $('card'), cx = (card.pet.x - cam) * S, cy = (gy - 26) * S - 48; // 말풍선 위에 띄운다
        var x = CP.clamp(cx - 100, 8, Math.max(8, stage.clientWidth - 208)), y = Math.max(8, cy - el.offsetHeight - 6);
        el.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
        var doing = activityText(card.pet);
        if ($('card-doing').textContent !== doing) $('card-doing').textContent = doing;
      }
    }
    hud(sc, env);
    if (!$('panel').hidden && sc.dirty) panel(sc, env);
    sc.dirty = false;
  }

  // ---------- 진행률 ----------
  function hud(sc, env) {
    var st = sc.state, R = CP.reduce, c = R.taskCounts(st), p = R.progress(st), text;
    if (sc.empty) text = t('hud.ready');
    else if (st.ended) text = t('hud.left');
    else if (!st.turn.active && st.turn.finished && p >= 1) text = t('hud.done');
    else if (c.total) text = t('hud.tasks', { a: c.done, b: c.total });
    else if (st.turn.active) text = t('hud.working');
    else text = t('hud.waiting');
    var pct = Math.round(p * 100);
    var right = siteName(sc) + ' · ' + seasonText(env);
    var key = text + '|' + right + '|' + pct + '|' + (st.turn.active ? 1 : 0);
    if (key === lastHud) return;
    lastHud = key;
    $('progress-text').textContent = text + (pct > 0 && pct < 100 ? ' · ' + pct + '%' : '');
    $('progress-count').textContent = right;
    $('bar').firstElementChild.style.width = pct + '%';
    $('bar').setAttribute('aria-valuenow', String(pct));
    stage.classList.toggle('busy', !!st.turn.active && !st.ended);
  }

  // ---------- 상세 패널 ----------
  function panel(sc, env) {
    var st = sc.state, i, id;
    var info = $('site-info');
    info.textContent = '';
    var nm = CP.el('div', '', siteName(sc)); nm.id = 'site-name';
    info.appendChild(nm);
    info.appendChild(CP.el('p', 'muted', t('site.meta', { season: seasonText(env), n: sc.list.length })));
    if (CP.app.sites.length > 1) {
      var row = CP.el('div', 'chips'); row.style.marginTop = '8px';
      CP.app.sites.forEach(function (s) {
        var c = CP.el('button', 'chip', siteName(s)); c.type = 'button';
        c.setAttribute('aria-pressed', String(s === sc));
        c.onclick = function () { CP.app.show(s.id, true); };
        row.appendChild(c);
      });
      info.appendChild(row);
    }

    var tasks = $('tasks'); tasks.textContent = '';
    if (!st.taskOrder.length) tasks.appendChild(CP.el('li', 'muted', t('tasks.none')));
    for (i = 0; i < st.taskOrder.length; i++) {
      var tk = st.tasks[st.taskOrder[i]], li = CP.el('li', 'task' + (tk.done ? ' done' : ''));
      li.appendChild(CP.el('i')); li.appendChild(CP.el('span', '', tk.subject || t('tasks.item', { n: i + 1 })));
      tasks.appendChild(li);
    }

    var pets = $('pets'), sig = CP.i18n.lang + '|';
    for (id in sc.pets) sig += id + ':' + sc.pets[id].name() + ';';
    if (sig !== lastPanel) {
      lastPanel = sig; pets.textContent = '';
      var any = false;
      for (id in sc.pets) { pets.appendChild(petRow(sc.pets[id])); any = true; }
      if (!any) pets.appendChild(CP.el('li', 'muted', t('pets.none')));
    }
    for (i = 0; i < pets.children.length; i++) {
      var pr = pets.children[i];
      if (pr._pet) pr._doing.textContent = CP.i18n.pick(pr._pet.p.label) + ' · ' + activityText(pr._pet);
    }

    var snips = $('snips'); snips.textContent = '';
    if (!sc.snips.length) snips.appendChild(CP.el('p', 'muted', t('snips.none')));
    sc.snips.slice(0, 3).forEach(function (s) {
      var box = CP.el('div', 'snip');
      var head = CP.el('b');
      var link = CP.el('button', 'linkish', s.file); link.type = 'button';
      link.onclick = function () { if (sc.B[s.file]) openCode(sc.B[s.file]); };
      head.appendChild(link); box.appendChild(head); box.appendChild(CP.el('pre', '', s.lines.join('\n')));
      snips.appendChild(box);
    });
  }

  function petRow(pet) {
    var li = CP.el('li', 'petrow'), cv = document.createElement('canvas');
    cv.width = 20; cv.height = 20;
    CP.sprites.drawPet(cv.getContext('2d'), 10, 19, { species: pet.species, colors: pet.kind.colors, helmet: pet.helmet, face: 1, eyes: {} });
    li.appendChild(cv);
    if (pet.nameKey && !CP.app.remote) {
      var input = CP.el('input', 'field'); input.value = pet.name(); input.maxLength = 12; input.id = 'name-' + pet.nameKey;
      input.setAttribute('aria-label', t('pets.name.aria', { kind: CP.i18n.pick(pet.kind.label) }));
      input.onchange = function () { rename(pet, input.value); };
      li.appendChild(input);
    } else li.appendChild(CP.el('b', '', pet.name()));
    li._doing = CP.el('small'); li._pet = pet;
    li.appendChild(li._doing);
    return li;
  }

  function rename(pet, value) {
    if (!pet.nameKey || CP.app.remote) return;
    var v = String(value || '').trim().slice(0, 12);
    CP.app.prefs.names[pet.nameKey] = v;
    if (!v) delete CP.app.prefs.names[pet.nameKey];
    var patch = { names: {} }; patch.names[pet.nameKey] = v || null;
    CP.app.savePrefs(patch);
    lastPanel = '';
    if (scene()) scene().dirty = true;
    if (v) bubble(pet, t('pets.renamed', { name: v }), 2400);
  }

  function setTab(name) {
    ['site', 'pets', 'settings'].forEach(function (k) {
      $('tab-' + k).setAttribute('aria-selected', String(k === name));
      $('tab-' + k).tabIndex = k === name ? 0 : -1;
      $('pane-' + k).hidden = k !== name;
    });
    CP.store.set('tab', name);
    if (scene()) { lastPanel = ''; scene().dirty = true; }
  }

  // ---------- 펫 카드 ----------
  function openCard(pet) {
    card.pet = pet;
    $('card').hidden = false;
    $('card-name').value = pet.name();
    $('card-name').disabled = !pet.nameKey || CP.app.remote; // 이름은 PC에서만 지어 준다
    $('card-kind').textContent = CP.i18n.pick(pet.kind.label) + ' · ' + CP.i18n.pick(pet.p.label);
  }
  function closeCard() { card.pet = null; $('card').hidden = true; }

  function petPet(pet) {
    pet.happy = 2.2;
    scene().hearts(pet.x, scene().groundY - (pet.species === 'mini' ? 14 : 20) - pet.z, 3);
    CP.audio.sfx('heart');
    pet.say('pet');
  }

  // ---------- 파일 보기 ----------
  function openCode(b) {
    var sc = scene();
    $('code').hidden = false;
    $('code-name').textContent = b.path;
    var pre = $('code-text'), note = $('code-note');
    pre.textContent = t('code.loading'); note.hidden = true;
    var show = function (text, msg) { pre.textContent = text; note.hidden = !msg; note.textContent = msg || ''; pre.scrollTop = 0; };
    var fallback = function () {
      var s = sc.state.buildings[b.path];
      show((s && s.snippet || []).join('\n'), t('code.partial'));
    };
    CP.app.loadFile(sc, b.path).then(function (r) {
      if (!r) return fallback();
      if (r.binary) return show('', t('code.binary'));
      show(r.text, r.truncated ? t('code.truncated') : r.note || '');
    }, fallback);
  }

  // ---------- 포인터 ----------
  function toLogical(e) {
    var r = canvas.getBoundingClientRect(), S = CP.app.S;
    return { sx: (e.clientX - r.left) / S, sy: (e.clientY - r.top) / S };
  }

  function wake() {
    stage.classList.remove('calm');
    clearTimeout(calmTimer);
    calmTimer = setTimeout(function () { if ($('panel').hidden && $('code').hidden && $('phone').hidden && !card.pet && !snackMode) stage.classList.add('calm'); }, 3500);
  }

  function onDown(e) {
    var sc = scene(); if (!sc) return;
    wake();
    var q = toLogical(e), hit = sc.pick(q.sx, q.sy);
    drag = { hit: hit, sx: q.sx, sy: q.sy, moved: false, trail: [{ x: q.sx, y: q.sy, t: performance.now() }] };
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 일부 환경은 지원하지 않는다 */ }
  }

  function onMove(e) {
    var sc = scene(); if (!sc) return;
    var q = toLogical(e), P = CP.app.pointer, cam = Math.round(sc.cam.x);
    P.inside = true; P.sx = q.sx; P.sy = q.sy; P.wx = q.sx + cam; P.wyUp = sc.groundY - q.sy;
    wake();
    if (drag) {
      if (!drag.moved && Math.hypot(q.sx - drag.sx, q.sy - drag.sy) > 4) {
        drag.moved = true;
        if (drag.hit.pet && !drag.hit.pet.leaving) {
          var p = drag.hit.pet;
          p.over = { type: 'held', x: P.wx, z: P.wyUp - 8, t: 0 };
          closeCard();
          var l = p.line('held'); if (l) bubble(p, l, 1800);
          CP.audio.sfx('pop');
        }
      }
      if (drag.moved && drag.hit.pet && drag.hit.pet.over && drag.hit.pet.over.type === 'held') {
        drag.hit.pet.over.x = P.wx; drag.hit.pet.over.z = P.wyUp - 8;
        drag.trail.push({ x: q.sx, y: q.sy, t: performance.now() });
        if (drag.trail.length > 6) drag.trail.shift();
      }
      return;
    }
    var h = sc.pick(q.sx, q.sy);
    hover = h;
    canvas.style.cursor = snackMode ? 'copy' : h.pet ? 'grab' : h.building ? 'pointer' : 'default';
    // 쓰다듬기: 누르지 않고 펫 위에서 문지른다
    if (h.pet && e.pointerType !== 'touch') {
      var now = performance.now();
      if (rub.pet !== h.pet || now - rub.at > 1500) { rub.pet = h.pet; rub.dist = 0; rub.at = now; }
      rub.dist += Math.abs(q.sx - rub.lx);
      if (rub.dist > 42) { rub.dist = 0; rub.at = now; petPet(h.pet); }
    }
    rub.lx = q.sx;
    // 가까이 가면 반응한다
    for (var id in sc.pets) {
      var pp = sc.pets[id];
      if (!pp.over && !pp.busy() && pp.react <= 0 && Math.abs(P.wx - pp.x) < 16 && Math.abs(P.wyUp - 10) < 22 && (!pp.reactAt || performance.now() - pp.reactAt > 4000)) { pp.react = 0.45; pp.reactAt = performance.now(); }
    }
  }

  function onUp(e) {
    var sc = scene(), d = drag;
    drag = null;
    if (!sc || !d) return;
    var p = d.hit.pet;
    if (d.moved && p && p.over && p.over.type === 'held') {
      var tr = d.trail, a = tr[0], b = tr[tr.length - 1], dt = Math.max(0.03, (b.t - a.t) / 1000);
      p.vx = CP.clamp((b.x - a.x) / dt, -260, 260);
      p.vz = CP.clamp(-(b.y - a.y) / dt, -120, 300);
      p.over = { type: 'thrown', t: 0 };
      CP.audio.sfx('throw');
      return;
    }
    if (d.moved) return;
    if (snackMode) { sc.dropSnack(d.hit.wx !== undefined ? d.hit.wx : (p ? p.x : d.hit.building.x)); CP.audio.sfx('pop'); return; }
    if (p) {
      bubble(p, activityText(p), 2600);
      CP.audio.sfx('pop');
      if (card.pet === p) closeCard(); else openCard(p);
    } else if (d.hit.building) {
      closeCard(); openCode(d.hit.building);
    } else closeCard();
  }

  function cheer() {
    var sc = scene(); if (!sc) return;
    var em = ['👏', '💪', '🎉', '❤️', '⭐', '🙌'];
    for (var i = 0; i < 7; i++) {
      (function (i) {
        setTimeout(function () {
          var e = CP.el('div', 'cheer', em[Math.floor(Math.random() * em.length)]);
          e.style.left = Math.round(40 + Math.random() * (stage.clientWidth - 100)) + 'px';
          e.style.top = Math.round(stage.clientHeight * (0.5 + Math.random() * 0.25)) + 'px';
          overlay.appendChild(e);
          setTimeout(function () { e.remove(); }, CP.reducedMotion ? 900 : 1900);
        }, i * 90);
      })(i);
    }
    for (var id in sc.pets) { sc.pets[id].react = 0.6; sc.pets[id].happy = 1.6; }
    CP.audio.sfx('cheer');
  }

  function setSnack(on) {
    snackMode = on;
    $('btn-snack').setAttribute('aria-pressed', String(on));
    canvas.style.cursor = on ? 'copy' : 'default';
  }

  function syncSound() {
    var s = CP.audio.on;
    $('btn-sound').setAttribute('aria-pressed', String(s.sfx || s.bgm));
    $('snd-sfx').setAttribute('aria-pressed', String(s.sfx));
    $('snd-bgm').setAttribute('aria-pressed', String(s.bgm));
  }

  function setDetail(on) {
    $('panel').hidden = !on;
    $('btn-detail').setAttribute('aria-pressed', String(on));
    CP.store.set('detail', on);
    if (on) { closeCard(); setPhone(false); } // 좁은 화면에서 판들이 겹치지 않게
    if (on && scene()) { lastPanel = ''; scene().dirty = true; }
    wake();
  }

  // ---------- 설정 ----------
  // 서버에 붙어 있고 PC에서 볼 때만 바꿀 수 있는 것들(데모에는 서버가 없고, 폰은 보기만 한다)
  function syncSettings() {
    var st = CP.app.prefs.settings || {}, pc = CP.app.live && !CP.app.remote;
    $('settings-sec').hidden = !pc;
    $('window-sec').hidden = !pc;
    $('set-appwindow').setAttribute('aria-pressed', String(st.appWindow !== false));
    $('set-autoopen').setAttribute('aria-pressed', String(st.autoOpen === true));
    $('set-announce').setAttribute('aria-pressed', String(st.announce !== false));
    if (document.activeElement !== $('birthday')) $('birthday').value = st.birthday || '';
    $('lang-ko').setAttribute('aria-pressed', String(CP.i18n.lang === 'ko'));
    $('lang-en').setAttribute('aria-pressed', String(CP.i18n.lang === 'en'));
    winChips();
  }
  function toggleSetting(key, current) {
    var patch = { settings: {} };
    patch.settings[key] = !current;
    CP.app.prefs.settings[key] = !current;
    CP.app.savePrefs(patch);
    syncSettings();
  }

  function setLang(lang) {
    if (CP.app.live && !CP.app.remote) { CP.app.prefs.settings.lang = lang; CP.app.savePrefs({ settings: { lang: lang } }); }
    else CP.store.set('lang', lang);
    CP.i18n.set(lang);
  }

  // 언어가 바뀌면 이미 그려 둔 글자를 다시 만든다
  function relabel() {
    lastHud = ''; lastPanel = '';
    if (signEl) signEl.dataset.t = '';
    status(statusKey[0], statusKey[1]);
    dateChips(); syncSettings(); lanRender(lanInfo);
    if (card.pet) openCard(card.pet);
    if (scene()) scene().dirty = true;
  }

  // ---------- 창 모양 ----------
  // 전용 창(앱 창)일 때는 고르는 즉시 창 크기를 바꾼다. 브라우저 탭이면 다음에 전용 창으로 열 때 쓴다.
  var WIN = [['strip', 1280, 400], ['wide', 1260, 540], ['hd', 1120, 630], ['classic', 880, 660], ['square', 660, 660], ['tall', 420, 760]];
  var winQuiet = 0, winTimer = null;

  function fitScreen(w, h) {
    var sw = (window.screen && screen.availWidth) || 1920, sh = (window.screen && screen.availHeight) || 1080;
    return { w: Math.round(Math.min(w, sw)), h: Math.round(Math.min(h, sh)) };
  }
  function resizeWindow(w, h) {
    if (!CP.app.standalone) return;
    var f = fitScreen(w, h);
    winQuiet = performance.now() + 900; // 우리가 바꾼 크기는 "직접 조절"로 저장하지 않는다
    try {
      window.resizeTo(f.w, f.h);
      var sx = window.screenX, sy = window.screenY, sw = screen.availWidth, sh = screen.availHeight, ax = screen.availLeft || 0, ay = screen.availTop || 0;
      if (sx + f.w > ax + sw || sy + f.h > ay + sh) window.moveTo(Math.max(ax, Math.min(sx, ax + sw - f.w)), Math.max(ay, Math.min(sy, ay + sh - f.h))); // 화면 밖으로 나가지 않게
    } catch (e) { /* 크기를 못 바꾸는 창이면 그대로 둔다 */ }
  }
  function winChips() {
    var box = $('win-chips'), cur = ((CP.app.prefs.settings || {}).win || {}).preset || '';
    if (!(CP.app.prefs.settings || {}).win) cur = 'strip';
    box.textContent = '';
    WIN.forEach(function (p) {
      var c = CP.el('button', 'chip', t('win.' + p[0])); c.type = 'button';
      c.setAttribute('aria-pressed', String(cur === p[0]));
      c.onclick = function () {
        var win = { preset: p[0], w: p[1], h: p[2] };
        CP.app.prefs.settings.win = win;
        CP.app.savePrefs({ settings: { win: win } });
        resizeWindow(p[1], p[2]);
        winChips();
      };
      box.appendChild(c);
    });
    $('win-note').textContent = t(CP.app.standalone ? 'win.note.app' : 'win.note.tab');
  }
  // 사용자가 창 가장자리를 끌어 바꾼 크기를 기억해 둔다(다음에 열 때 그 크기로 연다)
  function onWindowResize() {
    if (!CP.app.standalone || !CP.app.live || CP.app.remote) return;
    if (performance.now() < winQuiet || document.fullscreenElement) return;
    clearTimeout(winTimer);
    winTimer = setTimeout(function () {
      if (performance.now() < winQuiet || document.fullscreenElement) return;
      var win = { preset: '', w: window.outerWidth, h: window.outerHeight };
      var old = CP.app.prefs.settings.win || {};
      if (Math.abs((old.w || 0) - win.w) < 3 && Math.abs((old.h || 0) - win.h) < 3) return;
      CP.app.prefs.settings.win = win;
      CP.app.savePrefs({ settings: { win: win } });
      winChips();
    }, 700);
  }
  // 창이 뜬 직후 한 번: 저장된 크기와 다르면 맞춘다(이미 떠 있던 브라우저가 창을 대신 열었을 때)
  function applyWindow() {
    if (!CP.app.standalone || !CP.app.live || CP.app.remote) return;
    var win = (CP.app.prefs.settings || {}).win || { w: WIN[0][1], h: WIN[0][2] }, f = fitScreen(win.w, win.h);
    if (Math.abs(window.outerWidth - f.w) > 6 || Math.abs(window.outerHeight - f.h) > 6) resizeWindow(f.w, f.h);
  }

  // ---------- 폰에서 보기 ----------
  // '폰' 버튼 하나로 끝난다: 누르면 읽기 전용 주소를 켜고 QR을 바로 띄운다.
  var lanPick = 0, lanInfo = { on: false, urls: [] };
  function drawQr(text) {
    var q = CP.qr.make(text), cv = $('lan-qr');
    if (!q) { cv.hidden = true; return; }
    var quiet = 4, px = 4, n = q.size + quiet * 2, g;
    cv.hidden = false; cv.width = cv.height = n * px;
    cv.style.width = n * px + 'px'; // 칸이 고르게 보이도록 정수 배로만 그린다
    g = cv.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, cv.width, cv.height); // QR은 테마와 상관없이 흰 바탕에 검은 칸이어야 찍힌다
    g.fillStyle = '#000000';
    for (var y = 0; y < q.size; y++) for (var x = 0; x < q.size; x++) if (q.rows[y][x]) g.fillRect((x + quiet) * px, (y + quiet) * px, px, px);
  }
  function lanRender(info) {
    lanInfo = info || lanInfo;
    info = lanInfo;
    var list = $('lan-urls'), note = $('lan-note');
    $('btn-phone').setAttribute('aria-pressed', String(!!info.on));
    list.textContent = ''; note.textContent = '';
    $('lan-qr').hidden = true; $('lan-steps').hidden = true; $('lan-off-row').hidden = !info.on;
    if (info.demo) { note.textContent = t('phone.err.demo'); return; }
    if (info.error) { note.textContent = t('phone.err.port', { port: info.port }); return; }
    if (info.pending) { note.textContent = t('phone.starting'); return; }
    if (!info.on) return;
    if (!info.urls.length) { note.textContent = t('phone.err.net'); return; }
    lanPick = Math.min(lanPick, info.urls.length - 1);
    drawQr(info.urls[lanPick].url);
    $('lan-steps').hidden = false;
    info.urls.forEach(function (u, i) {
      var row = CP.el('p', 'lan-url');
      if (info.urls.length > 1) {
        var pick = CP.el('button', 'chip', u.name); pick.type = 'button';
        pick.setAttribute('aria-pressed', String(i === lanPick));
        pick.onclick = function () { lanPick = i; lanRender(); };
        row.appendChild(pick); row.appendChild(document.createTextNode(' '));
      }
      row.appendChild(document.createTextNode(u.url));
      list.appendChild(row);
    });
    if (info.urls.length > 1) note.textContent = t('phone.pick');
  }
  function lanPost(on) {
    return fetch('lan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on: on }) })
      .then(function (r) { return r.json(); }).then(lanRender).catch(function () {});
  }
  function setPhone(open) {
    $('phone').hidden = !open;
    if (!open) return;
    closeCard(); $('panel').hidden = true; $('btn-detail').setAttribute('aria-pressed', 'false');
    if (!CP.app.live) { lanRender({ on: false, urls: [], demo: true }); return; }
    if (lanInfo.on) { lanRender(); return; }
    lanRender({ on: false, urls: [], pending: true });
    lanPost(true); // 버튼 한 번에 켜고 바로 QR을 보여 준다
    wake();
  }

  function fullscreenInit() {
    var el = document.documentElement, btn = $('btn-full');
    var can = document.fullscreenEnabled || document.webkitFullscreenEnabled;
    var req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!can || !req) return; // 아이폰 사파리처럼 못 하는 곳에서는 버튼을 보이지 않는다
    btn.hidden = false;
    var isOn = function () { return !!(document.fullscreenElement || document.webkitFullscreenElement); };
    btn.onclick = function () {
      try {
        winQuiet = performance.now() + 1500;
        var p = isOn() ? (document.exitFullscreen || document.webkitExitFullscreen).call(document) : req.call(el);
        if (p && p.catch) p.catch(function () {});
      } catch (e) { /* 거절되면 그대로 둔다 */ }
    };
    var sync = function () { winQuiet = performance.now() + 1500; btn.setAttribute('aria-pressed', String(isOn())); };
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
  }

  function dateChips() {
    var box = $('date-chips'); box.textContent = '';
    var year = new Date().getFullYear();
    CP.seasons.samples(CP.app.config.seasons, year).forEach(function (s) {
      var c = CP.el('button', 'chip', s.label); c.type = 'button';
      c.onclick = function () { CP.app.setDate(s.date); $('date-pick').value = s.date; };
      box.appendChild(c);
    });
  }

  function init() {
    overlay = $('overlay'); stage = $('stage'); canvas = $('world');
    icons();
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', function () { if (drag && drag.hit.pet && drag.hit.pet.over && drag.hit.pet.over.type === 'held') drag.hit.pet.over = { type: 'thrown', t: 0 }; drag = null; });
    canvas.addEventListener('pointerleave', function () { CP.app.pointer.inside = false; });
    stage.addEventListener('pointermove', wake);

    $('btn-snack').onclick = function () { setSnack(!snackMode); wake(); };
    $('btn-cheer').onclick = cheer;
    $('btn-sound').onclick = function () { var v = !(CP.audio.on.sfx || CP.audio.on.bgm); CP.audio.set('sfx', v); CP.audio.set('bgm', v); syncSound(); if (v) CP.audio.sfx('blip'); };
    $('snd-sfx').onclick = function () { CP.audio.set('sfx', !CP.audio.on.sfx); syncSound(); CP.audio.sfx('blip'); };
    $('snd-bgm').onclick = function () { CP.audio.set('bgm', !CP.audio.on.bgm); syncSound(); };
    $('btn-detail').onclick = function () { setDetail($('panel').hidden); };
    $('panel-close').onclick = function () { setDetail(false); };
    $('btn-phone').onclick = function () { setPhone($('phone').hidden); };
    $('phone-close').onclick = function () { setPhone(false); };
    $('lan-off').onclick = function () { lanPost(false).then(function () { setPhone(false); }); };
    ['site', 'pets', 'settings'].forEach(function (k) { $('tab-' + k).onclick = function () { setTab(k); }; });
    $('lang-ko').onclick = function () { setLang('ko'); };
    $('lang-en').onclick = function () { setLang('en'); };
    $('code-close').onclick = function () { $('code').hidden = true; };
    $('card-pet').onclick = function () { if (card.pet) petPet(card.pet); };
    $('card-snack').onclick = function () { if (card.pet && scene()) { scene().dropSnack(card.pet.x + card.pet.face * 14); closeCard(); } };
    $('card-name').onchange = function () { if (card.pet) rename(card.pet, $('card-name').value); };
    $('date-pick').onchange = function () { CP.app.setDate($('date-pick').value || null); };
    $('date-today').onclick = function () { CP.app.setDate(null); $('date-pick').value = CP.ymd(new Date()); };
    $('birthday').onchange = function () {
      var v = $('birthday').value.trim();
      if (v && !/^\d\d-\d\d$/.test(v)) { $('birthday').value = CP.app.prefs.settings.birthday || ''; return; }
      CP.app.prefs.settings.birthday = v;
      CP.app.savePrefs({ settings: { birthday: v } });
    };
    document.addEventListener('keydown', function (e) {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) { if (e.key === 'Escape') e.target.blur(); return; }
      if (e.key === 'Escape') { closeCard(); $('code').hidden = true; setPhone(false); setSnack(false); }
      else if (e.key === 'd' || e.key === 'D' || e.key === 'ㅇ') setDetail($('panel').hidden);
    });
    $('set-appwindow').onclick = function () { toggleSetting('appWindow', (CP.app.prefs.settings || {}).appWindow !== false); };
    $('set-autoopen').onclick = function () { toggleSetting('autoOpen', (CP.app.prefs.settings || {}).autoOpen === true); };
    $('set-announce').onclick = function () { toggleSetting('announce', (CP.app.prefs.settings || {}).announce !== false); };
    $('date-pick').value = CP.ymd(CP.app.date());
    $('btn-phone').hidden = CP.app.remote; // 폰으로 들어온 화면에는 필요 없다
    CP.i18n.onChange(relabel);
    syncSettings();
    if (CP.app.live && !CP.app.remote) fetch('lan').then(function (r) { return r.json(); }).then(function (info) { lanInfo = info; $('btn-phone').setAttribute('aria-pressed', String(!!info.on)); }).catch(function () {});
    fullscreenInit();
    dateChips();
    setTab(CP.store.get('tab', 'site'));
    if (CP.store.get('detail', false) && window.innerWidth > 700) setDetail(true);
    window.addEventListener('resize', onWindowResize);
    setTimeout(applyWindow, 300);
    wake();
  }

  // kind: '' | 'live' | 'demo', key: 사전의 키
  function status(kind, key) {
    statusKey = [kind, key];
    $('status').className = kind;
    $('status-text').textContent = t(key);
  }

  // 공사장을 바꿀 때 글자 층을 비운다
  function reset() {
    var k;
    for (k in bubbles) { bubbles[k].el.remove(); delete bubbles[k]; }
    for (k in boards) { boards[k].el.remove(); delete boards[k]; }
    for (k in tags) { tags[k].el.remove(); delete tags[k]; }
    closeCard(); lastPanel = ''; lastHud = '';
  }

  CP.ui = { init: init, frame: frame, bubble: bubble, board: board, status: status, reset: reset, activityText: activityText, syncSettings: syncSettings, applyWindow: applyWindow };
})();
