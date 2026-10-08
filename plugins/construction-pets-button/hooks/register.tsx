// '공사현장 보기' 버튼 mod. 하는 일은 두 가지뿐이다.
//   1) 프롬프트 위 띠에 버튼을 그린다.  2) 같은 일을 하는 /construction-site 명령을 등록한다.
// 둘 다 로컬 서버에 "뷰어 창을 열어 달라"고만 부탁한다. 모델 턴이 생기지 않아 토큰을 쓰지 않는다.
// 툴 호출·프롬프트 같은 이벤트에는 손대지 않는다. 이 mod를 꺼도 뷰어와 '공사현장' 입력은 그대로 동작한다.
import type { EngineInterface, Register } from 'claude-code'

const VIEWER = 'http://127.0.0.1:47821'

type Lang = 'ko' | 'en'

const TEXT = {
  ko: {
    button: '공사현장 보기',
    opened: `공사현장 뷰어를 열었어요: ${VIEWER}`,
    down: '공사현장 서버가 꺼져 있어요. 새 세션을 시작하면 다시 켜져요.',
  },
  en: {
    button: 'Construction site',
    opened: `Opened the construction site viewer: ${VIEWER}`,
    down: 'The construction site server is off. Start a new session to turn it back on.',
  },
} as const

// 서버가 알려 주기 전에는 PC의 언어를 따른다. 서버에 닿으면 뷰어 설정의 언어로 바뀐다.
function systemLang(): Lang {
  try {
    return /^ko/i.test(Intl.DateTimeFormat().resolvedOptions().locale) ? 'ko' : 'en'
  } catch {
    return 'en'
  }
}

let lang: Lang = systemLang()

function readLang(text: unknown): void {
  try {
    const value = JSON.parse(typeof text === 'string' ? text : '{}').lang

    if (value === 'ko' || value === 'en') {
      lang = value
    }
  } catch {
    // 본문이 JSON이 아니면 언어는 그대로 둔다.
  }
}

async function openViewer($: EngineInterface): Promise<string> {
  try {
    const res = await $.http.fetch(`${VIEWER}/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })

    if (res.ok) {
      readLang(res.text)

      return TEXT[lang].opened
    }
  } catch {
    // 서버가 꺼져 있으면 아래 안내로 넘어간다.
  }

  return TEXT[lang].down
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'construction-site',
      description: '공사현장 펫 뷰어 열기 · Open the construction site pet viewer',
      immediate: true,
    })

    try {
      const res = await $.http.fetch(`${VIEWER}/health`, { method: 'GET' })

      if (res.ok) {
        readLang(res.text)
      }
    } catch {
      // 서버가 아직 안 떴으면 PC 언어로 둔다.
    }

    return next(e)
  })

  on('command.run', { command: 'construction-site' }, async $ => ({ text: await openViewer($) }))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const { Box, Button } = $.ui.resolve(e)

    return (
      <Box>
        <Button
          key="open-site"
          label={TEXT[lang].button}
          onPress={async () => {
            $.ui.toast(await openViewer($))
          }}
        />
      </Box>
    )
  })
}
