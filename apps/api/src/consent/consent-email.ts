import { renderEmail } from '../email/email-render'
import type { Locale } from '../i18n/translations'

/**
 * Privacy: emails to a guardian about a parental consent (GDPR Art. 8 / 7(3)).
 *
 *  - `request`: a club asked the guardian to approve (first request or a
 *    re-request after withdrawal). The guardian approves in the app, signed in
 *    with this email address.
 *  - `withdrawn_by_club`: a club admin recorded a withdrawal "on the guardian's
 *    written request". Always sent, so a guardian learns about a withdrawal
 *    they did not ask for.
 *  - `withdrawn_by_guardian`: confirmation of the guardian's own withdrawal.
 */
export type ConsentEmailKind = 'request' | 'withdrawn_by_club' | 'withdrawn_by_guardian'

export interface ConsentEmailParams {
  kind: ConsentEmailKind
  locale: Locale
  clubName: string
  teamName: string
  childName: string
  primaryColor?: string | null
  badgeUrl?: string | null
  /** Admin's documented note (withdrawn_by_club only). */
  note?: string | null
}

interface Strings {
  subject: Record<ConsentEmailKind, (p: { child: string; club: string }) => string>
  heading: Record<ConsentEmailKind, (p: { child: string }) => string>
  intro: Record<ConsentEmailKind, (p: { child: string; team: string; club: string }) => string[]>
  metaChild: string
  metaTeam: string
  metaNote: string
  footnote: Record<ConsentEmailKind, string>
  footer: (p: { club: string }) => string
}

