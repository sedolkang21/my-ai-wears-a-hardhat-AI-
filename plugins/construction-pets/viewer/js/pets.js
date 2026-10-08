// 펫 한 마리의 움직임과 모습. 성격(속도, 대사, 쉬는 행동)은 config/pets.json에서 온다.
(function () {
  'use strict';
  var CP = window.CP;
  var PAL = CP.sprites.PAL;

  // 동작의 기본 길이(초). sticky는 다음 일이 올 때까지 계속한다.
  var BASE = {
    prompt: 1.3, read: 1.5, web: 1.9, bash: 2.0, edit: 1.9, plan: 1.2, other: 1.2, delegate: 1.0,
    fail: 1.5, cheer: 2.4, sweep: 3.0, highfive: 0.9, look: 0.8, greet: 1.2,
  };
  var STICKY = { wait: 1, wave: 1, worried: 1, lunch: 1, rest: 1 };

  function Pet(scene, info) {
    var cfg = CP.app.config.pets;
    this.scene = scene;
    this.id = info.id;
    this.info = info;
    this.ai = Object.prototype.hasOwnProperty.call(cfg.kinds, info.ai) ? info.ai : 'other';
    this.kind = cfg.kinds[this.ai];
    this.p = cfg.personalities[this.kind.personality] || cfg.personalities.craftsman;
    this.sub = info.role === 'sub';
    var species = this.kind.skin && CP.sprites.SPECIES[this.kind.skin] ? this.kind.skin : this.kind.species;
    this.species = this.sub && species === 'octopus' ? 'mini' : species;
    var helmets = cfg.helmets || ['#F2C230'];
    this.helmet = this.sub ? helmets[1 + (scene.subCount++ % Math.max(1, helmets.length - 1))]
      : helmets[Math.max(0, Object.keys(cfg.kinds).indexOf(this.ai)) % helmets.length];
    this.nameKey = this.sub ? null : this.ai;
    this.x = scene.officeX + 14 + (Math.random() * 10 - 5);
    this.z = 0; this.vx = 0; this.vz = 0;
    this.face = 1;
    this.clock = Math.random() * 10;
    this.hop = 0;
    this.queue = [];
    this.act = null;
    this.over = null;
    this.idleT = 0; this.nextIdle = 3 + Math.random() * 3;
    this.happy = 0; this.boost = 0; this.blink = 2 + Math.random() * 3; this.react = 0;
    this.slot = scene.slotCount++ % 4;
    this.gone = false;
    this.lastHit = -1;
    this.sayAt = -10;
  }

  Pet.prototype.name = function () {
    var names = (CP.app.prefs && CP.app.prefs.names) || {};
    if (this.nameKey && names[this.nameKey]) return names[this.nameKey];
    if (this.sub) return this.info.agentType ? CP.t('pets.helper.of', { type: this.info.agentType }) : CP.t('pets.helper');
    return CP.i18n.pick(this.kind.defaultName) || CP.i18n.pick(this.kind.label);
  };

  Pet.prototype.line = function (key) {
    var lines = CP.i18n.pick(this.p.lines), list = lines && lines[key];
    return list && list.length ? CP.pick(list) : null;
  };

  Pet.prototype.busy = function () { return !!(this.act && !STICKY[this.act.type]) || this.queue.length > 0; };

  Pet.prototype.enqueue = function (type, o) {
    o = o || {};
    var a = { type: type, t: 0, dur: (BASE[type] || 1.2) / (type === 'edit' || type === 'read' || type === 'bash' ? this.p.workTempo : 1), sticky: !!STICKY[type] };
    for (var k in o) a[k] = o[k];
    if (this.act && (this.act.sticky || this.act.type === 'rest')) this.act = null;
    this.wander = undefined;
    var last = this.queue[this.queue.length - 1];
    if (last && last.type === type && last.b === a.b && !a.sticky && type !== 'highfive' && !a.onDone) {
      last.dur = Math.min(last.dur + 0.35, 3);
      if (a.x !== undefined) last.x = a.x;
      return last;
    }
    this.queue.push(a);
    // 이벤트가 몰리면 오래된 구경거리부터 덜어낸다. 건물 짓기와 퇴장은 남긴다.
    while (this.queue.length > 6) {
      var cut = -1;
      for (var i = 0; i < this.queue.length - 1; i++) if (this.queue[i].type !== 'edit' && this.queue[i].type !== 'highfive' && !this.queue[i].keep) { cut = i; break; }
      this.queue.splice(cut < 0 ? 0 : cut, 1);
    }
    return a;
  };

  Pet.prototype.spot = function (b) { // 건물 앞 자리. 여럿이면 겹치지 않게 벌린다
    return b.x + [-9, 9, -2, 15][this.slot];
  };

  Pet.prototype.say = function (key, force) {
    var now = this.scene.t;
    if (!force && (now - this.sayAt < 4 || Math.random() > this.p.chatter)) return;
    var text = this.line(key);
    if (text) { this.sayAt = now; CP.ui.bubble(this, text, 2600); }
  };

  Pet.prototype.update = function (dt, env) {
    var sc = this.scene, speedUp = this.boost > 0 ? 1.6 : 1;
    this.clock += dt * speedUp;
    this.happy = Math.max(0, this.happy - dt);
    this.boost = Math.max(0, this.boost - dt);
    this.react = Math.max(0, this.react - dt);
    this.blink -= dt;
    if (this.blink < -0.12) this.blink = 1.5 + Math.random() * 4;

    if (this.over) return this.updateOver(dt, env);

    if (!this.act && this.queue.length) {
      this.act = this.queue.shift();
      this.act.dur /= 1 + this.queue.length * 0.6;
      this.idleT = 0;
      if (this.act.b) this.act.x = this.spot(this.act.b);
      // 탐험가는 일하러 가기 전에 잠깐 딴 데를 구경한다
      if (this.p.detour && !this.queue.length && this.act.x !== undefined && Math.random() < this.p.detour && !env.reduced) {
        this.queue.unshift(this.act);
        this.act = { type: 'look', t: 0, dur: 0.7, x: this.x + (Math.random() < 0.5 ? -1 : 1) * (18 + Math.random() * 20) };
      }
    }

    var a = this.act;
    if (a) {
      if (a.x !== undefined && !a.arrived) {
        if (this.walkTo(a.x, dt, speedUp * (1 + this.queue.length * 0.5))) {
          a.arrived = true;
          if (a.b) this.face = a.b.x >= this.x ? 1 : -1;
          if (a.partner) this.face = a.partner.x >= this.x ? 1 : -1;
        }
        return;
      }
      a.t += dt * (a.type === 'edit' ? speedUp : 1);
      this.perform(a, dt, env);
      if (!a.sticky && a.t >= a.dur) {
        if (a.onDone) a.onDone();
        this.act = null;
      }
      return;
    }

    // 할 일이 없을 때
    this.z = 0;
    this.idleT += dt;
    if (this.wander !== undefined) {
      if (this.walkTo(this.wander, dt, 0.6)) this.wander = undefined;
      return;
    }
    if (this.idleT > this.nextIdle) {
      this.idleT = 0; this.nextIdle = 5 + Math.random() * 6;
      var rest = CP.pick(this.p.rest || ['skygaze']);
      if (Math.random() < 0.45 || rest === 'sniff') {
        var home = sc.focusX();
        this.wander = CP.clamp(this.x + (Math.random() * 60 - 30), home - 70, home + 70);
      } else {
        this.act = { type: 'rest', what: rest, t: 0, dur: 4 + Math.random() * 3, sticky: false };
      }
    }
  };

  // 목표 x까지 통통 뛰어간다. 도착하면 true.
  Pet.prototype.walkTo = function (tx, dt, mult) {
    var d = tx - this.x, dist = Math.abs(d);
    if (dist < 1.2) { this.x = tx; this.z = 0; this.hop = 0; return true; }
    var speed = this.p.walkSpeed * (mult || 1);
    if (dist / speed > 1.6) speed = dist / 1.6; // 멀어도 1.6초 안에는 도착한다
    this.face = d > 0 ? 1 : -1;
    this.x += Math.sign(d) * Math.min(dist, speed * dt);
    this.hop += dt * Math.max(2.4, speed / 9);
    this.z = CP.reducedMotion ? 0 : Math.abs(Math.sin(this.hop * Math.PI)) * this.p.hopHeight;
    return false;
  };

  Pet.prototype.perform = function (a, dt, env) {
    var sc = this.scene, t = a.t;
    this.z = 0;
    switch (a.type) {
      case 'edit': {
        var period = 0.48 / this.p.workTempo, f = Math.floor((t % period) / period * 3);
        a.frame = f;
        var hit = Math.floor(t / period);
        if (f === 2 && hit !== this.lastHit) {
          this.lastHit = hit;
          var hx = this.x + this.face * 11;
          sc.sparks(hx, sc.groundY - 9, 3);
          CP.audio.sfx('hammer');
          if (a.b) sc.hammerHit(a.b);
        }
        break;
      }
      case 'bash':
        env.craneBusy = true;
        if (Math.random() < dt * 5) sc.puff(this.x + this.face * 14, sc.groundY - 10, 1, 'rgba(210,210,215,0.8)');
        break;
      case 'fail':
        if (!CP.reducedMotion) this.face = Math.floor(t * 7) % 2 ? 1 : -1;
        this.z = CP.reducedMotion ? 0 : Math.abs(Math.sin(t * 9)) * 2;
        break;
      case 'cheer':
        this.z = CP.reducedMotion ? 0 : Math.abs(Math.sin(t * Math.PI * 1.6)) * 7;
        break;
      case 'sweep':
        this.x += Math.sin(t * 2.2) * 9 * dt;
        this.face = Math.cos(t * 2.2) > 0 ? 1 : -1;
        if (Math.random() < dt * 4) sc.puff(this.x + this.face * 12, sc.groundY - 1, 1, 'rgba(200,185,160,0.7)');
        break;
      case 'highfive':
        if (!a.clapped && t > 0.35) {
          a.clapped = true;
          sc.stars(this.x + this.face * 9, sc.groundY - 14, 5);
          CP.audio.sfx('highfive');
        }
        break;
      case 'rest':
        if (a.what === 'coffee' && Math.random() < dt * 2) sc.puff(this.x - this.face * 9, sc.groundY - 13, 1, 'rgba(255,255,255,0.7)', -8);
        if (a.what === 'nap' && Math.floor(t * 0.8) !== a.zz) { a.zz = Math.floor(t * 0.8); sc.glyph(this.x + 6, sc.groundY - 16, 'z'); }
        break;
      case 'worried':
        if (a.b) this.face = a.b.x >= this.x ? 1 : -1;
        break;
    }
  };

  Pet.prototype.updateOver = function (dt, env) {
    var o = this.over, sc = this.scene, G = 420;
    o.t = (o.t || 0) + dt;
    switch (o.type) {
      case 'drop':
        this.vz -= G * dt; this.z += this.vz * dt;
        if (this.z <= 0) {
          this.z = 0; this.vz = 0; this.over = { type: 'land', t: 0 };
          sc.puff(this.x - 5, sc.groundY - 1, 3, 'rgba(200,185,160,0.8)'); sc.puff(this.x + 5, sc.groundY - 1, 3, 'rgba(200,185,160,0.8)');
          CP.audio.sfx('drop');
        }
        break;
      case 'land':
        if (o.t > 0.28) { this.over = null; this.say('hello', true); }
        break;
      case 'held':
        this.x = CP.lerp(this.x, o.x, Math.min(1, dt * 22));
        this.z = CP.lerp(this.z, Math.max(0, o.z), Math.min(1, dt * 22));
        break;
      case 'thrown':
        this.vz -= G * dt; this.x += this.vx * dt; this.z += this.vz * dt;
        this.x = CP.clamp(this.x, sc.minX + 8, sc.maxX - 8);
        if (this.x <= sc.minX + 8 || this.x >= sc.maxX - 8) this.vx *= -0.5;
        if (this.z <= 0) {
          this.z = 0;
          if (Math.abs(this.vz) > 90) { this.vz = -this.vz * 0.42; this.vx *= 0.6; sc.puff(this.x, sc.groundY - 1, 3, 'rgba(200,185,160,0.8)'); CP.audio.sfx('tick'); }
          else { this.vz = 0; this.vx = 0; this.over = { type: 'dizzy', t: 0 }; }
        }
        break;
      case 'dizzy':
        if (o.t > 0.7) { this.over = null; if (this.act) this.act.arrived = false; }
        break;
      case 'eat':
        if (!o.arrived) { if (this.walkTo(o.x, dt, 1.8)) { o.arrived = true; o.t = 0; CP.audio.sfx('munch'); if (o.snack) o.snack.eaten = true; } }
        else if (o.t > 1.1) {
          this.over = null; this.boost = 6; this.happy = 2;
          sc.hearts(this.x, sc.groundY - 18, 3); this.say('snack', true);
          if (this.act) this.act.arrived = false;
        }
        break;
      case 'leave':
        if (this.walkTo(o.x, dt, 1.3)) this.gone = true;
        break;
    }
  };

  Pet.prototype.hit = function (wx, wy) { // wy: 땅 위 높이
    var top = (this.species === 'mini' ? 12 : 17) + this.z;
    return Math.abs(wx - this.x) <= 8 && wy >= this.z - 1 && wy <= top + 3;
  };

  Pet.prototype.draw = function (g, sx, gy, env) {
    var a = this.act, o = this.over, sc = this.scene;
    var r = {
      species: this.species, colors: this.kind.colors, helmet: this.helmet, face: this.face,
      legs: 0, bob: 0, eyes: { dx: 0, dy: 0, mode: 'open' }, sx: 1, sy: 1, pose: null,
      acc: this.sub ? null : env.acc, lamp: env.night > 0.7 && !!(CP.sprites.SPECIES[this.species] && (CP.sprites.SPECIES[this.species].helmet || CP.sprites.SPECIES[this.species].small)),
    };
    var moving = this.hop > 0 && this.z >= 0 && ((a && a.x !== undefined && !a.arrived) || this.wander !== undefined || (o && (o.type === 'leave' || (o.type === 'eat' && !o.arrived))));
    var c = this.clock;

    // 눈: 마우스를 따라본다
    var p = CP.app.pointer;
    if (p && p.inside) { var d = p.wx - this.x; r.eyes.dx = Math.abs(d) < 5 ? 0 : (d > 0 ? 1 : -1) * this.face; if (p.wyUp > 26) r.eyes.dy = -1; }
    if (this.blink < 0) r.eyes.mode = 'blink';

    if (moving) {
      r.legs = Math.floor(this.hop * 2) % 4;
      if (!env.reduced) { var s = Math.abs(Math.sin(this.hop * Math.PI)); r.sy = 0.9 + s * 0.2; r.sx = 1.08 - s * 0.14; }
    } else if (!o) {
      r.bob = Math.floor(c * 2) % 2 && !env.reduced ? 1 : 0;
      if (r.bob) r.legs = 0;
    }

    if (a && (a.arrived || a.x === undefined) && !o) {
      switch (a.type) {
        case 'edit': r.pose = 'hammer' + (a.frame || 0); r.eyes.dx = 1; r.bob = a.frame === 2 ? 1 : 0; break;
        case 'read': r.pose = 'read'; r.eyes.dy = 1; r.eyes.dx = Math.floor(c * 3) % 3 - 1; break;
        case 'prompt': case 'plan': r.pose = 'clip'; r.eyes.dy = 1; r.eyes.dx = 0; break;
        case 'web': r.pose = 'scope'; r.eyes.dy = -1; r.eyes.dx = 1; break;
        case 'bash': case 'other': r.pose = 'wrench' + (Math.floor(c * 5) % 2); r.eyes.dx = 1; break;
        case 'delegate': case 'greet': r.pose = 'wave' + (Math.floor(c * 5) % 2); break;
        case 'fail': r.eyes.mode = 'wide'; r.sweat = true; break;
        case 'wait': r.pose = 'handup'; r.eyes.dy = -1; break;
        case 'wave': r.pose = 'wave' + (Math.floor(c * 4) % 2); break;
        case 'cheer': r.eyes.mode = 'happy'; r.pose = Math.floor(c * 6) % 2 ? 'handup' : 'wave0'; r.blush = true; break;
        case 'worried': r.sweat = Math.floor(c * 2) % 2 === 0; r.eyes.dx = 1; break;
        case 'lunch': r.sit = true; r.pose = 'lunch'; r.eyes.mode = 'happy'; break;
        case 'sweep': r.pose = 'broom' + (Math.floor(c * 5) % 2); r.eyes.dy = 1; break;
        case 'highfive': r.pose = 'handup'; r.eyes.mode = a.clapped ? 'happy' : 'open'; break;
        case 'look': r.eyes.dy = -1; break;
        case 'rest':
          if (a.what === 'coffee') { r.pose = 'coffee'; if (Math.floor(c) % 3 === 0) r.eyes.mode = 'closed'; }
          else if (a.what === 'nap') { r.sit = true; r.eyes.mode = 'closed'; r.bob = Math.floor(c * 0.8) % 2; }
          else if (a.what === 'skygaze') { r.eyes.dy = -1; r.eyes.dx = Math.floor(c * 0.5) % 2 ? 1 : -1; }
          else if (a.what === 'stretch') { var st = Math.sin(c * 4); r.sy = 1 + st * 0.1; r.sx = 1 - st * 0.08; r.pose = st > 0 ? 'handup' : null; }
          break;
      }
    }
    if (o) {
      if (o.type === 'drop') { r.eyes.mode = 'wide'; r.sy = 1.12; r.sx = 0.92; r.legs = 1; }
      else if (o.type === 'land') { var k = Math.min(1, o.t / 0.28); r.sy = 0.72 + 0.28 * k; r.sx = 1.22 - 0.22 * k; }
      else if (o.type === 'held') { r.eyes.mode = 'wide'; r.legs = Math.floor(c * 8) % 2 ? 1 : 3; r.sy = 1.08; r.sx = 0.95; }
      else if (o.type === 'thrown') { r.eyes.mode = 'wide'; r.rot = env.reduced ? 0 : (o.t * 9 * (this.vx >= 0 ? 1 : -1)); }
      else if (o.type === 'dizzy') { r.eyes.mode = Math.floor(c * 12) % 2 ? 'closed' : 'blink'; r.sy = 0.92; r.sx = 1.06; }
      else if (o.type === 'eat' && o.arrived) { r.pose = 'snack'; r.eyes.mode = 'happy'; r.bob = Math.floor(c * 8) % 2; }
    }
    if (this.happy > 0) { r.eyes.mode = 'happy'; r.blush = true; }
    if (this.react > 0 && !o && !env.reduced) this.zDraw = Math.abs(Math.sin(this.react * 10)) * 2; else this.zDraw = 0;

    // 그림자
    var zz = this.z + this.zDraw, sw = Math.max(4, Math.round((this.species === 'mini' ? 8 : 12) - zz * 0.25));
    g.fillStyle = 'rgba(30,30,50,0.22)';
    g.fillRect(Math.round(sx - sw / 2), gy - 1, sw, 2);

    // Bash 작업 때 옆에 놓이는 조작함
    if (a && a.type === 'bash' && a.arrived !== false && !o) {
      var bx = Math.round(sx + this.face * 14) - 3, up = Math.floor(c * 5) % 2;
      g.fillStyle = '#7b828c'; g.fillRect(bx, gy - 8, 7, 8);
      g.fillStyle = '#5d646e'; g.fillRect(bx, gy - 8, 7, 1);
      g.fillStyle = PAL.r; g.fillRect(bx + 3, gy - 12 + up, 1, 4 - up); g.fillRect(bx + 2 + up * 2, gy - 13 + up, 2, 2);
      g.fillStyle = Math.floor(c * 6) % 2 ? PAL.g : PAL.y; g.fillRect(bx + 1, gy - 5, 2, 2);
    }

    CP.sprites.drawPet(g, sx, gy - zz, r);
  };

  CP.Pet = Pet;
})();
