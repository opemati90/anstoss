/** Sign in an existing isolated QA persona through the native OTP UI. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const [statePath, sessionId, role = 'player'] = process.argv.slice(2)
assert.match(sessionId ?? '', /^[a-f0-9-]{36}$/i)
const state = JSON.parse(readFileSync(statePath, 'utf8'))
assert.equal(state.apiUrl, 'http://127.0.0.1:3167')
assert.ok(['player', 'coach', 'admin', 'agent'].includes(role))
const email = state.emails[role]
assert.ok(email?.endsWith('@anstoss-simulator.invalid'))
assert.match(state.otpCode, /^\d{6}$/)
const base = `http://127.0.0.1:4727/session/${sessionId}`
const elementKey = 'element-6066-11e4-a52e-4f735466cecf'
async function command(path, body) {
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30000),
  })
  const result = await response.json()
  assert.ok(response.ok && !result.value?.error, `Native command failed: ${path}`)
  return result.value
}
const capabilities = await command('')
assert.equal(capabilities.udid, 'D0946EB8-5569-40EF-A2DC-E1B68B19DAD9')
assert.equal(capabilities.bundleId, 'com.renuirug.anstoss')
async function find(id) {
  const end = Date.now() + 20000
  do {
    const matches = await command('/elements', { using: 'accessibility id', value: id })
    if (matches.length) return matches[0][elementKey]
    await new Promise(resolve => setTimeout(resolve, 500))
  } while (Date.now() < end)
  throw new Error(`Missing native element: ${id}`)
}
const existingCode = await command('/elements', { using: 'accessibility id', value: 'sign-in-code' })
if (existingCode.length) {
  // Never reuse an OTP screen for an unchecked address. A prior automation
  // run may have left partially entered text or another persona here.
  await command(`/element/${await find('sign-in-change-email')}/click`, {})
} else {
  await command(`/element/${await find('welcome-sign-in')}/click`, {})
}
const input = await find('sign-in-email-input')
await command(`/element/${input}/click`, {})
await command(`/element/${input}/clear`, {})
await command(`/element/${input}/value`, { text: email })
assert.equal(await command(`/element/${input}/attribute/value`), email,
  'Native email entry did not match the QA persona; do not request a code')
await command(`/element/${await find('sign-in-send')}/click`, {})
await find('sign-in-code')
assert.ok((await command('/source')).includes(`code to ${email}.`),
  'OTP destination must match the QA persona')
// The screen testID is a container, not the hidden TextInput. Use real
// number-pad taps so iOS does not synthesize a replacement value on the view.
await command(`/element/${await find('6-digit code from the email')}/click`, {})
for (const digit of state.otpCode) {
  const keys = await command('/elements', {
    using: '-ios predicate string',
    value: `type == "XCUIElementTypeKey" AND label == "${digit}"`,
  })
  assert.equal(keys.length, 1, 'Expected one native number-pad key')
  await command(`/element/${keys[0][elementKey]}/click`, {})
}
await find('club-header-identity')
console.log(`PASS: existing QA ${role} signed in through native OTP`)
