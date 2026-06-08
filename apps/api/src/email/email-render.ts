/**
 * Branded, responsive transactional-email renderer for Anstoss.
 *
 * Produces a clean single-column, club-white-label layout that mirrors the
 * mobile design system (DESIGN.md): DM Sans body / monospace for data values,
 * Renuir-derived neutrals, the club's runtime `primary` for the one accent +
 * CTA, generous white space, and a single clear hierarchy (badge → heading →
 * intro → data panel → one CTA → footnote → footer).
 *
 * Every email is rendered as BOTH `html` and a plain-text fallback so it stays
 * legible in text-only clients and improves deliverability.
 */

// ── Neutral tokens (mirror apps/mobile/src/theme/colors.ts light theme) ──────
const COLOR = {
  page: '#F3F3F3', // surfaceSunken — email canvas
  surface: '#FFFFFF',
  panel: '#F6F7F9', // data panel fill (between sunken and subtle)
  textPrimary: '#1A1C22',
  textSecondary: '#5F626C',
  textTertiary: '#9CA3AF',
  borderSubtle: '#F3F4F6',
  borderDefault: '#E6E7F2',
} as const

const DEFAULT_PRIMARY = '#1A1A18' // matches Club.primaryColor default

// System-font stacks — email clients largely strip web fonts, so we degrade to
// the closest native faces (DM Sans → humanist sans; Geist Mono → mono).
const FONT_BODY =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'DM Sans',Helvetica,Arial,sans-serif"
const FONT_MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,'Geist Mono',monospace"

export interface EmailMetaRow {
  label: string
  value: string
  /** Render the value in the monospace (data) face — amounts, dates, codes. */
  mono?: boolean
}

