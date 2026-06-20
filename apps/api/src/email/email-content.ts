/**
 * Localized copy for Anstoss transactional emails.
 *
 * Resolves the recipient's preferred language (de/en/fr/it/pt — the same set
 * the mobile app ships) and assembles the structured {@link EmailLayoutInput}
 * that {@link renderEmail} turns into branded HTML + a plain-text fallback.
 *
 * All recipient-facing prose lives here — nothing is hardcoded at the call
 * site — so adding a locale or tweaking wording never touches business logic.
 */
import { renderEmail } from './email-render'
import { resolveLocale, type Locale } from '../i18n/translations'

/**
 * Map an ISO-639-1 language (e.g. User.preferredLanguage) to a supported email
 * locale. Thin alias over the shared {@link resolveLocale} (German fallback).
 */
export const resolveEmailLocale = resolveLocale

const DATE_TAG: Record<Locale, string> = {
  de: 'de-DE',
  en: 'en-GB',
  fr: 'fr-FR',
  it: 'it-IT',
  pt: 'pt-PT',
}

function formatDate(value: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(DATE_TAG[locale], {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(value)
}

function formatAmount(amountCents: number, currency: string, locale: Locale): string {
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
    subjectParent: ({ child, club }) => `Merci de confirmer ${child} à ${club}`,
    subjectTrial: ({ team, club }) => `Séance d'essai avec ${team} – ${club}`,
    subjectInvite: ({ team, club }) => `Invitation à rejoindre ${team} – ${club}`,
    headingParent: "Confirmer l'inscription",
    headingTrial: "Invitation à une séance d'essai",
    headingInvite: 'Vous êtes invité',
    introParent: ({ child, team, club }) =>
      `${child} souhaite rejoindre ${team} à ${club}. Veuillez confirmer l'inscription pour activer le compte.`,
    introTrial: ({ team, club }) =>
      `Vous avez été invité à une séance d'essai avec ${team} à ${club}.`,
    introInvite: ({ team, club }) => `Vous avez été invité à rejoindre ${team} à ${club}.`,
    metaChild: 'Enfant',
    metaTeam: 'Équipe',
    metaValidUntil: "Valable jusqu'au",
    ctaParent: "Confirmer l'inscription",
    ctaAccept: "Accepter l'invitation",
    noteValidity: ({ date }) => `Cette invitation est valable jusqu'au ${date}.`,
    noteUnder16:
      "Si vous avez moins de 16 ans, nous demanderons le consentement d'un parent à l'étape suivante.",
    footer: ({ club }) => `${club} · Anstoss`,
  },
  it: {
    subjectParent: ({ child, club }) => `Conferma ${child} presso ${club}`,
    subjectTrial: ({ team, club }) => `Allenamento di prova con ${team} – ${club}`,
    subjectInvite: ({ team, club }) => `Invito a unirti a ${team} – ${club}`,
    headingParent: "Conferma l'iscrizione",
    headingTrial: 'Invito a un allenamento di prova',
    headingInvite: 'Sei stato invitato',
    introParent: ({ child, team, club }) =>
      `${child} desidera unirsi a ${team} presso ${club}. Conferma l'iscrizione per attivare l'account.`,
    introTrial: ({ team, club }) =>
      `Sei stato invitato a un allenamento di prova con ${team} presso ${club}.`,
    introInvite: ({ team, club }) => `Sei stato invitato a unirti a ${team} presso ${club}.`,
    metaChild: 'Bambino',
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
    subjectParent: ({ child, club }) => `Confirme ${child} no ${club}`,
    subjectTrial: ({ team, club }) => `Treino experimental com ${team} – ${club}`,
    subjectInvite: ({ team, club }) => `Convite para entrar em ${team} – ${club}`,
    headingParent: 'Confirmar inscrição',
    headingTrial: 'Convite para treino experimental',
    headingInvite: 'Você foi convidado',
    introParent: ({ child, team, club }) =>
      `${child} gostaria de entrar em ${team} no ${club}. Confirme a inscrição para ativar a conta.`,
    introTrial: ({ team, club }) =>
      `Você foi convidado para um treino experimental com ${team} no ${club}.`,
    introInvite: ({ team, club }) => `Você foi convidado para entrar em ${team} no ${club}.`,
    metaChild: 'Criança',
    metaTeam: 'Equipa',
    metaValidUntil: 'Válido até',
    ctaParent: 'Confirmar inscrição',
    ctaAccept: 'Aceitar convite',
    noteValidity: ({ date }) => `Este convite é válido até ${date}.`,
    noteUnder16:
      'Se tiver menos de 16 anos, pediremos o consentimento de um responsável na etapa seguinte.',
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
    intro: ({ name, plan }) => `Hallo ${name}, dein Beitrag „${plan}" ist derzeit offen.`,
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
    subject: ({ club, plan }) => `${club}: ${plan} due`,
    headingDue: 'Contribution due',
    headingOverdue: 'Contribution overdue',
    intro: ({ name, plan }) => `Hi ${name}, your "${plan}" contribution is currently outstanding.`,
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
    subject: ({ club, plan }) => `${club} : ${plan} à régler`,
    headingDue: 'Cotisation à régler',
    headingOverdue: 'Cotisation en retard',
    intro: ({ name, plan }) => `Bonjour ${name}, votre cotisation « ${plan} » est actuellement due.`,
    metaAmount: 'Montant',
    metaDueDate: "Date d'échéance",
    metaStatus: 'Statut',
    statusOverdue: 'En retard',
    statusOutstanding: 'À régler',
    footnote:
      'Si vous avez déjà payé, le club peut mettre à jour votre statut directement dans Anstoss.',
    footer: ({ club }) => `${club} · Anstoss`,
  },
  it: {
    subject: ({ club, plan }) => `${club}: ${plan} da pagare`,
    headingDue: 'Contributo da pagare',
    headingOverdue: 'Contributo scaduto',
    intro: ({ name, plan }) => `Ciao ${name}, il tuo contributo "${plan}" è attualmente da pagare.`,
    metaAmount: 'Importo',
    metaDueDate: 'Scadenza',
    metaStatus: 'Stato',
    statusOverdue: 'Scaduto',
    statusOutstanding: 'Da pagare',
    footnote:
      'Se hai già pagato, il club può aggiornare il tuo stato direttamente in Anstoss.',
    footer: ({ club }) => `${club} · Anstoss`,
  },
  pt: {
    subject: ({ club, plan }) => `${club}: ${plan} em aberto`,
    headingDue: 'Contribuição em aberto',
    headingOverdue: 'Contribuição em atraso',
    intro: ({ name, plan }) => `Olá ${name}, a sua contribuição "${plan}" está atualmente em aberto.`,
    metaAmount: 'Valor',
    metaDueDate: 'Data de vencimento',
    metaStatus: 'Estado',
    statusOverdue: 'Em atraso',
    statusOutstanding: 'Em aberto',
    footnote:
      'Se já efetuou o pagamento, o clube pode atualizar o seu estado diretamente no Anstoss.',
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
      `Hallo ${name}, vielen Dank – wir haben deine Zahlung „${plan}" bei ${club} verbucht.`,
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
      `Hi ${name}, thanks — we've recorded your "${plan}" payment at ${club}.`,
    metaAmount: 'Amount',
    metaPaidOn: 'Paid on',
    metaStatus: 'Status',
    statusPaid: 'Paid',
    footnote: 'Keep this email as your receipt. If anything looks off, contact your club.',
    footer: ({ club }) => `${club} · Anstoss`,
  },
  fr: {
    subject: ({ plan }) => `Paiement reçu – ${plan}`,
    heading: 'Paiement reçu',
    intro: ({ name, plan, club }) =>
      `Bonjour ${name}, merci — nous avons enregistré votre paiement « ${plan} » à ${club}.`,
    metaAmount: 'Montant',
    metaPaidOn: 'Payé le',
    metaStatus: 'Statut',
    statusPaid: 'Payé',
    footnote: 'Conservez cet e-mail comme reçu. En cas de problème, contactez votre club.',
    footer: ({ club }) => `${club} · Anstoss`,
  },
  it: {
    subject: ({ plan }) => `Pagamento ricevuto – ${plan}`,
    heading: 'Pagamento ricevuto',
    intro: ({ name, plan, club }) =>
      `Ciao ${name}, grazie — abbiamo registrato il tuo pagamento "${plan}" presso ${club}.`,
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
      `Olá ${name}, obrigado — registámos o teu pagamento "${plan}" no ${club}.`,
    metaAmount: 'Valor',
    metaPaidOn: 'Pago em',
    metaStatus: 'Estado',
    statusPaid: 'Pago',
    footnote: 'Guarda este email como recibo. Se algo estiver errado, contacta o teu clube.',
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
      `Hallo ${name}, du bist jetzt Teil von ${team} bei ${club}. Spieltage, Training, Nachrichten und Beiträge an einem Ort — öffne Anstoss, um loszulegen.`,
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
      `Hi ${name}, you're now part of ${team} at ${club}. Match days, training, messages and dues all live in one place — open Anstoss to get started.`,
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
      `Bonjour ${name}, vous faites désormais partie de ${team} à ${club}. Matchs, entraînements, messages et cotisations au même endroit — ouvrez Anstoss pour commencer.`,
    metaTeam: 'Équipe',
    metaRole: 'Rôle',
    cta: 'Ouvrir Anstoss',
    footnote: 'À bientôt sur le terrain.',
    footer: ({ club }) => `${club} · Anstoss`,
  },
  it: {
    subject: ({ club }) => `Benvenuto a ${club}`,
    heading: ({ club }) => `Benvenuto a ${club}`,
    intro: ({ name, team, club }) =>
      `Ciao ${name}, ora fai parte di ${team} presso ${club}. Partite, allenamenti, messaggi e quote in un unico posto — apri Anstoss per iniziare.`,
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
      `Olá ${name}, agora fazes parte de ${team} no ${club}. Jogos, treinos, mensagens e quotas num só lugar — abre o Anstoss para começar.`,
    metaTeam: 'Equipa',
    metaRole: 'Função',
    cta: 'Abrir o Anstoss',
    footnote: 'Até já no campo.',
    footer: ({ club }) => `${club} · Anstoss`,
  },
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
