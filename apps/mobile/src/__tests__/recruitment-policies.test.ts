import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { POLICIES, POLICY_LAST_UPDATED } from '../content/policies'

// Content regression checks, not a legal-compliance certification.
describe('recruitment privacy and deletion copy', () => {
  const website = readFileSync(resolve(__dirname, '../../../web/src/legal.html'), 'utf8')
  const deletionPage = readFileSync(resolve(__dirname, '../../../web/src/account-deletion.html'), 'utf8')

  it('keeps the app and website deletion commitment at 30 days', () => {
    expect(POLICY_LAST_UPDATED).toBe('2026-11-14')
    expect(JSON.stringify(POLICIES.en.privacy)).toContain('delete or anonymise personal data within 30 days')
    expect(JSON.stringify(POLICIES.de.privacy)).toContain('personenbezogene Daten innerhalb von 30 Tagen')
    expect(website).toContain('delete or anonymise personal data within <strong>30 days</strong>')
    expect(website).toContain('innerhalb von <strong>30 Tagen</strong>')
    expect(deletionPage).toContain('delete or anonymise personal data within 30 days')
  })

  it('explains storage retries and provides an account-deletion route in both app languages', () => {
    expect(JSON.stringify(POLICIES.en.privacy)).toContain('failed storage deletions are retried')
    expect(JSON.stringify(POLICIES.de.privacy)).toContain('Speicherlöschungen werden erneut versucht')
    for (const language of ['de', 'en'] as const) {
      expect(JSON.stringify(POLICIES[language].privacy)).toContain('https://anstoss.io/account-deletion')
    }
    expect(website).toContain('account-deletion.html')
    expect(deletionPage).toContain('mailto:privacy@anstoss.io')
    expect(deletionPage).toContain('You do not need club approval or a paid plan')
  })
})
