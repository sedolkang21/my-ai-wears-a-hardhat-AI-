// 레트로 게임기풍 소리. 사각파·삼각파·잡음을 코드로 합성하고 소리 파일은 쓰지 않는다.
// 기본은 꺼져 있고, 사용자가 켜기 전에는 오디오 장치를 열지도 않는다.
(function () {
  'use strict';
  var CP = window.CP;
  var ac = null, master = null, sfxBus = null, bgmBus = null, noiseBuf = null;
  var on = { sfx: false, bgm: false };
  var timer = null, step = 0, nextTime = 0;

  function ensure() {
    if (ac) return true;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      ac = new AC();
      master = ac.createGain(); master.gain.value = 0.9;
      var lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200; // 사각파의 날카로움을 조금 깎는다
      master.connect(lp); lp.connect(ac.destination);
      sfxBus = ac.createGain(); sfxBus.gain.value = 0.16; sfxBus.connect(master);
      bgmBus = ac.createGain(); bgmBus.gain.value = 0.085; bgmBus.connect(master);
      var len = Math.floor(ac.sampleRate * 0.5);
      noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
      var d = noiseBuf.getChannelData(0), r = CP.rng(1234);
      for (var i = 0; i < len; i++) d[i] = r() * 2 - 1;
      return true;
    } catch (e) { ac = null; return false; }
  }

  function tone(bus, type, freq, t, dur, vol, slideTo) {
    var o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.setValueAtTime(vol, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(bus, t, dur, vol, hp) {
    var s = ac.createBufferSource(), g = ac.createGain(), f = ac.createBiquadFilter();
    s.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = hp || 2000;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(bus);
    s.start(t); s.stop(t + dur + 0.02);
  }

  var N = function (n) { return 440 * Math.pow(2, (n - 69) / 12); }; // MIDI 번호 -> Hz

  var SFX = {
    tick: function (t) { tone(sfxBus, 'square', N(88), t, 0.04, 0.5); },
    blip: function (t) { tone(sfxBus, 'square', N(76), t, 0.06, 0.6); tone(sfxBus, 'square', N(83), t + 0.06, 0.08, 0.6); },
    hammer: function (t) { noise(sfxBus, t, 0.05, 0.8, 1500); tone(sfxBus, 'square', N(57), t, 0.05, 0.5, N(45)); },
    step: function (t) { tone(sfxBus, 'triangle', N(60), t, 0.09, 0.9); tone(sfxBus, 'triangle', N(67), t + 0.08, 0.12, 0.9); },
    done: function (t) { [72, 76, 79, 84].forEach(function (n, i) { tone(sfxBus, 'square', N(n), t + i * 0.09, 0.14, 0.6); }); tone(sfxBus, 'triangle', N(60), t + 0.36, 0.4, 0.9); tone(sfxBus, 'square', N(88), t + 0.36, 0.34, 0.5); },
    fail: function (t) { tone(sfxBus, 'square', N(52), t, 0.16, 0.6, N(46)); tone(sfxBus, 'square', N(49), t + 0.16, 0.24, 0.6, N(40)); },
    pop: function (t) { tone(sfxBus, 'square', N(69), t, 0.07, 0.5, N(81)); },
    heart: function (t) { tone(sfxBus, 'triangle', N(81), t, 0.08, 0.9); tone(sfxBus, 'triangle', N(86), t + 0.07, 0.12, 0.9); },
    munch: function (t) { for (var i = 0; i < 3; i++) noise(sfxBus, t + i * 0.09, 0.04, 0.6, 900); },
    drop: function (t) { tone(sfxBus, 'square', N(84), t, 0.3, 0.4, N(60)); noise(sfxBus, t + 0.3, 0.08, 0.7, 500); },
    throw: function (t) { tone(sfxBus, 'triangle', N(64), t, 0.18, 0.8, N(79)); },
    flag: function (t) { tone(sfxBus, 'square', N(79), t, 0.06, 0.5); tone(sfxBus, 'square', N(84), t + 0.06, 0.1, 0.5); },
    wait: function (t) { tone(sfxBus, 'square', N(74), t, 0.1, 0.5); tone(sfxBus, 'square', N(74), t + 0.16, 0.1, 0.5); },
    highfive: function (t) { noise(sfxBus, t, 0.03, 0.9, 2500); tone(sfxBus, 'square', N(91), t + 0.02, 0.08, 0.4); },
    cheer: function (t) { [76, 79, 84].forEach(function (n, i) { tone(sfxBus, 'triangle', N(n), t + i * 0.07, 0.12, 0.9); }); },
  };

  // 배경 음악: 다장조 I–vi–IV–V를 도는 여덟 마디 직접 지은 루프. 16분음 단위, 0은 쉼.
  var BPM = 96, STEP = 60 / BPM / 4;
  var LEAD = [
    76, 0, 79, 0, 76, 0, 72, 0, 74, 0, 76, 0, 79, 0, 0, 0,
    81, 0, 79, 0, 76, 0, 72, 0, 74, 0, 72, 0, 69, 0, 0, 0,
    77, 0, 81, 0, 84, 0, 81, 0, 79, 0, 77, 0, 74, 0, 0, 0,
    79, 0, 83, 0, 86, 0, 83, 0, 81, 0, 79, 0, 74, 0, 0, 0,
    76, 0, 0, 79, 0, 0, 84, 0, 83, 0, 79, 0, 76, 0, 0, 0,
    72, 0, 0, 76, 0, 0, 81, 0, 79, 0, 76, 0, 72, 0, 0, 0,
    69, 0, 72, 0, 77, 0, 81, 0, 79, 0, 77, 0, 76, 0, 74, 0,
    74, 0, 79, 0, 83, 0, 79, 0, 74, 0, 71, 0, 67, 0, 0, 0,
  ];
  var CHORDS = [[48, 64, 67], [45, 64, 69], [41, 65, 69], [43, 67, 71], [48, 64, 67], [45, 64, 69], [41, 65, 69], [43, 67, 71]];

  function schedule() {
    if (!ac || !on.bgm) return;
    while (nextTime < ac.currentTime + 0.25) {
      var i = step % LEAD.length, bar = Math.floor(i / 16), s = i % 16, ch = CHORDS[bar];
      if (LEAD[i]) tone(bgmBus, 'square', N(LEAD[i]), nextTime, STEP * 1.7, 0.42);
      if (s % 8 === 0) tone(bgmBus, 'triangle', N(ch[0]), nextTime, STEP * 3.6, 1.0);
      if (s % 8 === 4) tone(bgmBus, 'triangle', N(ch[0] + 7), nextTime, STEP * 2.6, 0.8);
      if (s % 4 === 2) tone(bgmBus, 'square', N(ch[1 + ((s >> 2) % 2)]), nextTime, STEP * 0.9, 0.16);
      if (s % 4 === 0) noise(bgmBus, nextTime, 0.025, s % 8 === 4 ? 0.5 : 0.22, 6000);
      nextTime += STEP;
      step++;
    }
  }

  function startBgm() {
    if (timer || !ac) return;
    nextTime = ac.currentTime + 0.08;
    timer = setInterval(schedule, 80);
  }
  function stopBgm() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  CP.audio = {
    on: on,
    set: function (kind, value) { // 사용자의 클릭 안에서 불러야 소리가 난다
      on[kind] = !!value;
      if ((on.sfx || on.bgm) && ensure() && ac.state === 'suspended') ac.resume();
      if (on.bgm && ac) startBgm(); else stopBgm();
    },
    sfx: function (name) {
      if (!on.sfx || !ac || ac.state !== 'running' || document.hidden) return;
      var f = SFX[name];
      if (f) { try { f(ac.currentTime + 0.005); } catch (e) { /* 소리는 없어도 된다 */ } }
    },
    pause: function (hidden) {
      if (!ac) return;
      if (hidden) stopBgm(); else if (on.bgm) startBgm();
    },
    names: Object.keys(SFX),
  };
})();
