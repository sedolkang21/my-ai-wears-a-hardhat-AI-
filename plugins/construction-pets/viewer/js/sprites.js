// 픽셀 스프라이트. 이미지 파일 없이 문자열로 그린다. 한 글자가 한 픽셀이고 '.'은 비어 있다.
// 펫 몸 글자: o 몸, d 그늘, l 밝은 곳, k 먹색, w 흰색, p 분홍, y 조끼
(function () {
  'use strict';
  var CP = window.CP;

  // 소품에 쓰는 고정 색. 주황은 Claude 펫 몫으로 남겨 두려고 여기엔 넣지 않았다.
  var PAL = {
    k: '#2b2433', w: '#fbf9f2', e: '#9aa0a6', E: '#6c727a', c: '#f1e8d2',
    r: '#c9505a', R: '#96343f', p: '#f2a7b8', P: '#d9708c',
    y: '#f2c230', Y: '#c2941f', g: '#6aa56f', G: '#447a52', t: '#3e8e88',
    b: '#6fb1d9', B: '#3d6fa8', v: '#8e76c4', V: '#4b3b6b',
    n: '#8a6a4a', N: '#5f4630', s: '#e3c77a', S: '#b89b52', a: '#bfe3f0',
  };

  var SPECIES = {
    octopus: {
      w: 16, h: 16, legRow: 13, cx: 8, hatY: 5, helmet: true,
      eyes: [5, 10], eyeY: 7,
      body: [
        '................',
        '................',
        '....oooooooo....',
        '...oooooooooo...',
        '..ollooooooooo..',
        '..oloooooooooo..',
        '..oooooooooooo..',
        '..oooooooooooo..',
        '..oooooooooooo..',
        '.oooooooooooooo.',
        '.oooooooooooooo.',
        '..oooooooooooo..',
        '..dddddddddddd..',
      ],
      legs: [
        ['..oo.oo..oo.oo..', '..oo.oo..oo.oo..', '..dd.dd..dd.dd..'],
        ['.oo..oo.oo..oo..', '.oo..oo.oo..oo..', '.....dd.....dd..'],
        ['..oo.oo..oo.oo..', '..oo.oo..oo.oo..', '..dd.dd..dd.dd..'],
        ['..oo..oo.oo..oo.', '..oo..oo.oo..oo.', '..dd.....dd.....'],
      ],
    },
    // GPT 펫: 꼬마 로봇. 얼굴 화면과 귀 볼트, 옆으로 솟은 안테나가 있다.
    robot: {
      w: 16, h: 16, legRow: 13, cx: 8, hatY: 5, helmet: false,
      eyes: [5, 10], eyeY: 7,
      body: [
        '................',
        '.............y..',
        '.............d..',
        '.............d..',
        '...oooooooooo...',
        '..ollooooooooo..',
        '.dowwwwwwwwwwod.',
        '.dowwwwwwwwwwod.',
        '.dowwwwwwwwwwod.',
        '..owwwwddwwwwo..',
        '..oooooooooooo..',
        '..ooodooooyooo..',
        '..dddddddddddd..',
      ],
      legs: [
        ['....oo....oo....', '....oo....oo....', '...ddd....ddd...'],
        ['...oo.....oo....', '..ddd.....oo....', '..........ddd...'],
        ['....oo....oo....', '....oo....oo....', '...ddd....ddd...'],
        ['....oo.....oo...', '....oo....ddd...', '...ddd..........'],
      ],
    },
    // 그 밖의 AI 펫: 뭉게구름. 안전모 양옆으로 구름 봉우리가 삐져나온다.
    cloud: {
      w: 16, h: 16, legRow: 13, cx: 8, hatY: 5, helmet: false,
      eyes: [5, 10], eyeY: 7,
      body: [
        '................',
        '................',
        '......oooo......',
        '.....oloooo.....',
        '....oooooooo.ll.',
        '.ll.oooooooooooo',
        'oloooooooooooooo',
        'oooooooooooooooo',
        'oooooooooooooooo',
        '.oooooooooooooo.',
        '..oooooooooooo..',
        '..oooooooooooo..',
        '...ddd.ddd.ddd..',
      ],
      legs: [
        ['....oo....oo....', '....oo....oo....', '....dd....dd....'],
        ['...oo.....oo....', '...dd.....oo....', '..........dd....'],
        ['....oo....oo....', '....oo....oo....', '....dd....dd....'],
        ['....oo.....oo...', '....oo.....dd...', '....dd..........'],
      ],
    },
    // 서브에이전트용 작은 문어. 헬멧이 몸에 붙어 있고, 헬멧 색으로 서로 구분한다.
    mini: {
      w: 12, h: 12, legRow: 10, cx: 6, hatY: 3, helmet: false, small: true,
      eyes: [4, 7], eyeY: 5,
      body: [
        '....hhhh....',
        '..hhihhhhh..',
        '..hhhhhhhh..',
        '.HHHHHHHHHH.',
        '..oooooooo..',
        '..oooooooo..',
        '..oooooooo..',
        '.oooooooooo.',
        '..oooooooo..',
        '..dddddddd..',
      ],
      legs: [
        ['..oo.oo.oo..', '..dd.dd.dd..'],
        ['.oo..oo..oo.', '.....dd.....'],
        ['..oo.oo.oo..', '..dd.dd.dd..'],
        ['..oo.oo.oo..', '..dd....dd..'],
      ],
    },
  };

  var HELMET = [
    '.......ii.......',
    '.....hhhhhh.....',
    '...hhhihhhhhh...',
    '..hhihhhhhhhhh..',
    '..hhhhhhhhhhhh..',
    '.HHHHHHHHHHHHHH.',
  ];

  // 머리에 쓰는 것. 맨 아랫줄이 hatY에 오고 가운데를 맞춘다.
  var HATS = {
    santa: ['.......rrww.', '.....rrrrww.', '....rrrrr...', '...rrrrrrr..', '..rrrrrrrr..', '.wwwwwwwwww.', '.wwwwwwwwww.'],
    witch: ['.......V......', '......VVV.....', '......VVV.....', '.....VVVVV....', '.....yyyyy....', '....VVVVVVV...', '.VVVVVVVVVVVV.', 'VVVVVVVVVVVVVV'],
    party: ['...yy...', '...pp...', '..bbbb..', '..pppp..', '.bbbbbb.', '.pppppp.', 'bbbbbbbb'],
    newyear: ['...ww...', '...yy...', '..yyyy..', '..wwww..', '.yyyyyy.', '.yyyyyy.', 'YYYYYYYY'],
    paper: ['.....cc.....', '....cccc....', '...ccbbcc...', '..cccccccc..', '.cbbccccbbc.', 'cccccccccccc'],
    straw: ['.....ssssss.....', '....ssssssss....', '....rrrrrrrr....', '.ssssssssssssss.', 'SssssssssssssssS'],
  };
  // 헬멧 위에 덧그리는 것(헬멧은 그대로 쓴다)
  var OVER = {
    crown: { x: 1, y: 4, rows: ['p.w.p.y.p.w.p.', 'gpgwgpgygpgwgp'] },
    muffs: { x: 0, y: 5, rows: ['bb............bb', 'bw............wb', 'bb............bb'] },
  };
  var NECK = {
    scarf: { x: 2, y: 11, rows: ['tttttttttttt', '.........tt.', '.........tt.'] },
    muffler: { x: 2, y: 11, rows: ['rwrwrwrwrwrw', '..rw........', '..rw........'] },
    ribbon: { x: 5, y: 10, rows: ['pp..pp', 'pPPPPp', 'pp..pp'] },
    hanbok: { x: 1, y: 9, rows: ['b............b', 'yPPPPPwwPPPPPy', '.PPPPPwrPPPPP.', '.PPPPPPrPPPPP.'] },
    raincoat: { x: 1, y: 9, rows: ['yyyyyyyyyyyyyy', 'yyyyyyyyyyyyyy', '.yyyyyyyyyyyy.', '.YYYYYYYYYYYY.'] },
  };
  var FACE = {
    mustache: { x: 5, y: 10, rows: ['kkkkkk', 'k....k'] },
  };
  var BACK = {
    wings: { x: -3, y: 6, rows: ['V..V..............V..V', 'VVVV..............VVVV', 'VVVVV............VVVVV', '.VVVV............VVVV.', '..VV..............VV..'] },
  };
  var HELD = {
    brush: { x: -2, y: 2, rows: ['.k.', '.k.', 'kkk', 'kkk', '.c.', '.n.', '.n.', '.n.', '.n.'] },
    pouch: { x: -3, y: 8, rows: ['.y.y.', '..y..', '.rrr.', 'rrrrr', '.rrr.'] },
    songpyeon: { x: -5, y: 9, rows: ['.wgpw..', 'eeeeeee', '.eeeee.'] },
  };
  var TOOLS = {
    hammer0: { x: 13, y: 1, rows: ['eeee', 'EEEE', '.n..', '.n..', '.n..', '.n..', '.n..', '.n..'] },
    hammer1: { x: 14, y: 3, rows: ['....ee', '...eEE', '..n.E.', '.n....', 'n.....', 'n.....'] },
    hammer2: { x: 15, y: 8, rows: ['....ee', 'nnnneE', '....eE'] },
    read: { x: 2, y: 9, rows: ['wBBBBBBBBBBw', 'wBwwwwBwwwBw', 'wBBBBBBBBBBw', 'wBwwBwwwwBBw', 'wBBBBBBBBBBw'] },
    scope: { x: 11, y: 2, rows: ['.....eaa', '....nnae', '...nnn..', '..nnn...', '.nnn....', 'nn......'] },
    clip: { x: 5, y: 9, rows: ['..ee..', 'cccccc', 'ckkkkc', 'cccccc', 'ckkkcc', 'cccccc'] },
    wrench0: { x: 14, y: 4, rows: ['e.e', 'eee', '.e.', '.e.', '.e.'] },
    wrench1: { x: 14, y: 6, rows: ['ee...', '.eeee', 'ee...'] },
    coffee: { x: -3, y: 8, rows: ['wwww.', 'wnnww', 'wwww.', '.ww..'] },
    broom0: { x: 14, y: 2, rows: ['.n.', '.n.', '.n.', '.n.', '.n.', '.n.', '.n.', '.n.', '.n.', '.n.', 'sss', 'sss', 'SsS', 'S.S'] },
    broom1: { x: 15, y: 2, rows: ['n..', 'n..', 'n..', '.n.', '.n.', '.n.', '.n.', '.n.', '..n', '..n', '.ss', 'sss', 'sSs', 'S.S'] },
    lunch: { x: 4, y: 9, rows: ['RRRRRRRR', 'RwwgwyrR', 'RwwgyyrR', 'RRRRRRRR'] },
    handup: { x: 15, y: 3, rows: ['.o', '.o', '.o', 'o.', 'o.'] },
    wave0: { x: 15, y: 3, rows: ['..o', '.o.', '.o.', 'o..', 'o..'] },
    wave1: { x: 15, y: 3, rows: ['o..', 'o..', 'o..', 'o..', 'o..'] },
    snack: { x: 13, y: 8, rows: ['.nn.', 'nNnn', 'nnNn', '.nn.'] },
  };

  var tiles = new Map();
  function tile(key, rows, pal) {
    var hit = tiles.get(key);
    if (hit) return hit;
    var w = 0;
    for (var i = 0; i < rows.length; i++) w = Math.max(w, rows[i].length);
    var c = document.createElement('canvas');
    c.width = Math.max(1, w);
    c.height = Math.max(1, rows.length);
    var g = c.getContext('2d');
    for (var y = 0; y < rows.length; y++) {
      var row = rows[y];
      for (var x = 0; x < row.length; x++) {
        var ch = row[x];
        if (ch === '.' || ch === ' ') continue;
        var col = pal[ch] || PAL[ch];
        if (!col) continue;
        g.fillStyle = col;
        g.fillRect(x, y, 1, 1);
      }
    }
    tiles.set(key, c);
    return c;
  }

  // 합성용 임시 캔버스: 32x32, 펫의 16x16 칸이 (8,10)에서 시작한다. 모자와 도구가 삐져나올 여백이다.
  var T = document.createElement('canvas');
  T.width = 32; T.height = 32;
  var tg = T.getContext('2d');
  var OX = 8, OY = 10;

  function petPal(colors, helmet) {
    return {
      o: colors.base, d: colors.shade, l: colors.light, k: PAL.k, w: PAL.w, p: PAL.p, y: PAL.y,
      h: helmet || PAL.y, H: CP.shade(helmet || PAL.y, -0.28), i: CP.shade(helmet || PAL.y, 0.5),
    };
  }

  function part(def, kind, name, ox, oy, pal) {
    var d = def[name];
    if (!d) return;
    var rows = d.rows || d;
    tg.drawImage(tile(kind + ':' + name + (pal ? ':' + pal.o : ''), rows, pal || PAL), ox + (d.x || 0), oy + (d.y || 0));
  }

  // r: { species, colors, helmet, legs, bob, eyes:{dx,dy,mode}, face, sx, sy, pose, acc, blush, sit, lamp }
  function drawPet(ctx, x, footY, r) {
    var sp = SPECIES[r.species] || SPECIES.octopus;
    var pal = petPal(r.colors, r.helmet);
    var key = r.species + ':' + r.colors.base + ':' + (r.helmet || '');
    var ox = OX + (16 - sp.w) / 2, oy = OY + (16 - sp.h);
    var bob = r.bob | 0;
    var sit = r.sit ? 2 : 0;
    var acc = r.acc || {};
    tg.clearRect(0, 0, 32, 32);

    var by = oy + bob + sit;
    if (!sp.small && acc.back) part(BACK, 'back', acc.back, ox, by);
    if (!sit) {
      var legs = sp.legs[(r.legs | 0) % sp.legs.length];
      tg.drawImage(tile(key + ':legs' + ((r.legs | 0) % sp.legs.length), legs, pal), ox, oy + sp.legRow);
    }
    tg.drawImage(tile(key + ':body', sp.body, pal), ox, by);

    // 눈
    var e = r.eyes || {};
    var mode = e.mode || 'open';
    var dx = CP.clamp(e.dx | 0, -1, 1), dy = CP.clamp(e.dy | 0, -1, 1);
    tg.fillStyle = PAL.k;
    for (var i = 0; i < 2; i++) {
      var ex = ox + sp.eyes[i] + dx, ey = by + sp.eyeY + dy;
      if (mode === 'open') tg.fillRect(ex, ey, 1, 2);
      else if (mode === 'blink') tg.fillRect(ex, ey + 1, 1, 1);
      else if (mode === 'closed') tg.fillRect(ex - (i ? 0 : 1), ey + 1, 2, 1);
      else if (mode === 'happy') { tg.fillRect(ex - 1, ey + 1, 1, 1); tg.fillRect(ex, ey, 1, 1); tg.fillRect(ex + 1, ey + 1, 1, 1); }
      else if (mode === 'wide') { tg.fillRect(ex - (i ? 0 : 1), ey, 2, 2); tg.fillStyle = PAL.w; tg.fillRect(ex - (i ? 0 : 1), ey, 1, 1); tg.fillStyle = PAL.k; }
    }
    if (r.blush && !sp.small) {
      tg.fillStyle = PAL.p;
      tg.fillRect(ox + 3, by + 9, 2, 1);
      tg.fillRect(ox + 11, by + 9, 2, 1);
    }
    if (r.sweat) { tg.fillStyle = PAL.a; tg.fillRect(ox + sp.w - 3, by + (sp.small ? 3 : 4), 1, 2); }

    if (!sp.small) {
      if (acc.neck) part(NECK, 'neck', acc.neck, ox, by);
      if (acc.face) part(FACE, 'face', acc.face, ox, by);
      if (acc.head && HATS[acc.head]) {
        var hat = tile('hat:' + acc.head, HATS[acc.head], PAL);
        tg.drawImage(hat, ox + sp.cx - Math.floor(hat.width / 2), by + sp.hatY - hat.height + 1);
      } else if (sp.helmet && r.helmet !== null) {
        tg.drawImage(tile('helmet:' + (r.helmet || PAL.y), HELMET, pal), ox, by);
        if (acc.crown) part(OVER, 'over', 'crown', ox, by);
      } else if (!sp.helmet && r.helmet) {
        // 로봇과 구름은 머리 가운데에 작은 안전모를 쓴다
        tg.drawImage(tile('cap:' + r.helmet, ['..hhhh..', '.hhihhh.', 'HHHHHHHH'], pal), ox + 4, by + 2);
      }
      if (acc.muffs) part(OVER, 'over', 'muffs', ox, by);
      if (acc.held && !r.pose) part(HELD, 'held', acc.held, ox, by);
    }
    if (r.pose && TOOLS[r.pose]) {
      var needsSkin = r.pose === 'handup' || r.pose === 'wave0' || r.pose === 'wave1';
      var px = sp.small ? -3 : 0, py = sp.small ? -2 : 0;
      part(TOOLS, 'tool', r.pose, ox + px, by + py, needsSkin ? pal : null);
    }
    if (r.lamp) { tg.fillStyle = '#fff6c9'; tg.fillRect(ox + sp.cx + 2, by + (sp.small ? 1 : 2), 2, 1); }

    var sx = r.sx || 1, sy = r.sy || 1;
    var dw = Math.round(32 * sx), dh = Math.round(32 * sy);
    var feet = OY + 16;
    var px0 = Math.round(x), py0 = Math.round(footY);
    ctx.save();
    ctx.translate(px0, py0);
    if (r.face < 0) ctx.scale(-1, 1);
    if (r.rot) ctx.rotate(r.rot);
    ctx.drawImage(T, 0, 0, 32, 32, -Math.round(dw / 2), -Math.round(feet * sy), dw, dh);
    ctx.restore();
  }

  function addSkin(name, def) {
    if (!def || !Array.isArray(def.body) || !def.body.length || typeof def.body[0] !== 'string' || !Array.isArray(def.legs) || !def.legs.length || !Array.isArray(def.legs[0])) return false;
    var w = def.body[0].length;
    SPECIES[name] = {
      w: w, h: def.body.length + def.legs[0].length, legRow: def.body.length, cx: Math.floor(w / 2),
      hatY: typeof def.hatY === 'number' ? def.hatY : 5, helmet: !!def.helmet,
      eyes: Array.isArray(def.eyes) ? def.eyes : [5, 10], eyeY: typeof def.eyeY === 'number' ? def.eyeY : 7,
      body: def.body, legs: def.legs,
    };
    return true;
  }

  CP.sprites = {
    PAL: PAL, SPECIES: SPECIES, HATS: HATS, TOOLS: TOOLS,
    tile: tile, drawPet: drawPet, addSkin: addSkin,
    stamp: function (ctx, key, rows, x, y, pal) { ctx.drawImage(tile(key, rows, pal || PAL), Math.round(x), Math.round(y)); },
  };
})();
