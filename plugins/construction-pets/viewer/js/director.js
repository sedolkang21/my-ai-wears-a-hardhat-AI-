// 공사장 한 곳(Scene). 이벤트를 받아 상태를 고치고(shared/reduce.js), 그에 맞는 연출을 펫에게 시킨다.
(function () {
  'use strict';
  var CP = window.CP;
  var Rd = CP.reduce, W = CP.world, PAL = CP.sprites.PAL;

  var TILES = {
    heart: ['p.p', 'ppp', '.p.'],
    star: ['.y.', 'yyy', '.y.'],
    z: ['www', '.w.', 'www'],
  };

  function Scene(state) {
    this.state = state;
    this.id = state.id;
    this.B = {};
    this.list = [];
    this.pets = {};
    this.fx = [];
    this.snacks = [];
    this.snips = [];       // 방금 고친 곳(상세 패널용)
    this.officeX = 96;
    this.lot0 = 200;
    this.pitch = 60;
    this.cam = { x: 0, ready: false };
    this.t = 0;
    this.subCount = 0; this.slotCount = 0;
    this.groundY = 100;
    this.minX = 0; this.maxX = 400;
    this.yardX = 0;        // 현장 끝의 굴착기 자리. 건물이 늘면 옆으로 옮겨 간다
    this.focusB = null; this.focusAt = -99;
    this.celebrate = 0;
    this.dirty = true;
    this.sync();
  }

  // 상태를 연출 없이 그대로 화면에 옮긴다(늦게 연 뷰어, 다시 연결했을 때).
  Scene.prototype.sync = function () {
    var st = this.state, i, id;
    for (i = 0; i < st.order.length; i++) {
      var s = st.buildings[st.order[i]], b = this.building(s.path);
      b.vis = s.stage; b.done = s.done; b.rebuilt = s.rebuilt && !s.done; b.flags = s.flags;
      b.floors = Rd.floorsFor(s.lines); b.want = s.stage;
      if (s.snippet) this.snips.unshift({ file: s.path, lines: s.snippet });
    }
    this.snips = this.snips.slice(0, 6);
    for (id in st.pets) {
      var p = this.pet(st.pets[id]);
      var at = st.lastFile && this.B[st.lastFile];
      p.x = at ? p.spot(at) + (p.sub ? 14 : 0) : this.officeX + 24 + Math.random() * 30;
      if (st.pets[id].state === 'waiting') p.enqueue('wait');
    }
  };

  Scene.prototype.building = function (path) {
    var b = this.B[path];
    if (b) return b;
    b = this.B[path] = {
      path: path, name: CP.baseName(path), idx: this.list.length, x: this.lot0 + this.list.length * this.pitch,
      look: W.buildingLook(path), floors: 1, vis: 0, want: 0, wantAt: this.t, lastStep: -9, floorAt: -9,
      done: false, rebuilt: false, flags: 0, pop: 0, smoke: 0, clock: 0,
    };
    this.list.push(b);
    this.dirty = true;
    return b;
  };

  Scene.prototype.pet = function (info) {
    var p = this.pets[info.id];
    if (!p) { p = this.pets[info.id] = new CP.Pet(this, info); this.dirty = true; }
    return p;
  };

  Scene.prototype.petFor = function (ev) {
    var id = Rd.petId(ev), info = this.state.pets[id];
    if (!info) return this.pets[id] || null;
    return this.pet(info);
  };

  Scene.prototype.sessionPets = function (session) {
    var out = [];
    for (var id in this.pets) if (this.pets[id].info.session === session && !this.pets[id].leaving) out.push(this.pets[id]);
    return out;
  };

  Scene.prototype.focus = function (b) { this.focusB = b; this.focusAt = this.t; };

  Scene.prototype.focusX = function () {
    var id, main = null;
    for (id in this.pets) { var p = this.pets[id]; if (p.over && p.over.type === 'held') return p.x; if (!p.sub && !main) main = p; }
    if (this.focusB && this.t - this.focusAt < 12) return this.focusB.x;
    if (main) return main.x;
    return this.list.length ? this.list[this.list.length - 1].x : this.officeX + 50;
  };

  // ---------- 이벤트 -> 연출 ----------

  Scene.prototype.handle = function (ev) {
    var st = this.state, i, p, b, list;
    var id = Rd.petId(ev);
    var leavingSub = ev.type === 'agent_stop' ? this.pets[id] : null;
    var leavingAll = ev.type === 'session_end' ? this.sessionPets(ev.session) : null;
    var doneBefore = Rd.taskCounts(st).done;
    var hadPet = !!this.pets[id];

    Rd.apply(st, ev);
    this.dirty = true;
    p = this.petFor(ev);

    switch (ev.type) {
      case 'session_start':
        if (!p) break;
        if (!hadPet) {
          p.x = this.officeX + 34 + Math.random() * 30;
          p.z = this.groundY + 24; p.vz = 0; p.over = { type: 'drop', t: 0 };
        } else p.enqueue('greet');
        break;

      case 'prompt':
        if (!p) break;
        p.enqueue('prompt');
        p.say('prompt');
        CP.audio.sfx('blip');
        break;

      case 'tool_pre':
        if (!p) break;
        b = ev.file ? this.B[ev.file] : null;
        if (ev.kind === 'edit') {
          p.enqueue('look', { x: b ? p.spot(b) : this.lot0 + this.list.length * this.pitch - 9, dur: 0.25 });
        } else {
          var o = {};
          if (b && ev.kind === 'read') { o.b = b; }
          p.enqueue(BASE_KIND[ev.kind] || 'other', o);
        }
        break;

      case 'tool_post':
        if (!p || ev.kind !== 'edit' || !ev.file) break;
        var isNew = !this.B[ev.file];
        b = this.building(ev.file);
        if (isNew) CP.audio.sfx('pop');
        p.enqueue('edit', { b: b });
        this.focus(b);
        if (ev.snippet && ev.snippet.length) {
          this.snips = this.snips.filter(function (s) { return s.file !== ev.file; });
          this.snips.unshift({ file: ev.file, lines: ev.snippet });
          this.snips.length = Math.min(this.snips.length, 6);
          CP.ui.board(b, ev.snippet);
        }
        break;

      case 'tool_fail':
        if (!p) break;
        b = (ev.file && this.B[ev.file]) || this.focusB;
        p.enqueue('fail', { b: ev.file ? b : null });
        if (b) b.smoke = 3.5;
        CP.audio.sfx('fail');
        p.say('fail', true);
        break;

      case 'agent_start':
        if (!p) break;
        if (!hadPet) {
          p.x = this.officeX + 26;
          p.enqueue('look', { x: this.focusX() + 16 + Math.random() * 14, dur: 0.3 });
          this.puff(p.x, this.groundY - 6, 4, 'rgba(255,255,255,0.8)');
          CP.audio.sfx('pop');
        }
        break;

      case 'agent_stop':
        if (leavingSub) this.dismiss(leavingSub, this.pets[ev.session], this.officeX + 26);
        break;

      case 'task_created':
        CP.audio.sfx('tick');
        break;

      case 'task_completed':
      case 'tasks_set':
        if (Rd.taskCounts(st).done > doneBefore) {
          b = st.lastFile && this.B[st.lastFile];
          if (b) { b.flags = st.buildings[st.lastFile].flags; this.stars(b.x, this.groundY - W.heightOf(b) - 6, 5); }
          CP.audio.sfx('flag');
        }
        break;

      case 'permission':
        if (!p) break;
        p.enqueue('wait');
        p.say('wait', true);
        CP.audio.sfx('wait');
        break;

      case 'idle':
        if (!p) break;
        p.enqueue('wave');
        p.say('idle', true);
        break;

      case 'stop':
        list = this.sessionPets(ev.session);
        for (i = 0; i < list.length; i++) list[i].enqueue('cheer');
        this.celebrate = 1;
        if (p) p.say('done', true);
        break;

      case 'stop_fail':
        if (!p) break;
        if (ev.error === 'rate_limit') {
          p.enqueue('lunch');
          CP.ui.bubble(p, CP.t('say.ratelimit'), 3200);
        } else {
          b = this.focusB || this.list[this.list.length - 1] || null;
          for (id in this.pets) this.pets[id].enqueue('worried', b ? { b: b } : {});
          CP.ui.bubble(p, CP.t('say.disconnect'), 3200);
        }
        CP.audio.sfx('fail');
        break;

      case 'compact':
        if (ev.phase === 'post') break;
        list = this.sessionPets(ev.session);
        for (i = 0; i < list.length; i++) list[i].enqueue('sweep');
        if (p) CP.ui.bubble(p, CP.t('say.compact'), 2400);
        break;

      case 'session_end':
        for (i = 0; i < (leavingAll || []).length; i++) this.dismiss(leavingAll[i], null, this.minX - 30);
        break;
    }
  };

  var BASE_KIND = { read: 'read', web: 'web', bash: 'bash', plan: 'plan', delegate: 'delegate', other: 'other' };

  // 펫을 내보낸다. 동료가 있으면 하이파이브를 하고 간다.
  Scene.prototype.dismiss = function (pet, partner, exitX) {
    pet.leaving = true;
    pet.queue = []; pet.act = null;
    var go = function () { pet.over = { type: 'leave', x: exitX, t: 0 }; };
    if (partner && !CP.reducedMotion) {
      pet.enqueue('highfive', { x: partner.x - 13, partner: partner, keep: true, onDone: go });
      if (!partner.busy()) partner.enqueue('highfive', { partner: pet });
    } else {
      pet.enqueue('greet', { dur: 0.7, keep: true, onDone: go });
    }
  };

  // 망치질 한 번에 건물이 한 단계 올라간다.
  Scene.prototype.hammerHit = function (b) {
    if (b.vis < b.want && this.t - b.lastStep > 0.42) this.stepUp(b);
  };

  Scene.prototype.stepUp = function (b) {
    b.vis++; b.lastStep = this.t; b.pop = 1;
    this.puff(b.x - b.look.bw / 2, this.groundY - 2, 3, 'rgba(205,190,165,0.85)');
    this.puff(b.x + b.look.bw / 2, this.groundY - 2, 3, 'rgba(205,190,165,0.85)');
    CP.audio.sfx('step');
  };

  // ---------- 효과 ----------

  Scene.prototype.add = function (f) { if (this.fx.length < 260 && !CP.reducedMotion) this.fx.push(f); };
  Scene.prototype.puff = function (x, y, n, c, vy) {
    for (var i = 0; i < n; i++) this.add({ x: x + Math.random() * 6 - 3, y: y, vx: Math.random() * 16 - 8, vy: (vy || -10) - Math.random() * 8, g: 0, life: 0.5 + Math.random() * 0.4, c: c, s: 2 });
  };
  Scene.prototype.sparks = function (x, y, n) {
    for (var i = 0; i < n; i++) this.add({ x: x, y: y, vx: Math.random() * 60 - 30, vy: -30 - Math.random() * 40, g: 220, life: 0.3 + Math.random() * 0.2, c: i % 2 ? '#fff3b0' : PAL.y, s: 1, light: true });
  };
  Scene.prototype.hearts = function (x, y, n) {
    for (var i = 0; i < n; i++) this.add({ x: x + i * 5 - n * 2.5, y: y - i * 2, vx: Math.random() * 8 - 4, vy: -14 - Math.random() * 6, g: 0, life: 1.1, tile: 'heart' });
  };
  Scene.prototype.stars = function (x, y, n) {
    for (var i = 0; i < n; i++) { var a = i / n * 6.28; this.add({ x: x, y: y, vx: Math.cos(a) * 26, vy: Math.sin(a) * 26 - 8, g: 60, life: 0.6, tile: 'star', light: true }); }
  };
  Scene.prototype.glyph = function (x, y, k) { this.add({ x: x, y: y, vx: 4, vy: -7, g: 0, life: 1.4, tile: k }); };
  Scene.prototype.confetti = function (x, y, n) {
    var cols = [PAL.y, PAL.b, PAL.g, PAL.p, PAL.v, PAL.w];
    for (var i = 0; i < n; i++) this.add({ x: x + Math.random() * 20 - 10, y: y, vx: Math.random() * 70 - 35, vy: -50 - Math.random() * 60, g: 130, life: 1.2 + Math.random() * 0.8, c: cols[i % cols.length], s: 1 + (i % 2), light: true });
  };

  Scene.prototype.dropSnack = function (wx) {
    this.snacks.push({ x: CP.clamp(wx, this.minX + 10, this.maxX - 10), z: this.groundY + 6, vz: 0, eaten: false, taken: false, age: 0 });
  };

  // ---------- 매 프레임 ----------

  Scene.prototype.update = function (dt, env) {
    var st = this.state, i, id, b, tgt;
    this.t += dt;
    this.groundY = env.groundY;
    var yard = this.lot0 + Math.max(1, this.list.length) * this.pitch + 52;
    if (!this.yardX || env.reduced) this.yardX = yard; else this.yardX += (yard - this.yardX) * Math.min(1, dt * 1.4);
    this.maxX = yard + 76;

    for (i = 0; i < this.list.length; i++) {
      b = this.list[i]; tgt = st.buildings[b.path];
      b.clock += dt;
      if (b.pop > 0) b.pop = Math.max(0, b.pop - dt * 3);
      if (!tgt) continue;
      if (tgt.stage !== b.want) { b.want = tgt.stage; b.wantAt = this.t; }
      // 망치질이 안 오면 2초 뒤에는 스스로 올라간다. 준공이 정해지면 서둘러 따라잡는다.
      if (b.vis < b.want && this.t - Math.max(b.wantAt, b.lastStep) > (tgt.done ? 0.28 : 2.0)) this.stepUp(b);
      var floors = Rd.floorsFor(tgt.lines);
      if (b.floors < floors && b.vis >= 2 && this.t - b.floorAt > 0.5) { b.floors++; b.floorAt = this.t; b.pop = 1; CP.audio.sfx('tick'); }
      if (tgt.done && !b.done && b.vis >= Rd.MAX_STAGE && this.t - b.lastStep > 0.3) {
        b.done = true; b.rebuilt = false; b.pop = 1;
        this.confetti(b.x, this.groundY - W.heightOf(b) - 4, 26);
        if (this.celebrate) { CP.audio.sfx('done'); this.celebrate = 0; }
      }
      if (!tgt.done && b.done) { b.done = false; b.rebuilt = true; b.pop = 1; }
      if (b.flags < tgt.flags) b.flags = tgt.flags;
      if (b.smoke > 0) {
        b.smoke -= dt;
        if (Math.random() < dt * 9) this.add({ x: b.x + Math.random() * 10 - 5, y: this.groundY - W.heightOf(b) + 2, vx: Math.random() * 6 - 1, vy: -14 - Math.random() * 6, g: 0, life: 1.1, c: 'rgba(90,90,100,0.7)', s: 2 + (Math.random() < 0.4 ? 1 : 0) });
      }
    }
    if (this.celebrate) { this.celebrate -= dt * 0.4; if (this.celebrate <= 0) { this.celebrate = 0; CP.audio.sfx('cheer'); } }

    // 간식
    for (i = this.snacks.length - 1; i >= 0; i--) {
      var s = this.snacks[i];
      s.age += dt;
      if (s.z > 0) { s.vz -= 420 * dt; s.z = Math.max(0, s.z + s.vz * dt); }
      else if (!s.taken) {
        var best = null, bd = 1e9;
        for (id in this.pets) { var q = this.pets[id]; if (q.over || q.leaving) continue; var d = Math.abs(q.x - s.x); if (d < bd) { bd = d; best = q; } }
        if (best) { s.taken = true; best.over = { type: 'eat', x: s.x - best.face * 2, snack: s, t: 0 }; }
      }
      if (s.eaten || s.age > 20) this.snacks.splice(i, 1);
    }

    for (id in this.pets) {
      var p = this.pets[id];
      p.update(dt, env);
      if (p.gone) { delete this.pets[id]; this.dirty = true; }
    }

    for (i = this.fx.length - 1; i >= 0; i--) {
      var f = this.fx[i];
      f.life -= dt;
      if (f.life <= 0) { this.fx.splice(i, 1); continue; }
      f.vy += (f.g || 0) * dt; f.x += f.vx * dt; f.y += f.vy * dt;
    }

    // 카메라: 지금 공사 중인 건물을 따라간다
    var Wd = env.W, content = this.maxX - this.minX, target;
    if (content <= Wd) target = this.minX - (Wd - content) / 2;
    else target = CP.clamp(this.focusX() - Wd * 0.5, this.minX, this.maxX - Wd);
    if (!this.cam.ready || env.reduced) { this.cam.x = target; this.cam.ready = true; }
    else this.cam.x += (target - this.cam.x) * Math.min(1, dt * 2.2);
  };

  Scene.prototype.draw = function (g, env) {
    var cam = Math.round(this.cam.x), gy = this.groundY, i, id, self = this;
    var X = function (wx) { return Math.round(wx - cam); };
    CP.seasons.drawTrees(g, env.W, gy, env, cam);
    W.drawGround(g, env.W, env.H, gy, env, cam);
    W.drawFence(g, -((cam % 24) + 24) % 24 - 24, env.W + 24, gy);
    W.drawLamps(g, this.lampXs(cam, env.W), gy);
    W.drawYard(g, X, gy, env, Math.round(this.yardX));
    W.drawOffice(g, X(this.officeX), gy, env);
    // 표지판 기둥(글자는 화면 위 글자 층에서 그린다)
    W.R(g, X(24), gy - 22, 2, 22, '#8a6a4a'); W.R(g, X(40), gy - 22, 2, 22, '#8a6a4a');
    CP.seasons.drawProps(g, env, X, gy, this.officeX);
    for (i = 0; i < this.list.length; i++) {
      var b = this.list[i], bx = X(b.x);
      if (bx < -50 || bx > env.W + 50) continue;
      W.drawBuilding(g, b, bx, gy, env);
    }
    for (i = 0; i < this.snacks.length; i++) {
      var s = this.snacks[i];
      if (!s.eaten) g.drawImage(CP.sprites.tile('snack', CP.sprites.TOOLS.snack.rows, PAL), X(s.x) - 2, Math.round(gy - 4 - s.z));
    }
    var held = null;
    for (id in this.pets) { var p = this.pets[id]; if (p.over && p.over.type === 'held') { held = p; continue; } p.draw(g, X(p.x), gy, env); }
    if (held) held.draw(g, X(held.x), gy, env);
    this.drawFx(g, X, false);
  };

  // 가로등은 건물 사이 빈자리에 하나 걸러 하나씩 선다. 화면에 보이는 것의 화면 x를 돌려준다.
  Scene.prototype.lampXs = function (cam, viewW) {
    var out = [], end = this.lot0 + Math.max(1, this.list.length) * this.pitch;
    for (var wx = this.lot0 + this.pitch / 2; wx < end; wx += this.pitch * 2) {
      var sx = Math.round(wx - cam);
      if (sx > -30 && sx < viewW + 30) out.push(sx);
    }
    return out;
  };

  // 색조를 입힌 뒤 덧그리는 빛: 켜진 창, 불꽃, 색종이
  Scene.prototype.drawLights = function (g, env) {
    var cam = Math.round(this.cam.x), i;
    var X = function (wx) { return Math.round(wx - cam); };
    W.drawFenceLights(g, -((cam % 24) + 24) % 24 - 24, env.W + 24, this.groundY, env);
    W.drawLampLights(g, this.lampXs(cam, env.W), this.groundY, env);
    for (i = 0; i < this.list.length; i++) W.drawBuildingLights(g, this.list[i], X(this.list[i].x), this.groundY, env);
    CP.seasons.drawPropLights(g, env, X, this.groundY, this.officeX);
    this.drawFx(g, X, true);
  };

  Scene.prototype.drawFx = function (g, X, light) {
    for (var i = 0; i < this.fx.length; i++) {
      var f = this.fx[i];
      if (!!f.light !== light) continue;
      var x = X(f.x), y = Math.round(f.y);
      if (f.tile) g.drawImage(CP.sprites.tile('fx:' + f.tile, TILES[f.tile], PAL), x - 1, y - 1);
      else { g.fillStyle = f.c; g.fillRect(x, y, f.s || 1, f.s || 1); }
    }
  };

  // 화면 좌표(논리 픽셀)에서 무엇을 눌렀는지
  Scene.prototype.pick = function (sx, sy) {
    var wx = sx + Math.round(this.cam.x), up = this.groundY - sy, id, i;
    for (id in this.pets) if (this.pets[id].hit(wx, up)) return { pet: this.pets[id] };
    for (i = 0; i < this.list.length; i++) {
      var b = this.list[i];
      if (Math.abs(wx - b.x) <= b.look.bw / 2 + 2 && up >= 0 && up <= W.heightOf(b) + 2 && b.vis >= 1) return { building: b };
    }
    return { wx: wx };
  };

  CP.Scene = Scene;
})();
