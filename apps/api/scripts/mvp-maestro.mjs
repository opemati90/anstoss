/** Runs native QA with fictional local accounts; never prints session/OTP data. */
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const [statePath, flow, role = 'player', language = 'de'] = process.argv.slice(2)
const state = JSON.parse(readFileSync(statePath, 'utf8'))
assert.equal(state.apiUrl, 'http://127.0.0.1:3167')
assert.ok(state.emails[role]?.endsWith('@anstoss-simulator.invalid'))
assert.match(flow, /^connected-[a-z-]+\.yaml$/)
const journalPath = join(dirname(statePath), 'journeys.json')
const journal = existsSync(journalPath) ? JSON.parse(readFileSync(journalPath, 'utf8')) : {}
const env = {
  QA_EMAIL: state.emails[role], QA_OTP: state.otpCode, QA_LANGUAGE: language,
  QA_EVENT_ID: journal.eventId ?? '', QA_CLUB_ID: state.clubId, QA_TEAM_ID: state.teamId,
  QA_TRIAL_ID: journal.trialId ?? '',
  QA_PLAYER_ID: state.users.player,
}
const result = spawnSync('/Users/yemi/.maestro/bin/maestro', [
  '--device', 'A9118726-BCB5-44F5-A18F-6C1E5BF97097', 'test',
  '--test-output-dir', join(dirname(statePath), 'maestro', flow.replace('.yaml', '')),
  ...Object.entries(env).flatMap(([key, value]) => ['-e', `${key}=${value}`]),
  resolve('apps/mobile/.maestro', flow),
], { stdio: 'inherit', env: process.env })
process.exitCode = result.status ?? 1
