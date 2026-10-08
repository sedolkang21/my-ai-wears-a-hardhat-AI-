'use strict';
// Claude Code 훅이 보낸 원본 JSON을, 뷰어가 쓰는 작은 이벤트로 줄인다.
// 프롬프트와 코드는 화면에 보일 만큼만 남기고 나머지는 버린다.

const path = require('node:path');

const KIND = {
  Read: 'read', Glob: 'read', Grep: 'read', LS: 'read', NotebookRead: 'read', ToolSearch: 'read',
  WebFetch: 'web', WebSearch: 'web',
  Bash: 'bash', PowerShell: 'bash', BashOutput: 'bash', KillShell: 'bash',
  Write: 'edit', Edit: 'edit', MultiEdit: 'edit', NotebookEdit: 'edit',
  Agent: 'delegate', Task: 'delegate',
  TodoWrite: 'plan', TaskCreate: 'plan', TaskUpdate: 'plan', TaskGet: 'plan', TaskList: 'plan',
  ExitPlanMode: 'plan', EnterPlanMode: 'plan', AskUserQuestion: 'plan',
};

const SNIPPET_LINES = 10;
const SNIPPET_COLS = 64;

function kindOf(tool) {
  return KIND[tool] || 'other';
}

function cut(text, n) {
  if (typeof text !== 'string') return '';
  const one = text.replace(/\s+/g, ' ').trim();
  return one.length > n ? one.slice(0, n - 1) + '…' : one;
}

// Windows는 역슬래시로 온다. 구분자를 통일하고 프로젝트 기준 상대 경로로 바꾼다.
function relPath(file, cwd) {
  if (typeof file !== 'string' || !file) return null;
  let f = file.replace(/\\/g, '/');
  const c = typeof cwd === 'string' ? cwd.replace(/\\/g, '/').replace(/\/+$/, '') : '';
  if (c && f.toLowerCase().startsWith(c.toLowerCase() + '/')) f = f.slice(c.length + 1);
  return f;
}

function snippetOf(text) {
  if (typeof text !== 'string' || !text) return [];
  const out = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length && out.length < SNIPPET_LINES; i++) {
    const line = lines[i].replace(/\t/g, '  ');
    if (!line.trim() && !out.length) continue;
    out.push(line.length > SNIPPET_COLS ? line.slice(0, SNIPPET_COLS - 1) + '…' : line);
  }
  while (out.length && !out[out.length - 1].trim()) out.pop();
  return out;
}

function countLines(text) {
  if (typeof text !== 'string' || !text) return 0;
  let n = 0;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  return text.charCodeAt(text.length - 1) === 10 ? n : n + 1;
}

function fileOf(input) {
  if (!input || typeof input !== 'object') return null;
  return input.file_path || input.notebook_path || input.path || null;
}

function detailOf(tool, input) {
  if (!input || typeof input !== 'object') return null;
  if (tool === 'Bash' || tool === 'PowerShell') return cut(input.description || input.command, 48) || null;
  if (tool === 'WebSearch') return cut(input.query, 48) || null;
  if (tool === 'WebFetch') {
    try { return new URL(input.url).hostname; } catch { return null; }
  }
  if (tool === 'Grep' || tool === 'Glob') return cut(input.pattern, 40) || null;
  if (tool === 'Agent' || tool === 'Task') return cut(input.description || input.subagent_type, 40) || null;
  return null;
}

// Edit는 new_string, MultiEdit는 edits[], Write는 content를 준다. 이름이 달라도 버티게 느슨하게 읽는다.
function editInfo(tool, input, response) {
  const info = { snippet: [], added: 0, removed: 0, lines: 0, isNew: false, gain: 1 };
  if (!input || typeof input !== 'object') return info;
  if (typeof input.content === 'string') {
    info.lines = countLines(input.content);
    info.added = info.lines;
    info.snippet = snippetOf(input.content);
    info.gain = Math.max(1, Math.min(4, Math.ceil(info.lines / 30)));
    info.isNew = !!response && response.type === 'create';
    return info;
  }
  const edits = Array.isArray(input.edits) ? input.edits : [input];
  let newest = '';
  for (const e of edits) {
    if (!e || typeof e !== 'object') continue;
    const before = typeof e.old_string === 'string' ? e.old_string : '';
    const after = typeof e.new_string === 'string' ? e.new_string
      : typeof e.new_source === 'string' ? e.new_source : '';
    info.removed += countLines(before);
    info.added += countLines(after);
    if (after.length > newest.length) newest = after;
  }
  info.snippet = snippetOf(newest);
  info.gain = info.added > 30 ? 2 : 1;
  return info;
}

