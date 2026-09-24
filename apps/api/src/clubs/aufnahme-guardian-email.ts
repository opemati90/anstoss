import { renderEmail } from '../email/email-render'
import type { Locale } from '../i18n/translations'

/**
 * Aufnahmeantrag of a player under 18 (Wechselbörse review fix H4, lead
 * decision 2026-09-24): the membership and the SEPA direct-debit consent must
 * come from a guardian, never from the child ticking a box. The guardian gets
 * this email and approves in the app under "Einwilligungen" (the existing
 * parental-consent flow, scoped to the club and team).
 */
export interface AufnahmeGuardianEmailParams {
  locale: Locale
  clubName: string
  teamName: string
  childName: string
  primaryColor?: string | null
  badgeUrl?: string | null
}

type Strings = {
  subject: (p: { child: string; club: string }) => string
  heading: (p: { child: string }) => string
  intro: (p: { child: string; team: string; club: string }) => string[]
  metaChild: string
  metaTeam: string
  footnote: string
  footer: (p: { club: string }) => string
}

const STRINGS: Record<Locale, Strings> = {
  de: {
    subject: ({ child, club }) => `${club}: Aufnahmeantrag von ${child} braucht deine Zustimmung`,
    heading: ({ child }) => `${child} möchte Mitglied werden`,
    intro: ({ child, team, club }) => [
      `${child} hat nach einem Probetraining einen Aufnahmeantrag bei ${club} (${team}) gestellt. Weil ${child} noch nicht volljährig ist, müssen Erziehungsberechtigte der Mitgliedschaft und dem Beitragseinzug per SEPA-Lastschrift zustimmen.`,
      'Öffne Anstoss und melde dich mit dieser E-Mail-Adresse an. Unter „Einwilligungen“ kannst du zustimmen oder ablehnen. Das SEPA-Mandat selbst schickt dir der Kassenwart.',
    ],
    metaChild: 'Kind',
    metaTeam: 'Mannschaft',
    footnote: 'Du erhältst diese E-Mail, weil dich dein Kind im Aufnahmeantrag als Erziehungsberechtigte:n angegeben hat.',
    footer: ({ club }) => `${club} · Anstoss`,
  },
  en: {
    subject: ({ child, club }) => `${club}: ${child}'s membership application needs your approval`,
    heading: ({ child }) => `${child} wants to join the club`,
    intro: ({ child, team, club }) => [
      `After a trial session, ${child} applied for membership at ${club} (${team}). Because ${child} is under 18, a parent or guardian has to approve the membership and the fee collection by SEPA direct debit.`,
      'Open Anstoss and sign in with this email address. Under “Consents” you can approve or decline. The treasurer will send you the SEPA mandate separately.',
    ],
    metaChild: 'Child',
    metaTeam: 'Team',
    footnote: 'You are receiving this email because your child named you as their parent or guardian in the application.',
    footer: ({ club }) => `${club} · Anstoss`,
  },
  fr: {
    subject: ({ child, club }) => `${club} : la demande d’adhésion de ${child} attend ton accord`,
    heading: ({ child }) => `${child} souhaite rejoindre le club`,
    intro: ({ child, team, club }) => [
      `Après un entraînement d’essai, ${child} a demandé à adhérer à ${club} (${team}). Comme ${child} est mineur, un parent ou tuteur doit approuver l’adhésion et le paiement de la cotisation par prélèvement SEPA.`,
      'Ouvre Anstoss et connecte-toi avec cette adresse e-mail. Dans « Consentements », tu peux accepter ou refuser. Le trésorier t’enverra lui-même le mandat SEPA.',
    ],
    metaChild: 'Enfant',
    metaTeam: 'Équipe',
    footnote: 'Tu reçois cet e-mail parce que ton enfant t’a indiqué comme parent ou tuteur dans sa demande.',
    footer: ({ club }) => `${club} · Anstoss`,
  },
  it: {
    subject: ({ child, club }) => `${club}: la domanda di iscrizione di ${child} attende il tuo consenso`,
    heading: ({ child }) => `${child} vuole entrare nel club`,
    intro: ({ child, team, club }) => [
      `Dopo un allenamento di prova, ${child} ha chiesto di iscriversi a ${club} (${team}). Poiché ${child} è minorenne, un genitore o tutore deve approvare l’iscrizione e l’addebito della quota tramite addebito diretto SEPA.`,
      'Apri Anstoss e accedi con questo indirizzo e-mail. In «Consensi» puoi approvare o rifiutare. Il tesoriere ti invierà direttamente il mandato SEPA.',
    ],
    metaChild: 'Figlio/a',
    metaTeam: 'Squadra',
    footnote: 'Ricevi questa e-mail perché tuo figlio/tua figlia ti ha indicato come genitore o tutore nella domanda.',
    footer: ({ club }) => `${club} · Anstoss`,
  },
  pt: {
    subject: ({ child, club }) => `${club}: o pedido de adesão de ${child} precisa da tua autorização`,
    heading: ({ child }) => `${child} quer entrar no clube`,
    intro: ({ child, team, club }) => [
      `Depois de um treino à experiência, ${child} pediu para se tornar sócio do ${club} (${team}). Como ${child} é menor de idade, um encarregado de educação tem de autorizar a adesão e a cobrança da quota por débito direto SEPA.`,
      'Abre o Anstoss e inicia sessão com este endereço de e-mail. Em «Consentimentos» podes autorizar ou recusar. O tesoureiro envia-te o mandato SEPA.',
    ],
    metaChild: 'Criança',
    metaTeam: 'Equipa',
    footnote: 'Recebes este e-mail porque o teu filho ou a tua filha te indicou como encarregado de educação no pedido.',
    footer: ({ club }) => `${club} · Anstoss`,
  },
  tr: {
    subject: ({ child, club }) => `${club}: ${child} için üyelik başvurusu onayını bekliyor`,
    heading: ({ child }) => `${child} kulübe üye olmak istiyor`,
    intro: ({ child, team, club }) => [
      `${child}, deneme antrenmanının ardından ${club} kulübüne (${team}) üyelik başvurusu yaptı. 18 yaşından küçük oyuncularda üyeliği ve aidatın SEPA otomatik ödeme talimatıyla tahsil edilmesini velinin onaylaması gerekiyor.`,
      'Anstoss’u aç ve bu e-posta adresiyle giriş yap. “Veli onayları” bölümünden onaylayabilir ya da reddedebilirsin. SEPA talimatını sana sayman ayrıca gönderecek.',
    ],
    metaChild: 'Çocuk',
    metaTeam: 'Takım',
    footnote: 'Bu e-postayı, çocuğun başvuruda seni velisi olarak belirttiği için aldın.',
    footer: ({ club }) => `${club} · Anstoss`,
  },
}

export function buildAufnahmeGuardianEmail(params: AufnahmeGuardianEmailParams): {
  subject: string
  html: string
  text: string
} {
  const t = STRINGS[params.locale] ?? STRINGS.de
  const child = params.childName.trim() || t.metaChild
  const intro = t.intro({ child, team: params.teamName, club: params.clubName })
  const { html, text } = renderEmail({
    clubName: params.clubName,
    primaryColor: params.primaryColor,
    badgeUrl: params.badgeUrl,
    preheader: intro[0],
    heading: t.heading({ child }),
    intro,
    meta: [
      { label: t.metaChild, value: child },
      { label: t.metaTeam, value: params.teamName },
    ],
    footnote: t.footnote,
    footer: t.footer({ club: params.clubName }),
  })
  return { subject: t.subject({ child, club: params.clubName }), html, text }
}
