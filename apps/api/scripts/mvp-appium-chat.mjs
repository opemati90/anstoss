/** Local native regression fallback when another Maestro session owns port 7001. */
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const [statePath, sessionId] = process.argv.slice(2)
assert.match(sessionId ?? '', /^[a-f0-9-]{36}$/i)
const state = JSON.parse(readFileSync(statePath, 'utf8'))
assert.equal(state.apiUrl, 'http://127.0.0.1:3167')
const journal = JSON.parse(readFileSync(join(dirname(statePath), 'journeys.json'), 'utf8'))
assert.equal(journal.runId, state.runId)
const base = `http://127.0.0.1:4727/session/${sessionId}`
const elementKey = 'element-6066-11e4-a52e-4f735466cecf'
async function command(path, body) {
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const result = await response.json()
  assert.ok(response.ok && !result.value?.error, `UI command failed: ${path}`)
  return result.value
}
const capabilities = await command('')
assert.equal(capabilities.udid, 'D0946EB8-5569-40EF-A2DC-E1B68B19DAD9')
assert.equal(capabilities.bundleId, 'com.renuirug.anstoss')
async function elements(using, value) {
  return command('/elements', { using, value })
}
async function findId(value) {
  const found = await elements('accessibility id', value)
  assert.ok(found.length, `Missing native element: ${value}`)
  return found[0][elementKey]
}
async function visibleText(text) {
  const predicate = `visible == true AND (label CONTAINS ${JSON.stringify(text)} OR value CONTAINS ${JSON.stringify(text)})`
  return (await elements('-ios predicate string', predicate)).length > 0
}
async function waitFor(check, label) {
  const end = Date.now() + 15000
  do {
    if (await check()) return
    await new Promise((resolve) => setTimeout(resolve, 500))
  } while (Date.now() < end)
  throw new Error(`Native assertion timed out: ${label}`)
}
async function snapshot(name) {
  const image = await command('/screenshot')
  writeFileSync(join(dirname(statePath), `${name}.png`), Buffer.from(image, 'base64'))
}
for (const scenario of [
  { id: journal.shortDmId, kind: 'dm', text: 'Short conversation keyboard check', name: 'short' },
  { id: journal.dmId, kind: 'dm', text: 'Keyboard history 40', name: 'long' },
  { id: journal.channelId, kind: 'channel', text: 'Keyboard group player reply', name: 'group' },
]) {
  assert.ok(scenario.id)
  await command('/execute/sync', {
    script: 'mobile: terminateApp',
    args: [{ bundleId: 'com.renuirug.anstoss' }],
  })
  await command('/execute/sync', {
    script: 'mobile: activateApp',
    args: [{ bundleId: 'com.renuirug.anstoss' }],
  })
  await waitFor(
    async () => (await elements('accessibility id', 'club-header-identity')).length,
    'membership restored after relaunch',
  )
  await command('/execute/sync', {
    script: 'mobile: deepLink',
    args: [
      {
        url: `anstoss://chat/${scenario.id}?kind=${scenario.kind}`,
        bundleId: 'com.renuirug.anstoss',
      },
    ],
  })
  await waitFor(
    async () => (await elements('accessibility id', 'chat-message-input')).length,
    'composer',
  )
  const jump = await elements('accessibility id', 'chat-jump-latest')
  if (jump.length) await command(`/element/${jump[0][elementKey]}/click`, {})
  await waitFor(() => visibleText(scenario.text), `${scenario.name} history before keyboard`)
  await command(`/element/${await findId('chat-message-input')}/click`, {})
  await waitFor(
    async () =>
      (
        await elements(
          '-ios predicate string',
          'type == "XCUIElementTypeKeyboard" AND visible == true',
        )
      ).length,
    'software keyboard visible BEFORE typing',
  )
  await snapshot(`appium-chat-${scenario.name}-keyboard-open`)
  assert.ok(
    await visibleText(scenario.text),
    `${scenario.name} history disappeared on keyboard open`,
  )
  const draft = `Native ${scenario.name} keyboard draft`
  const input = await findId('chat-message-input')
  await command(`/element/${input}/value`, { text: draft })
  assert.ok(await visibleText(draft), 'Draft must be visible')
  assert.ok(await visibleText(scenario.text), 'History must remain visible while typing')
  if (scenario.kind === 'channel') {
    assert.ok(await visibleText('QA coach'), 'Incoming group sender identity must be visible')
  }
  await snapshot(`appium-chat-${scenario.name}-draft`)
  await command(`/element/${input}/value`, { text: '\b'.repeat(draft.length) })
  console.log(`PASS: ${scenario.name} chat history, keyboard-before-typing, visible draft`)
}