function agentOf(p) {
  return typeof p.agent_id === 'string' && p.agent_id ? p.agent_id : null;
}

// 반환: 정규화된 이벤트 배열(대부분 1개). site 관련 필드는 서버가 채운다.
function normalize(name, p) {
  if (!p || typeof p !== 'object') return [];
  const base = { session: String(p.session_id || 'unknown'), ai: 'claude' };
  const agent = agentOf(p);
  const tool = typeof p.tool_name === 'string' ? p.tool_name : null;
  const input = p.tool_input;
  const cwd = p.cwd;

  switch (name) {
    case 'SessionStart':
      return [{ ...base, type: 'session_start', source: p.source || 'startup' }];

    case 'UserPromptSubmit':
      return [{ ...base, type: 'prompt', text: cut(p.prompt, 60) }];

    case 'PreToolUse': {
      if (!tool) return [];
      const kind = kindOf(tool);
      const out = [{
        ...base, type: 'tool_pre', agent, agentType: p.agent_type || null, tool, kind,
        file: relPath(fileOf(input), cwd), detail: detailOf(tool, input),
      }];
      // 작업 목록을 TodoWrite로 관리하는 버전도 진행률을 알 수 있게 한다.
      if (tool === 'TodoWrite' && input && Array.isArray(input.todos)) {
        out.push({ ...base, type: 'tasks_set', tasks: input.todos.slice(0, 60).map((t) => ({
          subject: cut(t && t.content, 60), done: !!t && t.status === 'completed' })) });
      }
      return out;
    }

    case 'PostToolUse': {
      if (!tool) return [];
      const kind = kindOf(tool);
      const ev = { ...base, type: 'tool_post', agent, agentType: p.agent_type || null, tool, kind,
        file: relPath(fileOf(input), cwd) };
      if (kind === 'edit') Object.assign(ev, editInfo(tool, input, p.tool_response));
      return [ev];
    }

    case 'PostToolUseFailure':
      return [{ ...base, type: 'tool_fail', agent, tool, kind: tool ? kindOf(tool) : 'other',
        file: relPath(fileOf(input), cwd) }];

    case 'SubagentStart':
      if (!agent) return [];
      return [{ ...base, type: 'agent_start', agent, agentType: p.agent_type || null }];

    case 'SubagentStop':
      if (!agent) return [];
      return [{ ...base, type: 'agent_stop', agent }];

    case 'TaskCreated':
      return [{ ...base, type: 'task_created', id: String(p.task_id ?? p.id ?? p.task_subject ?? ''),
        subject: cut(p.task_subject || p.subject, 60) }];

    case 'TaskCompleted':
      return [{ ...base, type: 'task_completed', id: String(p.task_id ?? p.id ?? p.task_subject ?? ''),
        subject: cut(p.task_subject || p.subject, 60) }];

    case 'PermissionRequest':
      return [{ ...base, type: 'permission', agent, tool }];

    case 'Notification':
      if (p.notification_type === 'idle_prompt') return [{ ...base, type: 'idle' }];
      if (p.notification_type === 'permission_prompt') return [{ ...base, type: 'permission', tool: null }];
      return [];

    case 'Stop':
      return [{ ...base, type: 'stop' }];

    case 'StopFailure':
      return [{ ...base, type: 'stop_fail', error: String(p.error || p.error_type || 'unknown') }];

    case 'PreCompact':
      return [{ ...base, type: 'compact', phase: 'pre' }];

    case 'PostCompact':
      return [{ ...base, type: 'compact', phase: 'post' }];

    case 'SessionEnd':
      return [{ ...base, type: 'session_end', reason: p.reason || 'other' }];
  }
  return [];
}

module.exports = { normalize, kindOf, relPath, snippetOf, countLines, cut };