const STRINGS: Record<Locale, Strings> = {
  de: {
    subject: {
      request: ({ child, club }) => `${club}: Einwilligung für ${child} benötigt`,
      withdrawn_by_club: ({ child, club }) => `${club} hat die Einwilligung für ${child} widerrufen`,
      withdrawn_by_guardian: ({ child, club }) => `Einwilligung für ${child} bei ${club} widerrufen`,
    },
    heading: {
      request: ({ child }) => `${child} braucht deine Einwilligung`,
      withdrawn_by_club: ({ child }) => `Einwilligung für ${child} widerrufen`,
      withdrawn_by_guardian: ({ child }) => `Einwilligung für ${child} widerrufen`,
    },
    intro: {
      request: ({ child, team, club }) => [
        `${club} möchte ${child} in der Mannschaft ${team} bei Anstoss aufnehmen. Weil ${child} unter 16 ist, brauchen wir deine Einwilligung als Erziehungsberechtigte:r.`,
        'Öffne Anstoss und melde dich mit dieser E-Mail-Adresse an. Unter „Einwilligungen“ kannst du zustimmen oder ablehnen.',
      ],
      withdrawn_by_club: ({ child, team, club }) => [
        `Ein:e Administrator:in von ${club} hat deine Einwilligung für ${child} (${team}) auf deinen schriftlichen Wunsch widerrufen. ${child} hat keinen Zugang mehr zur Mannschaft.`,
        'Falls du das nicht veranlasst hast, melde dich bitte direkt beim Verein oder bei uns.',
      ],
      withdrawn_by_guardian: ({ child, team }) => [
        `Du hast deine Einwilligung für ${child} (${team}) widerrufen. ${child} hat keinen Zugang mehr zur Mannschaft.`,
      ],
    },
    metaChild: 'Kind',
    metaTeam: 'Mannschaft',
    metaNote: 'Notiz des Vereins',
    footnote: {
      request: 'Du erhältst diese E-Mail, weil der Verein deine Adresse als Erziehungsberechtigte:r angegeben hat.',
      withdrawn_by_club: 'Diese Benachrichtigung wird bei jedem Widerruf durch den Verein verschickt.',
      withdrawn_by_guardian: 'Diese E-Mail bestätigt deinen Widerruf.',
    },
    footer: ({ club }) => `${club} · Anstoss`,
  },
  en: {
    subject: {
      request: ({ child, club }) => `${club}: consent needed for ${child}`,
      withdrawn_by_club: ({ child, club }) => `${club} withdrew the consent for ${child}`,
      withdrawn_by_guardian: ({ child, club }) => `Consent for ${child} at ${club} withdrawn`,
    },
    heading: {
      request: ({ child }) => `${child} needs your consent`,
      withdrawn_by_club: ({ child }) => `Consent for ${child} withdrawn`,
      withdrawn_by_guardian: ({ child }) => `Consent for ${child} withdrawn`,
    },
    intro: {
      request: ({ child, team, club }) => [
        `${club} wants to add ${child} to the ${team} team on Anstoss. Because ${child} is under 16, we need your consent as their parent or guardian.`,
        'Open Anstoss and sign in with this email address. Under “Consents” you can approve or decline.',
      ],
      withdrawn_by_club: ({ child, team, club }) => [
        `An admin at ${club} withdrew your consent for ${child} (${team}) on your written request. ${child} no longer has access to the team.`,
        'If you did not ask for this, please contact the club or us directly.',
      ],
      withdrawn_by_guardian: ({ child, team }) => [
        `You withdrew your consent for ${child} (${team}). ${child} no longer has access to the team.`,
      ],
    },
    metaChild: 'Child',
    metaTeam: 'Team',
    metaNote: 'Club note',
    footnote: {
      request: 'You received this because the club entered your address as the parent or guardian.',
      withdrawn_by_club: 'We send this notice every time a club records a withdrawal.',
      withdrawn_by_guardian: 'This email confirms your withdrawal.',
    },
    footer: ({ club }) => `${club} · Anstoss`,
  },
  fr: {
    subject: {
      request: ({ child, club }) => `${club} : consentement requis pour ${child}`,
      withdrawn_by_club: ({ child, club }) => `${club} a retiré le consentement pour ${child}`,
      withdrawn_by_guardian: ({ child, club }) => `Consentement pour ${child} chez ${club} retiré`,
    },
    heading: {
      request: ({ child }) => `${child} a besoin de ton consentement`,
      withdrawn_by_club: ({ child }) => `Consentement pour ${child} retiré`,
      withdrawn_by_guardian: ({ child }) => `Consentement pour ${child} retiré`,
    },
    intro: {
      request: ({ child, team, club }) => [
        `${club} souhaite ajouter ${child} à l’équipe ${team} sur Anstoss. Comme ${child} a moins de 16 ans, nous avons besoin de ton consentement en tant que parent ou tuteur.`,
        'Ouvre Anstoss et connecte-toi avec cette adresse e-mail. Dans « Consentements », tu peux accepter ou refuser.',
      ],
      withdrawn_by_club: ({ child, team, club }) => [
        `Un administrateur de ${club} a retiré ton consentement pour ${child} (${team}) à ta demande écrite. ${child} n’a plus accès à l’équipe.`,
        'Si tu n’as rien demandé, contacte directement le club ou notre équipe.',
      ],
      withdrawn_by_guardian: ({ child, team }) => [
        `Tu as retiré ton consentement pour ${child} (${team}). ${child} n’a plus accès à l’équipe.`,
      ],
    },
    metaChild: 'Enfant',
    metaTeam: 'Équipe',
    metaNote: 'Note du club',
    footnote: {
      request: 'Tu reçois cet e-mail parce que le club a indiqué ton adresse comme parent ou tuteur.',
      withdrawn_by_club: 'Cet avis est envoyé à chaque retrait enregistré par un club.',
      withdrawn_by_guardian: 'Cet e-mail confirme ton retrait.',
    },
    footer: ({ club }) => `${club} · Anstoss`,
  },
  it: {
    subject: {
      request: ({ child, club }) => `${club}: serve il consenso per ${child}`,
      withdrawn_by_club: ({ child, club }) => `${club} ha revocato il consenso per ${child}`,
      withdrawn_by_guardian: ({ child, club }) => `Consenso per ${child} presso ${club} revocato`,
    },
    heading: {
      request: ({ child }) => `${child} ha bisogno del tuo consenso`,
      withdrawn_by_club: ({ child }) => `Consenso per ${child} revocato`,
      withdrawn_by_guardian: ({ child }) => `Consenso per ${child} revocato`,
    },
    intro: {
      request: ({ child, team, club }) => [
        `${club} vuole aggiungere ${child} alla squadra ${team} su Anstoss. Poiché ${child} ha meno di 16 anni, serve il tuo consenso come genitore o tutore.`,
        'Apri Anstoss e accedi con questo indirizzo e-mail. In “Consensi” puoi approvare o rifiutare.',
      ],
      withdrawn_by_club: ({ child, team, club }) => [
        `Un amministratore di ${club} ha revocato il tuo consenso per ${child} (${team}) su tua richiesta scritta. ${child} non ha più accesso alla squadra.`,
        'Se non l’hai chiesto tu, contatta direttamente la società o il nostro team.',
      ],
      withdrawn_by_guardian: ({ child, team }) => [
        `Hai revocato il tuo consenso per ${child} (${team}). ${child} non ha più accesso alla squadra.`,
      ],
    },
    metaChild: 'Figlio/a',
    metaTeam: 'Squadra',
    metaNote: 'Nota della società',
    footnote: {
      request: 'Ricevi questa e-mail perché la società ha indicato il tuo indirizzo come genitore o tutore.',
      withdrawn_by_club: 'Inviamo questo avviso ogni volta che una società registra una revoca.',
      withdrawn_by_guardian: 'Questa e-mail conferma la tua revoca.',
    },
    footer: ({ club }) => `${club} · Anstoss`,
  },
  pt: {
    subject: {
      request: ({ child, club }) => `${club}: é necessário consentimento para ${child}`,
      withdrawn_by_club: ({ child, club }) => `${club} retirou o consentimento para ${child}`,
      withdrawn_by_guardian: ({ child, club }) => `Consentimento para ${child} no ${club} retirado`,
    },
    heading: {
      request: ({ child }) => `${child} precisa do teu consentimento`,
      withdrawn_by_club: ({ child }) => `Consentimento para ${child} retirado`,
      withdrawn_by_guardian: ({ child }) => `Consentimento para ${child} retirado`,
    },
    intro: {
      request: ({ child, team, club }) => [
        `O ${club} quer adicionar ${child} à equipa ${team} no Anstoss. Como ${child} tem menos de 16 anos, precisamos do teu consentimento como encarregado de educação.`,
        'Abre o Anstoss e inicia sessão com este endereço de e-mail. Em «Consentimentos» podes aprovar ou recusar.',
      ],
      withdrawn_by_club: ({ child, team, club }) => [
        `Um administrador do ${club} retirou o teu consentimento para ${child} (${team}) a teu pedido escrito. ${child} deixou de ter acesso à equipa.`,
        'Se não pediste isto, contacta diretamente o clube ou a nossa equipa.',
      ],
      withdrawn_by_guardian: ({ child, team }) => [
        `Retiraste o teu consentimento para ${child} (${team}). ${child} deixou de ter acesso à equipa.`,
      ],
    },
    metaChild: 'Criança',
    metaTeam: 'Equipa',
    metaNote: 'Nota do clube',
    footnote: {
      request: 'Recebes este e-mail porque o clube indicou o teu endereço como encarregado de educação.',
      withdrawn_by_club: 'Enviamos este aviso sempre que um clube regista uma retirada.',
      withdrawn_by_guardian: 'Este e-mail confirma a tua retirada.',
    },
    footer: ({ club }) => `${club} · Anstoss`,
  },
  tr: {
    subject: {
      request: ({ child, club }) => `${club}: ${child} için veli onayı gerekiyor`,
      withdrawn_by_club: ({ child, club }) => `${club}: ${child} için veli onayı geri çekildi`,
      withdrawn_by_guardian: ({ child, club }) => `${club}: ${child} için veli onayını geri çektin`,
    },
    heading: {
      request: ({ child }) => `${child} için onayın gerekiyor`,
      withdrawn_by_club: ({ child }) => `${child} için veli onayı geri çekildi`,
      withdrawn_by_guardian: ({ child }) => `${child} için veli onayı geri çekildi`,
    },
    intro: {
      request: ({ child, team, club }) => [
        `${club} kulübü, ${child} için Anstoss’ta ${team} takımına kayıt yapmak istiyor. 16 yaşından küçük oyuncular için veli olarak onayın gerekiyor.`,
        'Anstoss’u aç ve bu e-posta adresiyle giriş yap. “Veli onayları” bölümünden onaylayabilir ya da reddedebilirsin.',
      ],
      withdrawn_by_club: ({ child, team, club }) => [
        `${club} kulübünden bir yönetici, yazılı talebin üzerine ${child} (${team}) için verdiğin onayı geri çekti. Takıma erişim artık kapalı.`,
        'Böyle bir talepte bulunmadıysan lütfen doğrudan kulüple ya da bizimle iletişime geç.',
      ],
      withdrawn_by_guardian: ({ child, team }) => [
        `${child} (${team}) için verdiğin onayı geri çektin. Takıma erişim artık kapalı.`,
      ],
    },
    metaChild: 'Çocuk',
    metaTeam: 'Takım',
    metaNote: 'Kulübün notu',
    footnote: {
      request: 'Bu e-postayı, kulüp adresini veli olarak girdiği için aldın.',
      withdrawn_by_club: 'Bir kulüp onayı geri çektiğinde bu bildirimi her zaman gönderiyoruz.',
      withdrawn_by_guardian: 'Bu e-posta, onayı geri çektiğini teyit eder.',
    },
    footer: ({ club }) => `${club} · Anstoss`,
  },
}

export function buildConsentEmail(params: ConsentEmailParams): {
  subject: string
  html: string
  text: string
} {
  const t = STRINGS[params.locale] ?? STRINGS.de
  const child = params.childName.trim() || t.metaChild
  const intro = t.intro[params.kind]({ child, team: params.teamName, club: params.clubName })
  const note = params.kind === 'withdrawn_by_club' ? params.note?.trim() : null
  const { html, text } = renderEmail({
    clubName: params.clubName,
    primaryColor: params.primaryColor,
    badgeUrl: params.badgeUrl,
    preheader: intro[0],
    heading: t.heading[params.kind]({ child }),
    intro,
    meta: [
      { label: t.metaChild, value: child },
      { label: t.metaTeam, value: params.teamName },
      ...(note ? [{ label: t.metaNote, value: note }] : []),
    ],
    footnote: t.footnote[params.kind],
    footer: t.footer({ club: params.clubName }),
  })
  return { subject: t.subject[params.kind]({ child, club: params.clubName }), html, text }
}
