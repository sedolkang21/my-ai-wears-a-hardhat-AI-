// 공사장 상태 계산기. 서버(Node)와 뷰어(브라우저)가 같은 파일을 쓴다.
// 정규화된 이벤트를 받아 "지금 공사장이 어떤 모습인가"만 계산한다. 연출은 뷰어가 맡는다.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.CP = root.CP || {}).reduce = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_STAGE = 4; // 1 터닦기, 2 골조, 3 벽, 4 지붕. 준공은 done 플래그.

  function newSite(id, name) {
    return {
      id: id,
      name: name || '공사현장',
      buildings: {},   // 경로 -> 건물
      order: [],       // 처음 손댄 순서
      tasks: {},       // id -> { subject, done }
      taskOrder: [],
      pets: {},        // petId -> 펫
      turn: { active: false, calls: 0, finished: false, failed: false },
      lastFile: null,
      ended: false,
      updatedAt: 0,
    };
  }

  function petId(ev) {
    return ev.session + (ev.agent ? ':' + ev.agent : '');
  }

  function ensurePet(site, ev) {
    var id = petId(ev);
    var pet = site.pets[id];
    if (!pet) {
      pet = site.pets[id] = {
        id: id,
        session: ev.session,
        agent: ev.agent || null,
        ai: ev.ai || 'claude',
        agentType: ev.agentType || null,
        role: ev.agent ? 'sub' : 'main',
        state: 'idle',
        activity: null,
      };
    }
    return pet;
  }

  function ensureBuilding(site, file) {
    var b = site.buildings[file];
    if (!b) {
      b = site.buildings[file] = {
        path: file, units: 0, stage: 0, lines: 0, edits: 0,
        done: false, rebuilt: false, flags: 0, snippet: null,
      };
      site.order.push(file);
    }
    return b;
  }

  function floorsFor(lines) {
    if (lines <= 0) return 1;
    if (lines <= 40) return 1;
    if (lines <= 120) return 2;
    if (lines <= 300) return 3;
    if (lines <= 700) return 4;
    return 5;
  }

  function allTasksDone(site) {
    if (!site.taskOrder.length) return true;
    for (var i = 0; i < site.taskOrder.length; i++) {
      if (!site.tasks[site.taskOrder[i]].done) return false;
    }
    return true;
  }

  function taskCounts(site) {
    var done = 0;
    for (var i = 0; i < site.taskOrder.length; i++) if (site.tasks[site.taskOrder[i]].done) done++;
    return { done: done, total: site.taskOrder.length };
  }

  // 0..1. 작업 목록이 있으면 완료 비율, 없으면 툴 호출 횟수로 대략만.
  function progress(site) {
    var c = taskCounts(site);
    if (c.total) {
      if (!site.turn.active && site.turn.finished && c.done === c.total) return 1;
      return Math.min(0.96, c.done / c.total);
    }
    if (site.turn.active) return 0.88 * (1 - Math.exp(-site.turn.calls / 14));
    return site.turn.finished ? 1 : 0;
  }

  function phase(site) {
    if (site.ended) return 'night';
    var p = progress(site);
    if (p < 0.12) return 'dawn';
    if (p < 0.6) return 'day';
    if (p < 0.97) return 'dusk';
    return 'night';
  }

  function apply(site, ev) {
    site.updatedAt = ev.ts || site.updatedAt;
    var pet, b, id;
    switch (ev.type) {
      case 'session_start':
        if (ev.siteName) site.name = ev.siteName;
        site.ended = false;
        ensurePet(site, ev).state = 'idle';
        break;

      case 'prompt':
        pet = ensurePet(site, ev);
        pet.state = 'working';
        pet.activity = { kind: 'prompt' };
        site.ended = false;
        if (allTasksDone(site)) { site.tasks = {}; site.taskOrder = []; }
        site.turn = { active: true, calls: 0, finished: false, failed: false };
        break;

      case 'tool_pre':
        pet = ensurePet(site, ev);
        pet.state = 'working';
        pet.activity = { kind: ev.kind, tool: ev.tool, file: ev.file || null, detail: ev.detail || null };
        if (!site.turn.active) site.turn = { active: true, calls: 0, finished: false, failed: false };
        site.turn.calls++;
        break;

      case 'tool_post':
        pet = ensurePet(site, ev);
        pet.state = 'working';
        if (ev.kind === 'edit' && ev.file) {
          b = ensureBuilding(site, ev.file);
          b.edits++;
          b.units += Math.max(1, ev.gain || 1);
          b.stage = Math.min(MAX_STAGE, b.units);
          if (typeof ev.lines === 'number' && ev.lines > 0) b.lines = ev.lines;
          if (ev.snippet && ev.snippet.length) b.snippet = ev.snippet;
          if (b.done) { b.done = false; b.rebuilt = true; }
          site.lastFile = ev.file;
          pet.activity = { kind: 'edit', tool: ev.tool, file: ev.file };
        }
        break;

      case 'tool_fail':
        ensurePet(site, ev).activity = { kind: 'fail', tool: ev.tool, file: ev.file || null };
        site.turn.failed = true;
        break;

      case 'agent_start':
        pet = ensurePet(site, ev);
        pet.state = 'working';
        pet.agentType = ev.agentType || pet.agentType;
        break;

      case 'agent_stop':
        delete site.pets[petId(ev)];
        break;

      case 'task_created':
        id = String(ev.id);
        if (!site.tasks[id]) { site.tasks[id] = { subject: ev.subject || '', done: false }; site.taskOrder.push(id); }
        break;

      case 'task_completed':
        id = String(ev.id);
        if (!site.tasks[id]) { site.tasks[id] = { subject: ev.subject || '', done: false }; site.taskOrder.push(id); }
        if (!site.tasks[id].done) {
          site.tasks[id].done = true;
          if (site.lastFile && site.buildings[site.lastFile]) site.buildings[site.lastFile].flags++;
        }
        break;

      case 'tasks_set':
        var before = taskCounts(site).done, list = ev.tasks || [];
        site.tasks = {}; site.taskOrder = [];
        for (var t = 0; t < list.length; t++) {
          id = 'todo' + t;
          site.tasks[id] = { subject: list[t].subject || '', done: !!list[t].done };
          site.taskOrder.push(id);
        }
        var gained = taskCounts(site).done - before;
        if (gained > 0 && site.lastFile && site.buildings[site.lastFile]) site.buildings[site.lastFile].flags += gained;
        break;

      case 'permission':
        pet = ensurePet(site, ev);
        pet.state = 'waiting';
        pet.activity = { kind: 'permission', tool: ev.tool || null };
        break;

      case 'idle':
        pet = ensurePet(site, ev);
        pet.state = 'idle';
        pet.activity = { kind: 'idle' };
        break;

      case 'stop':
        pet = ensurePet(site, ev);
        pet.state = 'idle';
        pet.activity = { kind: 'done' };
        site.turn.active = false;
        site.turn.finished = true;
        for (var i = 0; i < site.order.length; i++) {
          b = site.buildings[site.order[i]];
          if (!b.done) { b.done = true; b.stage = MAX_STAGE; b.units = Math.max(b.units, MAX_STAGE); }
        }
        break;

      case 'stop_fail':
        pet = ensurePet(site, ev);
        pet.state = 'idle';
        pet.activity = { kind: ev.error === 'rate_limit' ? 'lunch' : 'worried' };
        site.turn.active = false;
        break;

      case 'compact':
        ensurePet(site, ev).activity = { kind: 'sweep' };
        break;

      case 'session_end':
        var gone = [];
        for (var k in site.pets) if (site.pets[k].session === ev.session) gone.push(k);
        for (var j = 0; j < gone.length; j++) delete site.pets[gone[j]];
        var left = 0;
        for (var m in site.pets) left++;
        if (!left) { site.ended = true; site.turn.active = false; }
        break;
    }
    return site;
  }

  return {
    MAX_STAGE: MAX_STAGE,
    newSite: newSite,
    apply: apply,
    petId: petId,
    progress: progress,
    phase: phase,
    taskCounts: taskCounts,
    floorsFor: floorsFor,
  };
});
