/**
 * Minimal best-effort transactional email send via Resend.
 *
 * Mirrors the inline sender in invites.service but is dependency-free so any
 * module can dispatch an already-built ({subject, html, text}) email. Returns
 * `false` (never throws) when Resend isn't configured or the call fails, so
 * callers can treat email as non-blocking.
 */
export async function sendEmail(input: {
  to: string
  subject: string
  html: string
  text: string
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL
  if (!apiKey || !from) {
    return false
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    })
    return response.ok
  } catch {
    return false
  }
}