export interface EmailLayoutInput {
  /** Club display name — shown as the wordmark and in the footer. */
  clubName: string
  /** Club white-label accent (hex). Falls back to the brand neutral. */
  primaryColor?: string | null
  /** Club badge image URL (square). Falls back to a text wordmark. */
  badgeUrl?: string | null
  /** Inbox preview line — kept short, never shown in the body. */
  preheader: string
  heading: string
  /** One or more short body paragraphs. */
  intro: string[]
  /** Optional key/value data panel. */
  meta?: EmailMetaRow[]
  /** Optional single primary call-to-action. */
  cta?: { label: string; url: string }
  /** Optional muted note under the CTA (validity, "already paid", etc.). */
  footnote?: string
  /** Muted closing line, e.g. "{club} · Anstoss". */
  footer: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Normalize a hex color to #RRGGBB, or fall back to the brand neutral. */
function normalizeHex(input?: string | null): string {
  const raw = (input || '').trim()
  const m = /^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.exec(raw)
  if (!m) return DEFAULT_PRIMARY
  let hex = m[1]
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('')
  return `#${hex.toLowerCase()}`
}

/** Pick black or white text for legibility on a given background (WCAG luminance). */
function readableTextColor(bgHex: string): string {
  const hex = normalizeHex(bgHex).slice(1)
  const channel = (h: string) => {
    const v = parseInt(h, 16) / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  const lum =
    0.2126 * channel(hex.slice(0, 2)) +
    0.7152 * channel(hex.slice(2, 4)) +
    0.0722 * channel(hex.slice(4, 6))
  // Contrast vs white vs black; choose the higher-contrast text color.
  const contrastWhite = 1.05 / (lum + 0.05)
  const contrastBlack = (lum + 0.05) / 0.05
  return contrastWhite >= contrastBlack ? '#FFFFFF' : COLOR.textPrimary
}

function renderHtml(input: EmailLayoutInput): string {
  const primary = normalizeHex(input.primaryColor)
  const onPrimary = readableTextColor(primary)
  const club = escapeHtml(input.clubName)

  const badge = input.badgeUrl
    ? `<img src="${escapeHtml(input.badgeUrl)}" width="48" height="48" alt="${club}" style="display:block;border-radius:12px;border:1px solid ${COLOR.borderDefault};" />`
    : `<div style="width:48px;height:48px;border-radius:12px;background:${primary};color:${onPrimary};font:700 20px/48px ${FONT_BODY};text-align:center;">${club.charAt(0).toUpperCase()}</div>`

  const intro = input.intro
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font:400 15px/1.6 ${FONT_BODY};color:${COLOR.textSecondary};">${escapeHtml(
          p,
        )}</p>`,
    )
    .join('')

  const meta =
    input.meta && input.meta.length
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;background:${COLOR.panel};border-radius:12px;">
          <tr><td style="padding:16px 18px;">
            ${input.meta
              .map(
                (row, i) =>
                  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
                    <td style="padding:${i === 0 ? '0' : '10px'} 0 0;font:600 11px/1.4 ${FONT_BODY};letter-spacing:0.06em;text-transform:uppercase;color:${COLOR.textTertiary};">${escapeHtml(
                      row.label,
                    )}</td>
                  </tr><tr>
                    <td style="padding:2px 0 0;font:${
                      row.mono ? `500 15px/1.5 ${FONT_MONO}` : `500 15px/1.5 ${FONT_BODY}`
                    };color:${COLOR.textPrimary};">${escapeHtml(row.value)}</td>
                  </tr></table>`,
              )
              .join('')}
          </td></tr>
        </table>`
      : ''

  const cta = input.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 6px;"><tr>
        <td style="border-radius:12px;background:${primary};">
          <a href="${escapeHtml(input.cta.url)}" style="display:inline-block;padding:14px 28px;font:700 15px/1 ${FONT_BODY};color:${onPrimary};text-decoration:none;border-radius:12px;">${escapeHtml(
            input.cta.label,
          )}</a>
        </td></tr></table>
        <p style="margin:6px 0 0;font:400 12px/1.5 ${FONT_BODY};color:${COLOR.textTertiary};word-break:break-all;">${escapeHtml(
          input.cta.url,
        )}</p>`
    : ''

  const footnote = input.footnote
    ? `<p style="margin:18px 0 0;font:400 13px/1.55 ${FONT_BODY};color:${COLOR.textTertiary};">${escapeHtml(
        input.footnote,
      )}</p>`
    : ''

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<title>${club}</title>
</head>
<body style="margin:0;padding:0;background:${COLOR.page};">
<span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;mso-hide:all;">${escapeHtml(
    input.preheader,
  )}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLOR.page};">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px;max-width:100%;background:${COLOR.surface};border:1px solid ${COLOR.borderDefault};border-radius:16px;">
      <tr><td style="padding:32px 32px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td valign="middle" style="padding-right:12px;">${badge}</td>
          <td valign="middle" style="font:600 13px/1.2 ${FONT_BODY};letter-spacing:0.04em;text-transform:uppercase;color:${COLOR.textSecondary};">${club}</td>
        </tr></table>
        <h1 style="margin:24px 0 12px;font:700 22px/1.3 ${FONT_BODY};color:${COLOR.textPrimary};">${escapeHtml(
          input.heading,
        )}</h1>
        ${intro}
        ${meta}
        ${cta}
        ${footnote}
        <div style="margin:28px 0 0;border-top:1px solid ${COLOR.borderSubtle};"></div>
        <p style="margin:16px 0 0;font:400 12px/1.5 ${FONT_BODY};color:${COLOR.textTertiary};">${escapeHtml(
          input.footer,
        )}</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`
}

function renderText(input: EmailLayoutInput): string {
  const lines: string[] = [input.clubName.toUpperCase(), '', input.heading, '']
  for (const p of input.intro) lines.push(p)
  if (input.meta?.length) {
    lines.push('')
    for (const row of input.meta) lines.push(`${row.label}: ${row.value}`)
  }
  if (input.cta) {
    lines.push('', `${input.cta.label}:`, input.cta.url)
  }
  if (input.footnote) lines.push('', input.footnote)
  lines.push('', '—', input.footer)
  return lines.join('\n')
}

export function renderEmail(input: EmailLayoutInput): { html: string; text: string } {
  return { html: renderHtml(input), text: renderText(input) }
}
