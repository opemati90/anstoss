/**
 * Localized copy for Anstoss transactional emails.
 *
 * Resolves the recipient's preferred language (de/en/fr/it/pt/tr, the same set
 * the mobile app ships) and assembles the structured {@link EmailLayoutInput}
 * that {@link renderEmail} turns into branded HTML + a plain-text fallback.
 *
 * All recipient-facing prose lives here — nothing is hardcoded at the call
 * site — so adding a locale or tweaking wording never touches business logic.
 */
import { renderEmail } from './email-render'
import { INTL_LOCALE_TAG, resolveLocale, type Locale } from '../i18n/translations'

/**
 * Map an ISO-639-1 language (e.g. User.preferredLanguage) to a supported email
 * locale. Thin alias over the shared {@link resolveLocale} (German fallback).
 */
export const resolveEmailLocale = resolveLocale

const DATE_TAG: Record<Locale, string> = INTL_LOCALE_TAG

export function formatDate(value: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(DATE_TAG[locale], {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Berlin',
  }).format(value)
}

/** Short numeric date for push bodies ("01.07.2026" / "01/07/2026") in the reader's locale. */
export function formatShortDate(value: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(DATE_TAG[locale], {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Berlin',
  }).format(value)
}

export function formatAmount(amountCents: number, currency: string, locale: Locale): string {
  try {
    return new Intl.NumberFormat(DATE_TAG[locale], {
      style: 'currency',
      currency,
    }).format(amountCents / 100)
  } catch {
    return `${(amountCents / 100).toFixed(2)} ${currency}`
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Invite email
// ─────────────────────────────────────────────────────────────────────────────

export interface InviteEmailParams {
  locale: Locale
  clubName: string
  primaryColor?: string | null
  badgeUrl?: string | null
  teamName: string
  link: string
  expiresAt: Date
  kind: 'PARENT_APPROVAL' | 'MEMBER_INVITE'
  phase: 'TRIAL' | 'FULL'
  role: 'PLAYER' | 'COACH' | 'OTHER'
  childName?: string | null
}

interface InviteStrings {
  subjectParent: (p: { child: string; club: string }) => string
  subjectTrial: (p: { team: string; club: string }) => string
  subjectInvite: (p: { team: string; club: string }) => string
  headingParent: string
  headingTrial: string
  headingInvite: string
  introParent: (p: { child: string; team: string; club: string }) => string
  introTrial: (p: { team: string; club: string }) => string
  introInvite: (p: { team: string; club: string }) => string
  metaChild: string
  metaTeam: string
  metaValidUntil: string
  ctaParent: string
  ctaAccept: string
  noteValidity: (p: { date: string }) => string
  noteUnder16: string
  footer: (p: { club: string }) => string
}

const INVITE: Record<Locale, InviteStrings> = {
  de: {
    subjectParent: ({ child, club }) => `Bitte bestätige ${child} bei ${club}`,
    subjectTrial: ({ team, club }) => `Probetraining bei ${team} – ${club}`,
    subjectInvite: ({ team, club }) => `Einladung zu ${team} – ${club}`,
    headingParent: 'Anmeldung bestätigen',
    headingTrial: 'Einladung zum Probetraining',
    headingInvite: 'Du bist eingeladen',
    introParent: ({ child, team, club }) =>
      `${child} möchte dem Team ${team} bei ${club} beitreten. Bitte bestätige die Anmeldung, um das Konto zu aktivieren.`,
    introTrial: ({ team, club }) =>
      `Du wurdest zu einem Probetraining für ${team} bei ${club} eingeladen.`,
    introInvite: ({ team, club }) => `Du wurdest eingeladen, ${team} bei ${club} beizutreten.`,
    metaChild: 'Kind',
    metaTeam: 'Team',
    metaValidUntil: 'Gültig bis',
    ctaParent: 'Anmeldung bestätigen',
    ctaAccept: 'Einladung annehmen',
    noteValidity: ({ date }) => `Diese Einladung ist bis zum ${date} gültig.`,
    noteUnder16:
      'Falls du noch nicht 16 Jahre alt bist, fragen wir im Anschluss die Zustimmung eines Elternteils ab.',
    footer: ({ club }) => `${club} · Anstoss`,
  },
  en: {
    subjectParent: ({ child, club }) => `Please confirm ${child} at ${club}`,
    subjectTrial: ({ team, club }) => `Trial session with ${team} – ${club}`,
    subjectInvite: ({ team, club }) => `Invitation to join ${team} – ${club}`,
    headingParent: 'Confirm registration',
    headingTrial: 'Trial session invitation',
    headingInvite: "You're invited",
    introParent: ({ child, team, club }) =>
      `${child} would like to join ${team} at ${club}. Please confirm the registration to activate the account.`,
    introTrial: ({ team, club }) =>
      `You've been invited to a trial session with ${team} at ${club}.`,
    introInvite: ({ team, club }) => `You've been invited to join ${team} at ${club}.`,
    metaChild: 'Child',
    metaTeam: 'Team',
    metaValidUntil: 'Valid until',
    ctaParent: 'Confirm registration',
    ctaAccept: 'Accept invitation',
    noteValidity: ({ date }) => `This invitation is valid until ${date}.`,
    noteUnder16:
      "If you're under 16, we'll ask for a parent's consent in the next step.",
    footer: ({ club }) => `${club} · Anstoss`,
  },
  fr: {
    subjectParent: ({ child, club }) => `Confirme l’inscription de ${child} à ${club}`,
    subjectTrial: ({ team, club }) => `Entraînement d’essai avec ${team} – ${club}`,
    subjectInvite: ({ team, club }) => `Invitation à rejoindre ${team} – ${club}`,
    headingParent: 'Confirmer l’inscription',
    headingTrial: 'Invitation à un entraînement d’essai',
    headingInvite: 'Tu es invité',
    introParent: ({ child, team, club }) =>
      `${child} souhaite rejoindre ${team} à ${club}. Confirme l’inscription pour activer le compte.`,
    introTrial: ({ team, club }) =>
      `Tu es invité à un entraînement d’essai avec ${team} à ${club}.`,
    introInvite: ({ team, club }) => `Tu es invité à rejoindre ${team} à ${club}.`,
    metaChild: 'Enfant',
    metaTeam: 'Équipe',
    metaValidUntil: 'Valable jusqu’au',
    ctaParent: 'Confirmer l’inscription',
    ctaAccept: 'Accepter l’invitation',
    noteValidity: ({ date }) => `Cette invitation est valable jusqu’au ${date}.`,
    noteUnder16:
      'Si tu as moins de 16 ans, nous demanderons ensuite l’accord d’un parent.',
    footer: ({ club }) => `${club} · Anstoss`,
  },
  it: {
    subjectParent: ({ child, club }) => `Conferma ${child} presso ${club}`,
    subjectTrial: ({ team, club }) => `Allenamento di prova con ${team} – ${club}`,
    subjectInvite: ({ team, club }) => `Invito a unirti a ${team} – ${club}`,
    headingParent: "Conferma l'iscrizione",
    headingTrial: 'Invito a un allenamento di prova',
    headingInvite: 'Sei invitato',
    introParent: ({ child, team, club }) =>
      `${child} desidera unirsi a ${team} presso ${club}. Conferma l'iscrizione per attivare l'account.`,
    introTrial: ({ team, club }) =>
      `Sei stato invitato a un allenamento di prova con ${team} presso ${club}.`,
    introInvite: ({ team, club }) => `Sei stato invitato a unirti a ${team} presso ${club}.`,
    metaChild: 'Figlio/a',
    metaTeam: 'Squadra',
    metaValidUntil: 'Valido fino al',
    ctaParent: "Conferma l'iscrizione",
    ctaAccept: "Accetta l'invito",
    noteValidity: ({ date }) => `Questo invito è valido fino al ${date}.`,
    noteUnder16:
      "Se hai meno di 16 anni, nel passaggio successivo chiederemo il consenso di un genitore.",
    footer: ({ club }) => `${club} · Anstoss`,
  },
  pt: {
    subjectParent: ({ child, club }) => `Confirma a inscrição de ${child} no ${club}`,
    subjectTrial: ({ team, club }) => `Treino de captação com ${team} – ${club}`,
    subjectInvite: ({ team, club }) => `Convite para ${team} – ${club}`,
    headingParent: 'Confirmar inscrição',
    headingTrial: 'Convite para treino de captação',
    headingInvite: 'Foste convidado',
    introParent: ({ child, team, club }) =>
      `${child} quer entrar na equipa ${team} do ${club}. Confirma a inscrição para ativar a conta.`,
    introTrial: ({ team, club }) =>
      `Foste convidado para um treino de captação com ${team} do ${club}.`,
    introInvite: ({ team, club }) => `Foste convidado para a equipa ${team} do ${club}.`,
    metaChild: 'Criança',
    metaTeam: 'Equipa',
    metaValidUntil: 'Válido até',
    ctaParent: 'Confirmar inscrição',
    ctaAccept: 'Aceitar convite',
    noteValidity: ({ date }) => `Este convite é válido até ${date}.`,
    noteUnder16:
      'Se tiveres menos de 16 anos, pedimos a seguir a autorização de um encarregado de educação.',
    footer: ({ club }) => `${club} · Anstoss`,
  },
  tr: {
    subjectParent: ({ child, club }) => `${child} için kayıt onayı – ${club}`,
    subjectTrial: ({ team, club }) => `Deneme antrenmanı daveti: ${team} – ${club}`,
    subjectInvite: ({ team, club }) => `Takım daveti: ${team} – ${club}`,
    headingParent: 'Kaydı onayla',
    headingTrial: 'Deneme antrenmanına davet',
    headingInvite: 'Davetlisin',
    introParent: ({ child, team, club }) =>
      `${child}, ${club} kulübünde ${team} takımına katılmak istiyor. Hesabın etkinleşmesi için lütfen kaydı onayla.`,
    introTrial: ({ team, club }) =>
      `${club} kulübünde ${team} takımının deneme antrenmanına davet edildin.`,
    introInvite: ({ team, club }) => `${club} kulübünde ${team} takımına katılmaya davet edildin.`,
    metaChild: 'Çocuk',
    metaTeam: 'Takım',
    metaValidUntil: 'Son geçerlilik tarihi',
    ctaParent: 'Kaydı onayla',
    ctaAccept: 'Daveti kabul et',
    noteValidity: ({ date }) => `Bu davet ${date} tarihine kadar geçerli.`,
    noteUnder16:
      '16 yaşından küçüksen bir sonraki adımda veli onayı isteyeceğiz.',
    footer: ({ club }) => `${club} · Anstoss`,
  },
}

export function buildInviteEmail(params: InviteEmailParams): {
  subject: string
  html: string
  text: string
} {
  const t = INVITE[params.locale]
  const dateLabel = formatDate(params.expiresAt, params.locale)
  const child = params.childName || ''

  if (params.kind === 'PARENT_APPROVAL') {
    const childName = child || t.metaChild
    const { html, text } = renderEmail({
      clubName: params.clubName,
      primaryColor: params.primaryColor,
      badgeUrl: params.badgeUrl,
      preheader: t.introParent({ child: childName, team: params.teamName, club: params.clubName }),
      heading: t.headingParent,
      intro: [t.introParent({ child: childName, team: params.teamName, club: params.clubName })],
      meta: [
        ...(child ? [{ label: t.metaChild, value: child }] : []),
        { label: t.metaTeam, value: params.teamName },
        { label: t.metaValidUntil, value: dateLabel, mono: true },
      ],
      cta: { label: t.ctaParent, url: params.link },
      footnote: t.noteValidity({ date: dateLabel }),
      footer: t.footer({ club: params.clubName }),
    })
    return {
      subject: t.subjectParent({ child: childName, club: params.clubName }),
      html,
      text,
    }
  }

  const isTrial = params.phase === 'TRIAL'
  const heading = isTrial ? t.headingTrial : t.headingInvite
  const introLine = isTrial
    ? t.introTrial({ team: params.teamName, club: params.clubName })
    : t.introInvite({ team: params.teamName, club: params.clubName })
  const footnote =
    params.role === 'PLAYER'
      ? `${t.noteUnder16} ${t.noteValidity({ date: dateLabel })}`
      : t.noteValidity({ date: dateLabel })

  const { html, text } = renderEmail({
    clubName: params.clubName,
    primaryColor: params.primaryColor,
    badgeUrl: params.badgeUrl,
    preheader: introLine,
    heading,
    intro: [introLine],
    meta: [
      { label: t.metaTeam, value: params.teamName },
      { label: t.metaValidUntil, value: dateLabel, mono: true },
    ],
    cta: { label: t.ctaAccept, url: params.link },
    footnote,
    footer: t.footer({ club: params.clubName }),
  })

  const subject = isTrial
    ? t.subjectTrial({ team: params.teamName, club: params.clubName })
    : t.subjectInvite({ team: params.teamName, club: params.clubName })

  return { subject, html, text }
}

// ─────────────────────────────────────────────────────────────────────────────
// Contribution-due reminder email
// ─────────────────────────────────────────────────────────────────────────────

export interface ContributionReminderParams {
  locale: Locale
  clubName: string
  primaryColor?: string | null
  badgeUrl?: string | null
  memberName: string
  planName: string
  amountCents: number
  currency: string
  dueDate: Date
  status: 'OVERDUE' | 'OUTSTANDING'
}

interface ReminderStrings {
  subject: (p: { club: string; plan: string }) => string
  headingDue: string
  headingOverdue: string
  intro: (p: { name: string; plan: string }) => string
  metaAmount: string
  metaDueDate: string
  metaStatus: string
  statusOverdue: string
  statusOutstanding: string
  footnote: string
  footer: (p: { club: string }) => string
}

const REMINDER: Record<Locale, ReminderStrings> = {
  de: {
    subject: ({ club, plan }) => `${club}: ${plan} fällig`,
    headingDue: 'Beitrag fällig',
    headingOverdue: 'Beitrag überfällig',
    intro: ({ name, plan }) => `Hallo ${name}, dein Beitrag „${plan}“ ist noch offen.`,
    metaAmount: 'Betrag',
    metaDueDate: 'Fällig am',
    metaStatus: 'Status',
    statusOverdue: 'Überfällig',
    statusOutstanding: 'Offen',
    footnote:
      'Wenn du bereits bezahlt hast, kann der Verein deinen Status direkt in Anstoss aktualisieren.',
    footer: ({ club }) => `${club} · Anstoss`,
  },
  en: {
    subject: ({ club, plan }) => `${club}: ${plan} fee due`,
    headingDue: 'Membership fee due',
    headingOverdue: 'Membership fee overdue',
    intro: ({ name, plan }) => `Hi ${name}, your “${plan}” fee is still outstanding.`,
    metaAmount: 'Amount',
    metaDueDate: 'Due date',
    metaStatus: 'Status',
    statusOverdue: 'Overdue',
    statusOutstanding: 'Outstanding',
    footnote:
      'If you have already paid, the club can update your status directly in Anstoss.',
    footer: ({ club }) => `${club} · Anstoss`,
  },
  fr: {
    subject: ({ club, plan }) => `${club} : cotisation ${plan} à régler`,
    headingDue: 'Cotisation à régler',
    headingOverdue: 'Cotisation en retard',
    intro: ({ name, plan }) => `Bonjour ${name}, ta cotisation « ${plan} » n’est pas encore réglée.`,
    metaAmount: 'Montant',
    metaDueDate: 'Échéance',
    metaStatus: 'Statut',
    statusOverdue: 'En retard',
    statusOutstanding: 'À régler',
    footnote:
      'Si tu as déjà payé, le club peut mettre à jour ton statut directement dans Anstoss.',
    footer: ({ club }) => `${club} · Anstoss`,
  },
  it: {
    subject: ({ club, plan }) => `${club}: quota ${plan} da pagare`,
    headingDue: 'Quota da pagare',
    headingOverdue: 'Quota scaduta',
    intro: ({ name, plan }) => `Ciao ${name}, la tua quota “${plan}” non è ancora stata pagata.`,
    metaAmount: 'Importo',
    metaDueDate: 'Scadenza',
    metaStatus: 'Stato',
    statusOverdue: 'Scaduta',
    statusOutstanding: 'Da pagare',
    footnote:
      'Se hai già pagato, il club può aggiornare il tuo stato direttamente in Anstoss.',
    footer: ({ club }) => `${club} · Anstoss`,
  },
  pt: {
    subject: ({ club, plan }) => `${club}: quota ${plan} por pagar`,
    headingDue: 'Quota por pagar',
    headingOverdue: 'Quota em atraso',
    intro: ({ name, plan }) => `Olá ${name}, a tua quota “${plan}” ainda está por pagar.`,
    metaAmount: 'Valor',
    metaDueDate: 'Data limite',
    metaStatus: 'Estado',
    statusOverdue: 'Em atraso',
    statusOutstanding: 'Por pagar',
    footnote:
      'Se já pagaste, o clube pode atualizar o teu estado diretamente no Anstoss.',
    footer: ({ club }) => `${club} · Anstoss`,
  },
  tr: {
    subject: ({ club, plan }) => `${club}: ${plan} aidatı bekleniyor`,
    headingDue: 'Aidat ödemesi bekleniyor',
    headingOverdue: 'Aidat ödemesi gecikti',
    intro: ({ name, plan }) => `Merhaba ${name}, “${plan}” aidatın henüz ödenmedi.`,
    metaAmount: 'Tutar',
    metaDueDate: 'Son ödeme tarihi',
    metaStatus: 'Durum',
    statusOverdue: 'Gecikti',
    statusOutstanding: 'Ödenmedi',
    footnote:
      'Ödemeyi zaten yaptıysan kulüp durumunu doğrudan Anstoss’ta güncelleyebilir.',
    footer: ({ club }) => `${club} · Anstoss`,
  },
}

export function buildContributionReminderEmail(params: ContributionReminderParams): {
  subject: string
  html: string
  text: string
} {
  const t = REMINDER[params.locale]
  const overdue = params.status === 'OVERDUE'
  const introLine = t.intro({ name: params.memberName, plan: params.planName })

  const { html, text } = renderEmail({
    clubName: params.clubName,
    primaryColor: params.primaryColor,
    badgeUrl: params.badgeUrl,
    preheader: introLine,
    heading: overdue ? t.headingOverdue : t.headingDue,
    intro: [introLine],
    meta: [
      {
        label: t.metaAmount,
        value: formatAmount(params.amountCents, params.currency, params.locale),
        mono: true,
      },
      { label: t.metaDueDate, value: formatDate(params.dueDate, params.locale), mono: true },
      { label: t.metaStatus, value: overdue ? t.statusOverdue : t.statusOutstanding },
    ],
    footnote: t.footnote,
    footer: t.footer({ club: params.clubName }),
  })

  return { subject: t.subject({ club: params.clubName, plan: params.planName }), html, text }
}

// ─────────────────────────────────────────────────────────────────────────────
// Payment-received receipt email
// ─────────────────────────────────────────────────────────────────────────────

export interface PaymentReceiptParams {
  locale: Locale
  clubName: string
  primaryColor?: string | null
  badgeUrl?: string | null
  memberName: string
  planName: string
  amountCents: number
  currency: string
  paidAt: Date
}

interface ReceiptStrings {
  subject: (p: { club: string; plan: string }) => string
  heading: string
  intro: (p: { name: string; plan: string; club: string }) => string
  metaAmount: string
  metaPaidOn: string
  metaStatus: string
  statusPaid: string
  footnote: string
  footer: (p: { club: string }) => string
}

const RECEIPT: Record<Locale, ReceiptStrings> = {
  de: {
    subject: ({ plan }) => `Zahlung erhalten – ${plan}`,
    heading: 'Zahlung erhalten',
    intro: ({ name, plan, club }) =>
      `Hallo ${name}, vielen Dank! Wir haben deine Zahlung „${plan}“ bei ${club} verbucht.`,
    metaAmount: 'Betrag',
    metaPaidOn: 'Bezahlt am',
    metaStatus: 'Status',
    statusPaid: 'Bezahlt',
    footnote: 'Bewahre diese E-Mail als Beleg auf. Bei Fragen wende dich an deinen Verein.',
    footer: ({ club }) => `${club} · Anstoss`,
  },
  en: {
    subject: ({ plan }) => `Payment received – ${plan}`,
    heading: 'Payment received',
    intro: ({ name, plan, club }) =>
      `Hi ${name}, thanks! We’ve recorded your “${plan}” payment at ${club}.`,
    metaAmount: 'Amount',
    metaPaidOn: 'Paid on',
    metaStatus: 'Status',
    statusPaid: 'Paid',
    footnote: 'Keep this email as your receipt. If anything is incorrect, contact your club.',
    footer: ({ club }) => `${club} · Anstoss`,
  },
  fr: {
    subject: ({ plan }) => `Paiement reçu – ${plan}`,
    heading: 'Paiement reçu',
    intro: ({ name, plan, club }) =>
      `Bonjour ${name}, merci ! Nous avons bien enregistré ton paiement « ${plan} » à ${club}.`,
    metaAmount: 'Montant',
    metaPaidOn: 'Payé le',
    metaStatus: 'Statut',
    statusPaid: 'Payé',
    footnote: 'Garde cet e-mail comme reçu. En cas de problème, contacte ton club.',
    footer: ({ club }) => `${club} · Anstoss`,
  },
  it: {
    subject: ({ plan }) => `Pagamento ricevuto – ${plan}`,
    heading: 'Pagamento ricevuto',
    intro: ({ name, plan, club }) =>
      `Ciao ${name}, grazie! Abbiamo registrato il tuo pagamento “${plan}” presso ${club}.`,
    metaAmount: 'Importo',
    metaPaidOn: 'Pagato il',
    metaStatus: 'Stato',
    statusPaid: 'Pagato',
    footnote: 'Conserva questa email come ricevuta. Per qualsiasi problema, contatta il tuo club.',
    footer: ({ club }) => `${club} · Anstoss`,
  },
  pt: {
    subject: ({ plan }) => `Pagamento recebido – ${plan}`,
    heading: 'Pagamento recebido',
    intro: ({ name, plan, club }) =>
      `Olá ${name}, obrigado! Registámos o teu pagamento “${plan}” no ${club}.`,
    metaAmount: 'Valor',
    metaPaidOn: 'Pago em',
    metaStatus: 'Estado',
    statusPaid: 'Pago',
    footnote: 'Guarda este e-mail como recibo. Se algo estiver errado, contacta o teu clube.',
    footer: ({ club }) => `${club} · Anstoss`,
  },
  tr: {
    subject: ({ plan }) => `Ödeme alındı – ${plan}`,
    heading: 'Ödeme alındı',
    intro: ({ name, plan, club }) =>
      `Merhaba ${name}, teşekkürler! ${club} kulübüne yaptığın “${plan}” ödemesini kaydettik.`,
    metaAmount: 'Tutar',
    metaPaidOn: 'Ödeme tarihi',
    metaStatus: 'Durum',
    statusPaid: 'Ödendi',
    footnote: 'Bu e-postayı makbuz olarak sakla. Bir sorun varsa kulübünle iletişime geç.',
    footer: ({ club }) => `${club} · Anstoss`,
  },
}

export function buildPaymentReceiptEmail(params: PaymentReceiptParams): {
  subject: string
  html: string
  text: string
} {
  const t = RECEIPT[params.locale]
  const introLine = t.intro({ name: params.memberName, plan: params.planName, club: params.clubName })

  const { html, text } = renderEmail({
    clubName: params.clubName,
    primaryColor: params.primaryColor,
    badgeUrl: params.badgeUrl,
    preheader: introLine,
    heading: t.heading,
    intro: [introLine],
    meta: [
      {
        label: t.metaAmount,
        value: formatAmount(params.amountCents, params.currency, params.locale),
        mono: true,
      },
      { label: t.metaPaidOn, value: formatDate(params.paidAt, params.locale), mono: true },
      { label: t.metaStatus, value: t.statusPaid },
    ],
    footnote: t.footnote,
    footer: t.footer({ club: params.clubName }),
  })

  return { subject: t.subject({ club: params.clubName, plan: params.planName }), html, text }
}

// ─────────────────────────────────────────────────────────────────────────────
// Welcome-to-club email (member joined)
// ─────────────────────────────────────────────────────────────────────────────

export interface WelcomeEmailParams {
  locale: Locale
  clubName: string
  primaryColor?: string | null
  badgeUrl?: string | null
  memberName: string
  teamName: string
  /** Already-localized role label (optional) — shown in the data panel. */
  roleLabel?: string | null
  /** Deep link / URL to open the app. */
  link: string
}

interface WelcomeStrings {
  subject: (p: { club: string }) => string
  heading: (p: { club: string }) => string
  intro: (p: { name: string; team: string; club: string }) => string
  metaTeam: string
  metaRole: string
  cta: string
  footnote: string
  footer: (p: { club: string }) => string
}

const WELCOME: Record<Locale, WelcomeStrings> = {
  de: {
    subject: ({ club }) => `Willkommen bei ${club}`,
    heading: ({ club }) => `Willkommen bei ${club}`,
    intro: ({ name, team, club }) =>
      `Hallo ${name}, du gehörst jetzt zu ${team} bei ${club}. Spiele, Training, Nachrichten und Beiträge an einem Ort. Öffne Anstoss und leg los.`,
    metaTeam: 'Team',
    metaRole: 'Rolle',
    cta: 'Anstoss öffnen',
    footnote: 'Bis bald auf dem Platz.',
    footer: ({ club }) => `${club} · Anstoss`,
  },
  en: {
    subject: ({ club }) => `Welcome to ${club}`,
    heading: ({ club }) => `Welcome to ${club}`,
    intro: ({ name, team, club }) =>
      `Hi ${name}, you're now part of ${team} at ${club}. Match days, training, messages and contributions all live in one place. Open Anstoss to get started.`,
    metaTeam: 'Team',
    metaRole: 'Role',
    cta: 'Open Anstoss',
    footnote: 'See you on the pitch.',
    footer: ({ club }) => `${club} · Anstoss`,
  },
  fr: {
    subject: ({ club }) => `Bienvenue à ${club}`,
    heading: ({ club }) => `Bienvenue à ${club}`,
    intro: ({ name, team, club }) =>
      `Salut ${name}, tu fais désormais partie de ${team} à ${club}. Matchs, entraînements, messages et cotisations au même endroit : ouvre Anstoss pour commencer.`,
    metaTeam: 'Équipe',
    metaRole: 'Rôle',
    cta: 'Ouvrir Anstoss',
    footnote: 'À bientôt sur le terrain.',
    footer: ({ club }) => `${club} · Anstoss`,
  },
  it: {
    subject: ({ club }) => `Benvenuto nel ${club}`,
    heading: ({ club }) => `Benvenuto nel ${club}`,
    intro: ({ name, team, club }) =>
      `Ciao ${name}, ora fai parte di ${team} del ${club}. Partite, allenamenti, messaggi e quote in un unico posto: apri Anstoss per iniziare.`,
    metaTeam: 'Squadra',
    metaRole: 'Ruolo',
    cta: 'Apri Anstoss',
    footnote: 'Ci vediamo in campo.',
    footer: ({ club }) => `${club} · Anstoss`,
  },
  pt: {
    subject: ({ club }) => `Bem-vindo ao ${club}`,
    heading: ({ club }) => `Bem-vindo ao ${club}`,
    intro: ({ name, team, club }) =>
      `Olá ${name}, agora fazes parte da equipa ${team} do ${club}. Jogos, treinos, mensagens e quotas num só lugar: abre o Anstoss para começar.`,
    metaTeam: 'Equipa',
    metaRole: 'Função',
    cta: 'Abrir o Anstoss',
    footnote: 'Até breve no relvado.',
    footer: ({ club }) => `${club} · Anstoss`,
  },
  tr: {
    subject: ({ club }) => `Hoş geldin – ${club}`,
    heading: ({ club }) => `Hoş geldin – ${club}`,
    intro: ({ name, team, club }) =>
      `Merhaba ${name}, artık ${club} kulübünde ${team} takımının bir parçasısın. Maçlar, antrenmanlar, mesajlar ve aidatlar tek yerde. Başlamak için Anstoss’u aç.`,
    metaTeam: 'Takım',
    metaRole: 'Rol',
    cta: 'Anstoss’u aç',
    footnote: 'Sahada görüşürüz.',
    footer: ({ club }) => `${club} · Anstoss`,
  },
}

// ─── Parent handoff (under-16 signup) ───────────────────────────────────────

export interface ParentHandoffParams {
  locale: Locale
  /** The child's first name, for a personal subject + greeting. */
  childFirstName: string
  /** The redeemable setup code the guardian enters in the app. */
  code: string
}

type ParentHandoffStrings = {
  /** Stands in for a blank child name. */
  childFallback: string
  subject: (p: { child: string }) => string
  preheader: (p: { child: string }) => string
  heading: (p: { child: string }) => string
  intro: (p: { child: string }) => string[]
  codeLabel: string
  footnote: string
  footer: string
}

const PARENT_HANDOFF: Record<Locale, ParentHandoffStrings> = {
  en: {
    childFallback: 'Your child',
    subject: ({ child }) => `Set up ${child} on Anstoss`,
    preheader: ({ child }) => `${child} needs a parent to set up their Anstoss account.`,
    heading: ({ child }) => `Set ${child} up on their team`,
    intro: ({ child }) => [
      `${child} tried to sign up for Anstoss, the app their football club uses for matches, training, messages and contributions.`,
      `Because ${child} is under 16, they can't have their own account. To finish, download Anstoss, create your own parent account, and enter the code below to add ${child} to your account.`,
      `If you weren't expecting this, you can ignore this email. ${child}'s sign-up won't go any further without you.`,
    ],
    codeLabel: 'Setup code',
    footnote: 'You received this because your address was entered during a sign-up on Anstoss.',
    footer: 'Anstoss',
  },
  de: {
    childFallback: 'Dein Kind',
    subject: ({ child }) => `Anstoss-Konto einrichten: ${child}`,
    preheader: ({ child }) => `${child} braucht ein Elternteil, um das Anstoss-Konto einzurichten.`,
    heading: ({ child }) => `Konto für ${child} einrichten`,
    intro: ({ child }) => [
      `${child} wollte sich bei Anstoss anmelden, der App, die der Fußballverein für Spiele, Training, Chat und Beiträge nutzt.`,
      `Da ${child} unter 16 ist, ist kein eigenes Konto möglich, deshalb haben wir die Anmeldung pausiert. So geht es weiter: Lade Anstoss herunter, erstelle dein eigenes Elternkonto und gib den Code unten ein. Dann verwaltest du das Profil von ${child} über dein Konto.`,
      `Falls du diese E-Mail nicht erwartet hast, kannst du sie ignorieren. Ohne dich geht die Anmeldung von ${child} nicht weiter.`,
    ],
    codeLabel: 'Einrichtungscode',
    footnote: 'Du erhältst diese E-Mail, weil deine Adresse bei einer Anmeldung in Anstoss eingegeben wurde.',
    footer: 'Anstoss',
  },
  fr: {
    childFallback: 'Ton enfant',
    subject: ({ child }) => `Créer le compte Anstoss de ${child}`,
    preheader: ({ child }) => `${child} a besoin d’un parent pour créer son compte Anstoss.`,
    heading: ({ child }) => `Inscris ${child} dans son équipe`,
    intro: ({ child }) => [
      `${child} a essayé de s’inscrire sur Anstoss, l’appli que son club de foot utilise pour les matchs, les entraînements, la messagerie et les cotisations.`,
      `Comme ${child} a moins de 16 ans, un compte personnel n’est pas possible : nous avons mis l’inscription en pause. Pour la terminer, télécharge Anstoss, crée ton compte parent et saisis le code ci-dessous pour ajouter ${child} comme profil géré depuis ton compte.`,
      `Si tu n’attendais pas cet e-mail, tu peux l’ignorer. Sans toi, l’inscription de ${child} n’ira pas plus loin.`,
    ],
    codeLabel: 'Code de configuration',
    footnote: 'Tu reçois cet e-mail parce que ton adresse a été saisie lors d’une inscription sur Anstoss.',
    footer: 'Anstoss',
  },
  it: {
    childFallback: 'Tuo figlio',
    subject: ({ child }) => `Crea l’account Anstoss per ${child}`,
    preheader: ({ child }) => `${child} ha bisogno di un genitore per creare l’account Anstoss.`,
    heading: ({ child }) => `Iscrivi ${child} alla squadra`,
    intro: ({ child }) => [
      `${child} ha provato a registrarsi su Anstoss, l’app che la società di calcio usa per partite, allenamenti, chat e quote.`,
      `Dato che ${child} ha meno di 16 anni, non può avere un account personale: abbiamo sospeso la registrazione. Per completarla, scarica Anstoss, crea il tuo account genitore e inserisci il codice qui sotto per aggiungere ${child} come profilo gestito da te.`,
      `Se non aspettavi questa email, puoi ignorarla. Senza di te la registrazione di ${child} non va avanti.`,
    ],
    codeLabel: 'Codice di configurazione',
    footnote: 'Hai ricevuto questa email perché il tuo indirizzo è stato inserito durante una registrazione su Anstoss.',
    footer: 'Anstoss',
  },
  pt: {
    childFallback: 'O teu filho',
    subject: ({ child }) => `Criar a conta Anstoss de ${child}`,
    preheader: ({ child }) => `${child} precisa de um encarregado de educação para criar a conta Anstoss.`,
    heading: ({ child }) => `Inscreve ${child} na equipa`,
    intro: ({ child }) => [
      `${child} tentou registar-se no Anstoss, a app que o clube de futebol usa para jogos, treinos, mensagens e quotas.`,
      `Como ${child} tem menos de 16 anos, não pode ter conta própria, por isso pausámos o registo. Para concluir, descarrega o Anstoss, cria a tua conta de encarregado de educação e introduz o código abaixo para adicionar ${child} como perfil gerido por ti.`,
      `Se não estavas à espera deste e-mail, podes ignorá-lo. Sem ti, o registo de ${child} não avança.`,
    ],
    codeLabel: 'Código de configuração',
    footnote: 'Recebeste este e-mail porque o teu endereço foi introduzido num registo no Anstoss.',
    footer: 'Anstoss',
  },
  tr: {
    childFallback: 'Çocuğun',
    subject: ({ child }) => `Anstoss hesabı kurulumu: ${child}`,
    preheader: ({ child }) => `${child} için Anstoss hesabını bir velinin kurması gerekiyor.`,
    heading: ({ child }) => `${child} için hesabı kur`,
    intro: ({ child }) => [
      `${child}, futbol kulübünün maçlar, antrenmanlar, mesajlar ve aidatlar için kullandığı Anstoss uygulamasına kaydolmaya çalıştı.`,
      `16 yaşından küçükler kendi hesabını açamadığı için kaydı beklemeye aldık. Tamamlamak için Anstoss’u indir, kendi veli hesabını oluştur ve aşağıdaki kodu gir. Böylece ${child} için profili kendi hesabından yönetebilirsin.`,
      `Bu e-postayı beklemiyorduysan görmezden gelebilirsin. Sen onaylamadan kayıt devam etmez.`,
    ],
    codeLabel: 'Kurulum kodu',
    footnote: 'Bu e-postayı, adresin Anstoss’ta bir kayıt sırasında girildiği için aldın.',
    footer: 'Anstoss',
  },
}

export function buildParentHandoffEmail(params: ParentHandoffParams): {
  subject: string
  html: string
  text: string
} {
  const t = PARENT_HANDOFF[params.locale]
  const child = params.childFirstName.trim() || t.childFallback

  const { html, text } = renderEmail({
    clubName: 'Anstoss',
    preheader: t.preheader({ child }),
    heading: t.heading({ child }),
    intro: t.intro({ child }),
    meta: [{ label: t.codeLabel, value: params.code, mono: true }],
    footnote: t.footnote,
    footer: t.footer,
  })

  return { subject: t.subject({ child }), html, text }
}

export function buildWelcomeEmail(params: WelcomeEmailParams): {
  subject: string
  html: string
  text: string
} {
  const t = WELCOME[params.locale]
  const introLine = t.intro({ name: params.memberName, team: params.teamName, club: params.clubName })

  const { html, text } = renderEmail({
    clubName: params.clubName,
    primaryColor: params.primaryColor,
    badgeUrl: params.badgeUrl,
    preheader: introLine,
    heading: t.heading({ club: params.clubName }),
    intro: [introLine],
    meta: [
      { label: t.metaTeam, value: params.teamName },
      ...(params.roleLabel ? [{ label: t.metaRole, value: params.roleLabel }] : []),
    ],
    cta: { label: t.cta, url: params.link },
    footnote: t.footnote,
    footer: t.footer({ club: params.clubName }),
  })

  return { subject: t.subject({ club: params.clubName }), html, text }
}

// ─── Email OTP sign-in code ─────────────────────────────

const OTP_CODE: Record<
  Locale,
  {
    subject: (a: { code: string }) => string
    preheader: (a: { code: string }) => string
    heading: string
    intro: (a: { minutes: number }) => string
    metaCode: string
    footnote: string
    footer: string
  }
> = {
  en: {
    subject: ({ code }) => `Your Anstoss code: ${code}`,
    preheader: ({ code }) => `Your sign-in code is ${code}`,
    heading: 'Your sign-in code',
    intro: ({ minutes }) =>
      `Enter this code in the app to sign in. It expires in ${minutes} minutes.`,
    metaCode: 'Verification code',
    footnote: "If you didn't request this, you can safely ignore this email.",
    footer: 'Anstoss',
  },
  de: {
    subject: ({ code }) => `Dein Anstoss-Code: ${code}`,
    preheader: ({ code }) => `Dein Anmeldecode ist ${code}`,
    heading: 'Dein Anmeldecode',
    intro: ({ minutes }) =>
      `Gib diesen Code in der App ein, um dich anzumelden. Er läuft in ${minutes} Minuten ab.`,
    metaCode: 'Bestätigungscode',
    footnote:
      'Wenn du das nicht angefordert hast, kannst du diese E-Mail ignorieren.',
    footer: 'Anstoss',
  },
  fr: {
    subject: ({ code }) => `Ton code Anstoss : ${code}`,
    preheader: ({ code }) => `Ton code de connexion : ${code}`,
    heading: 'Ton code de connexion',
    intro: ({ minutes }) =>
      `Saisis ce code dans l’appli pour te connecter. Il expire dans ${minutes} minutes.`,
    metaCode: 'Code de vérification',
    footnote:
      'Si tu n’as rien demandé, ignore simplement cet e-mail.',
    footer: 'Anstoss',
  },
  it: {
    subject: ({ code }) => `Il tuo codice Anstoss: ${code}`,
    preheader: ({ code }) => `Il tuo codice di accesso è ${code}`,
    heading: 'Il tuo codice di accesso',
    intro: ({ minutes }) =>
      `Inserisci questo codice nell'app per accedere. Scade tra ${minutes} minuti.`,
    metaCode: 'Codice di verifica',
    footnote: 'Se non hai richiesto questo codice, ignora questa email.',
    footer: 'Anstoss',
  },
  pt: {
    subject: ({ code }) => `O teu código Anstoss: ${code}`,
    preheader: ({ code }) => `O teu código de acesso: ${code}`,
    heading: 'O teu código de acesso',
    intro: ({ minutes }) =>
      `Introduz este código na app para iniciar sessão. Expira dentro de ${minutes} minutos.`,
    metaCode: 'Código de verificação',
    footnote: 'Se não pediste este código, podes ignorar este e-mail.',
    footer: 'Anstoss',
  },
  tr: {
    subject: ({ code }) => `Anstoss kodun: ${code}`,
    preheader: ({ code }) => `Giriş kodun: ${code}`,
    heading: 'Giriş kodun',
    intro: ({ minutes }) =>
      `Giriş yapmak için bu kodu uygulamaya gir. Kodun geçerlilik süresi: ${minutes} dakika.`,
    metaCode: 'Doğrulama kodu',
    footnote: 'Bu kodu sen istemediysen bu e-postayı görmezden gelebilirsin.',
    footer: 'Anstoss',
  },
}

export interface OtpCodeEmailParams {
  locale: Locale
  code: string
  expiresInMinutes: number
}

export function buildOtpCodeEmail(params: OtpCodeEmailParams): {
  subject: string
  html: string
  text: string
} {
  const t = OTP_CODE[params.locale]
  const { html, text } = renderEmail({
    clubName: 'Anstoss',
    preheader: t.preheader({ code: params.code }),
    heading: t.heading,
    intro: [t.intro({ minutes: params.expiresInMinutes })],
    meta: [{ label: t.metaCode, value: params.code, mono: true }],
    footnote: t.footnote,
    footer: t.footer,
  })
  return { subject: t.subject({ code: params.code }), html, text }
}

const OWNERSHIP_CODE: Record<
  Locale,
  {
    subject: (a: { code: string }) => string
    preheader: (a: { code: string }) => string
    heading: string
    intro: (a: { minutes: number }) => string
    metaCode: string
    footnote: string
    footer: string
  }
> = {
  en: {
    subject: ({ code }) => `Confirm Anstoss ownership change: ${code}`,
    preheader: ({ code }) => `Confirm this ownership change with ${code}`,
    heading: 'Confirm club ownership change',
    intro: ({ minutes }) =>
      `Enter this one-time code in Anstoss to confirm the ownership action you just requested. It expires in ${minutes} minutes.`,
    metaCode: 'Confirmation code',
    footnote:
      'This code is tied to one club and one ownership action. If you did not request it, do not share it.',
    footer: 'Anstoss security',
  },
  de: {
    subject: ({ code }) => `Inhaberwechsel bei Anstoss bestätigen: ${code}`,
    preheader: ({ code }) => `Bestätige den Inhaberwechsel mit ${code}`,
    heading: 'Wechsel der Vereinsinhaberschaft bestätigen',
    intro: ({ minutes }) =>
      `Gib diesen Einmalcode in Anstoss ein, um die gerade angeforderte Änderung der Inhaberschaft zu bestätigen. Er läuft in ${minutes} Minuten ab.`,
    metaCode: 'Bestätigungscode',
    footnote:
      'Der Code gilt nur für einen Verein und diese eine Änderung. Wenn du das nicht angefordert hast, gib ihn nicht weiter.',
    footer: 'Anstoss Sicherheit',
  },
  fr: {
    subject: ({ code }) => `Confirme le changement de propriétaire sur Anstoss : ${code}`,
    preheader: ({ code }) => `Confirme ce changement de propriétaire avec ${code}`,
    heading: 'Confirmer le changement de propriétaire du club',
    intro: ({ minutes }) =>
      `Saisis ce code à usage unique dans Anstoss pour confirmer l’action sur la propriété du club que tu viens de demander. Il expire dans ${minutes} minutes.`,
    metaCode: 'Code de confirmation',
    footnote:
      'Ce code ne vaut que pour un club et une seule action. Si tu n’as rien demandé, ne le communique à personne.',
    footer: 'Sécurité Anstoss',
  },
  it: {
    subject: ({ code }) => `Conferma il cambio di proprietà su Anstoss: ${code}`,
    preheader: ({ code }) => `Conferma il cambio di proprietà con ${code}`,
    heading: 'Conferma il cambio di proprietà del club',
    intro: ({ minutes }) =>
      `Inserisci questo codice monouso in Anstoss per confermare l’operazione sulla proprietà del club che hai appena richiesto. Scade tra ${minutes} minuti.`,
    metaCode: 'Codice di conferma',
    footnote:
      'Il codice vale per un solo club e una sola operazione. Se non l’hai richiesto, non condividerlo con nessuno.',
    footer: 'Sicurezza Anstoss',
  },
  pt: {
    subject: ({ code }) => `Confirma a mudança de proprietário no Anstoss: ${code}`,
    preheader: ({ code }) => `Confirma esta mudança de proprietário com ${code}`,
    heading: 'Confirmar mudança de propriedade do clube',
    intro: ({ minutes }) =>
      `Introduz este código de utilização única no Anstoss para confirmar a ação de propriedade que acabaste de pedir. Expira dentro de ${minutes} minutos.`,
    metaCode: 'Código de confirmação',
    footnote:
      'Este código só vale para um clube e uma ação. Se não o pediste, não o partilhes com ninguém.',
    footer: 'Segurança Anstoss',
  },
  tr: {
    subject: ({ code }) => `Anstoss kulüp sahipliği değişikliğini onayla: ${code}`,
    preheader: ({ code }) => `Sahiplik değişikliği onay kodu: ${code}`,
    heading: 'Kulüp sahipliği değişikliğini onayla',
    intro: ({ minutes }) =>
      `Az önce istediğin sahiplik işlemini onaylamak için bu tek kullanımlık kodu Anstoss’a gir. Kodun geçerlilik süresi: ${minutes} dakika.`,
    metaCode: 'Onay kodu',
    footnote:
      'Bu kod yalnızca tek bir kulüp ve tek bir işlem için geçerli. Bu işlemi sen istemediysen kodu kimseyle paylaşma.',
    footer: 'Anstoss güvenlik',
  },
}

export function buildOwnershipTransferCodeEmail(params: OtpCodeEmailParams): {
  subject: string
  html: string
  text: string
} {
  const t = OWNERSHIP_CODE[params.locale]
  const { html, text } = renderEmail({
    clubName: 'Anstoss',
    preheader: t.preheader({ code: params.code }),
    heading: t.heading,
    intro: [t.intro({ minutes: params.expiresInMinutes })],
    meta: [{ label: t.metaCode, value: params.code, mono: true }],
    footnote: t.footnote,
    footer: t.footer,
  })
  return { subject: t.subject({ code: params.code }), html, text }
}
