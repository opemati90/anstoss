import { reviewLoginCodeFor } from './otp.service'

describe('reviewLoginCodeFor (store review accounts)', () => {
  const env = { ...process.env }
  afterEach(() => {
    process.env = { ...env }
  })

  it('is off unless both the email list and a 6-digit code are set', () => {
    delete process.env.REVIEW_LOGIN_EMAILS
    process.env.REVIEW_LOGIN_CODE = '246810'
    expect(reviewLoginCodeFor('review@anstoss.io')).toBeNull()
    process.env.REVIEW_LOGIN_EMAILS = 'review@anstoss.io'
    process.env.REVIEW_LOGIN_CODE = '12345'
    expect(reviewLoginCodeFor('review@anstoss.io')).toBeNull()
  })

  it('returns the code only for listed emails, case-insensitively', () => {
    process.env.REVIEW_LOGIN_EMAILS = ' Review@Anstoss.io , apple-review@anstoss.io'
    process.env.REVIEW_LOGIN_CODE = '246810'
    expect(reviewLoginCodeFor('review@anstoss.io')).toBe('246810')
    expect(reviewLoginCodeFor('APPLE-REVIEW@anstoss.io ')).toBe('246810')
    expect(reviewLoginCodeFor('someone@anstoss.io')).toBeNull()
    expect(reviewLoginCodeFor('review@anstoss.io.evil.com')).toBeNull()
  })
})
