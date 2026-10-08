// 실행: claude plugin test plugins/construction-pets-button
import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'construction-pets-button',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false },
} as const

test('버튼을 누르면 서버에 뷰어를 열어 달라고만 부탁한다', async ($, on) => {
  const calls: string[] = []
  const toasts: string[] = []
  on('http.fetch', async (_$, e) => {
    calls.push(`${e.init?.method ?? 'GET'} ${e.url}`)

    return { value: { status: 200, ok: true, headers: {}, text: '{"lang":"ko"}' } }
  })
  on('ui.toast', async (_$, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ key: 'open-site' })).toBeDefined()
    await ui.press({ key: 'open-site' })
    await ui.unmount()
  }

  expect(calls).toEqual(['POST http://127.0.0.1:47821/open', 'POST http://127.0.0.1:47821/open'])
  expect(toasts.length).toBe(2)
  expect(toasts[0]).toContain('뷰어를 열었어요')
})

test('서버가 꺼져 있으면 안내만 하고 끝낸다', async ($, on) => {
  const toasts: string[] = []
  on('http.fetch', async () => {
    throw new Error('connect ECONNREFUSED 127.0.0.1:47821')
  })
  on('ui.toast', async (_$, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'open-site' })
  await ui.unmount()

  // 서버에 닿지 못하면 앞에서 알아 둔 언어(없으면 PC 언어)로 안내한다
  expect([
    '공사현장 서버가 꺼져 있어요. 새 세션을 시작하면 다시 켜져요.',
    'The construction site server is off. Start a new session to turn it back on.',
  ]).toContain(toasts[0])
  expect(toasts.length).toBe(1)
})

test('서버가 영어라고 알려 주면 영어로 안내한다', async ($, on) => {
  const toasts: string[] = []
  on('http.fetch', async () => ({ value: { status: 200, ok: true, headers: {}, text: '{"lang":"en"}' } }))
  on('ui.toast', async (_$, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'open-site' })
  await ui.unmount()

  expect(toasts).toEqual(['Opened the construction site viewer: http://127.0.0.1:47821'])
})

test('설문이 띠를 쓰는 동안에는 자리를 비켜 준다', async ($, on) => {
  let drewBeneath = false
  on('ui.render', { component: 'AbovePrompt' }, async (_$, e) => {
    drewBeneath = true
    const { Text } = _$.ui.resolve(e)

    return <Text key="survey">설문</Text>
  })

  const ui = await $.ui.mount({ ...BAND, props: { hasSurvey: true, isWorking: false }, surface: 'terminal' })
  expect(await ui.find({ key: 'open-site' })).toBeUndefined()
  expect(drewBeneath).toBe(true)
  await ui.unmount()
})
