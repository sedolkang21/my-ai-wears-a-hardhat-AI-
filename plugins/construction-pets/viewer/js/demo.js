// 가짜 이벤트 각본. 서버 없이 여는 데모와 scripts/fake-events.js가 같은 각본을 쓴다.
// 실제 Claude Code 없이 화면을 검증하는 용도이고, GPT 펫(로봇)과 기타 AI 펫(구름)은 여기서만 등장한다.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.CP = root.CP || {}).demo = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SITE = 'pet-cafe-app';
  var TEXT = {
    ko: {
      title: '펫 카페 예약', fail: '예약에 실패했어요', intro: '강아지와 고양이가 쉬어 가는 카페의 예약 화면입니다.', run: '실행',
      flow: '예약 흐름', steps: ['시간표에서 빈 시간을 고른다.', '펫 이름을 적는다.', '예약하기를 누른다.'], test: '예약 제목이 보인다',
      prompt1: '펫 카페 예약 화면을 만들어줘', prompt2: 'README와 테스트를 보강해줘', search: 'date picker 접근성',
      tasks: ['예약 폼 만들기', '시간표 컴포넌트 만들기', '예약 API 연결', '스타일 다듬기', '테스트 통과시키기'],
    },
    en: {
      title: 'Pet Cafe Booking', fail: 'Booking failed', intro: 'The booking screen for a cafe where dogs and cats take a break.', run: 'Run',
      flow: 'Booking flow', steps: ['Pick a free slot in the timetable.', "Enter the pet's name.", 'Press Book.'], test: 'shows the booking title',
      prompt1: 'Build the pet cafe booking screen', prompt2: 'Improve the README and the tests', search: 'date picker accessibility',
      tasks: ['Build the booking form', 'Build the timetable component', 'Connect the booking API', 'Polish the styles', 'Make the tests pass'],
    },
  };

  function files(lang) {
    var T = TEXT[lang === 'en' ? 'en' : 'ko'];
    return {
      'src/App.tsx': [
        "import { BookingForm } from './components/BookingForm'",
        "import { TimeTable } from './components/TimeTable'",
        '',
        'export function App() {',
        '  return (',
        '    <main className="cafe">',
        '      <h1>' + T.title + '</h1>',
        '      <TimeTable />',
        '      <BookingForm />',
        '    </main>',
        '  )',
        '}',
      ],
      'src/components/BookingForm.tsx': [
        'export function BookingForm() {',
        "  const [pet, setPet] = useState('')",
        '  const [slot, setSlot] = useState<Slot | null>(null)',
        '',
        '  async function submit(e: FormEvent) {',
        '    e.preventDefault()',
        '    if (!slot) return',
        '    await reserve({ pet, slot })',
        '  }',
        '',
        '  return <form onSubmit={submit}>…</form>',
        '}',
      ],
      'src/components/TimeTable.tsx': [
        'const HOURS = [10, 11, 13, 14, 15, 16]',
        '',
        'export function TimeTable() {',
        '  const { slots } = useSlots()',
        '  return (',
        '    <ul className="timetable">',
        '      {HOURS.map((h) => (',
        '        <SlotRow key={h} hour={h} taken={slots[h]} />',
        '      ))}',
        '    </ul>',
        '  )',
        '}',
      ],
      'src/api/reservations.ts': [
        'export async function reserve(body: Booking) {',
        "  const res = await fetch('/api/reservations', {",
        "    method: 'POST',",
        "    headers: { 'Content-Type': 'application/json' },",
        '    body: JSON.stringify(body),',
        '  })',
        "  if (!res.ok) throw new Error('" + T.fail + "')",
        '  return res.json()',
        '}',
      ],
      'src/styles/booking.css': [
        '.cafe { max-width: 40rem; margin: 0 auto; }',
        '.timetable { display: grid; gap: .5rem; }',
        '.slot[aria-pressed="true"] {',
        '  background: var(--paw);',
        '  color: var(--cream);',
        '}',
        '.slot:disabled { opacity: .4; }',
      ],
      'README.md': ['# ' + T.title, '', T.intro, '', '## ' + T.run, '', '    npm install', '    npm run dev'],
      'docs/guide.md': ['# ' + T.flow, '', '1. ' + T.steps[0], '2. ' + T.steps[1], '3. ' + T.steps[2]],
      'src/App.test.tsx': [
        "import { render, screen } from '@testing-library/react'",
        "import { App } from './App'",
        '',
        "test('" + T.test + "', () => {",
        '  render(<App />)',
        "  expect(screen.getByText('" + T.title + "')).toBeVisible()",
        '})',
      ],
    };
  }
  var FILES = files('ko');

  function script(lang) {
    var out = [], T = TEXT[lang === 'en' ? 'en' : 'ko'], F = files(lang);
    var C = 'demo-claude', G = 'demo-gpt', O = 'demo-other';
    function at(wait, ev) { ev.site = SITE; if (!ev.ai) ev.ai = ev.session === G ? 'gpt' : ev.session === O ? 'other' : 'claude'; out.push({ wait: wait, ev: ev }); }
    function pre(wait, s, tool, kind, extra) { var e = { type: 'tool_pre', session: s, tool: tool, kind: kind }; for (var k in extra || {}) e[k] = extra[k]; at(wait, e); }
    function edit(wait, s, file, lines, gain, isNew, agent) {
      var p = { file: file }; if (agent) p.agent = agent;
      pre(wait, s, isNew ? 'Write' : 'Edit', 'edit', p);
      var e = { type: 'tool_post', session: s, tool: isNew ? 'Write' : 'Edit', kind: 'edit', file: file, lines: lines, gain: gain, isNew: !!isNew, snippet: (F[file] || []).slice(0, 6) };
      if (agent) e.agent = agent;
      at(0.9, e);
    }
    var tasks = T.tasks;

    // 1막: Claude 펫이 서브에이전트 둘과 예약 화면을 짓는다
    at(0.6, { type: 'session_start', session: C });
    at(2.2, { type: 'prompt', session: C, text: T.prompt1 });
    tasks.forEach(function (t, i) { at(i ? 0.25 : 1.2, { type: 'task_created', session: C, id: 't' + i, subject: t }); });
    pre(0.9, C, 'Read', 'read', { file: 'package.json' });
    pre(1.4, C, 'Grep', 'read', { detail: 'reservation' });
    edit(1.5, C, 'src/App.tsx', 48, 2, true);
    edit(1.6, C, 'src/components/BookingForm.tsx', 132, 4, true);
    at(1.6, { type: 'task_completed', session: C, id: 't0' });
    at(0.8, { type: 'agent_start', session: C, agent: 'a1', agentType: 'Explore' });
    pre(0.9, C, 'Grep', 'read', { agent: 'a1', detail: 'timeSlots' });
    edit(1.3, C, 'src/components/TimeTable.tsx', 86, 3, true);
    at(1.0, { type: 'agent_start', session: C, agent: 'a2', agentType: 'general-purpose' });
    edit(1.1, C, 'src/api/reservations.ts', 64, 3, true, 'a2');
    pre(1.2, C, 'WebSearch', 'web', { detail: T.search });
    at(1.8, { type: 'task_completed', session: C, id: 't1' });
    pre(1.0, C, 'Edit', 'edit', { file: 'src/components/TimeTable.tsx' });
    at(0.9, { type: 'tool_fail', session: C, tool: 'Edit', kind: 'edit', file: 'src/components/TimeTable.tsx' });
    edit(2.2, C, 'src/components/TimeTable.tsx', 92, 1, false);
    at(1.2, { type: 'agent_stop', session: C, agent: 'a1' });
    at(1.6, { type: 'permission', session: C, tool: 'Bash' });
    pre(3.0, C, 'Bash', 'bash', { detail: 'npm test' });
    at(2.2, { type: 'task_completed', session: C, id: 't2' });
    edit(1.0, C, 'src/styles/booking.css', 210, 4, true);
    edit(1.4, C, 'src/api/reservations.ts', 71, 1, false, 'a2');
    at(1.4, { type: 'agent_stop', session: C, agent: 'a2' });
    at(1.2, { type: 'task_completed', session: C, id: 't3' });
    pre(1.2, C, 'Bash', 'bash', { detail: 'npm test' });
    at(2.4, { type: 'task_completed', session: C, id: 't4' });
    at(1.2, { type: 'stop', session: C });
    at(5.0, { type: 'idle', session: C });

    // 2막: 다른 AI 펫들이 합류한다(가짜 이벤트로만)
    at(3.0, { type: 'prompt', session: C, text: T.prompt2 });
    at(1.0, { type: 'session_start', session: G });
    at(1.4, { type: 'session_start', session: O });
    pre(1.6, G, 'Read', 'read', { file: 'src/App.tsx' });
    edit(1.0, G, 'README.md', 60, 2, true);
    pre(0.8, O, 'Glob', 'read', { detail: 'docs/**' });
    edit(1.2, C, 'src/App.test.tsx', 150, 3, true);
    edit(1.4, O, 'docs/guide.md', 30, 2, true);
    at(1.4, { type: 'compact', session: C, phase: 'pre' });
    at(3.2, { type: 'compact', session: C, phase: 'post' });
    at(0.4, { type: 'tool_fail', session: G, tool: 'Bash', kind: 'bash' });
    edit(1.8, G, 'README.md', 74, 2, false);
    edit(1.2, C, 'src/App.test.tsx', 168, 1, false);
    pre(1.2, C, 'Bash', 'bash', { detail: 'npm test' });
    at(2.4, { type: 'stop', session: G });
    at(0.3, { type: 'stop', session: O });
    at(0.3, { type: 'stop', session: C });
    at(5.5, { type: 'session_end', session: G });
    at(0.8, { type: 'session_end', session: O });
    at(3.0, { type: 'session_end', session: C });
    at(9.0, { type: '__reset' });
    return out;
  }

  // 브라우저 데모용 재생기. 프레임마다 tick(dt)를 불러 준다.
  // getLang: 지금 화면 언어를 돌려주는 함수(각본이 한 바퀴 돌 때마다 다시 묻는다)
  function player(emit, getLang) {
    var lang = function () { return getLang ? getLang() : 'ko'; };
    var list = script(lang()), i = 0, wait = list[0].wait;
    return {
      tick: function (dt) {
        wait -= dt;
        var guard = 0;
        while (wait <= 0 && guard++ < 20) {
          emit(list[i].ev);
          i = (i + 1) % list.length;
          if (i === 0) list = script(lang());
          wait += list[i].wait;
        }
      },
    };
  }

  return { SITE: SITE, FILES: FILES, files: files, script: script, player: player };
});
