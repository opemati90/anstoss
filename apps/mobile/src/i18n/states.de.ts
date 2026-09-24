import type { StatesCopy } from './states'

export const statesDe: StatesCopy = {
  common: {
    offline: 'Du bist offline. Prüf deine Verbindung und versuch es noch mal.',
    unknownError: 'Etwas ist schiefgelaufen.',
    retry: 'Noch mal versuchen',
  },
  home: {
    error: {
      title: 'Deine Woche konnte nicht geladen werden',
      body: 'Prüf deine Verbindung und zieh die Seite nach unten, um es noch mal zu versuchen.',
    },
    stale: 'Du siehst den letzten gespeicherten Stand. Zum Aktualisieren nach unten ziehen.',
  },
  events: {
    empty: {
      title: 'Noch keine Termine',
      body: 'Trainings und Spiele erscheinen hier, sobald dein Trainer sie anlegt.',
      cta: 'Ersten Termin anlegen',
    },
    error: {
      title: 'Termine konnten nicht geladen werden',
      body: 'Zieh zum Aktualisieren nach unten oder versuch es noch mal.',
      retry: 'Noch mal versuchen',
    },
  },
  pending_requests: {
    empty: {
      title: 'Keine offenen Anfragen',
      body: 'Neue Beitrittsanfragen erscheinen hier.',
    },
    error: {
      title: 'Anfragen konnten nicht geladen werden',
      body: 'Zieh zum Aktualisieren nach unten oder versuch es noch mal.',
      retry: 'Noch mal versuchen',
    },
  },
  admin_members: {
    empty: {
      title: 'Noch keine Mitglieder',
      body: 'Lade das erste Mitglied ein, um loszulegen.',
      cta: 'Mitglied einladen',
    },
    error: {
      title: 'Mitglieder konnten nicht geladen werden',
      body: 'Zieh zum Aktualisieren nach unten oder versuch es noch mal.',
      hint: 'Prüf deine Verbindung oder melde dich ab und wieder an.',
      retry: 'Noch mal versuchen',
    },
  },
  contributions: {
    empty: {
      title: 'Noch keine Beiträge',
      body: 'Sobald dein Verein Beiträge einrichtet, erscheinen sie hier.',
    },
    error: {
      title: 'Beiträge konnten nicht geladen werden',
      body: 'Zieh zum Aktualisieren nach unten oder versuch es noch mal.',
      retry: 'Noch mal versuchen',
    },
  },
  team_matches: {
    empty: {
      title: 'Keine Spiele angesetzt',
      body: 'Hier erscheinen kommende und vergangene Spiele.',
    },
    error: {
      title: 'Spiele konnten nicht geladen werden',
      body: 'Zieh zum Aktualisieren nach unten oder versuch es noch mal.',
      retry: 'Noch mal versuchen',
    },
    noTeam: {
      title: 'Kein Team ausgewählt',
      body: 'Tritt einem Team bei oder wähl eins aus, um den Spielplan zu sehen.',
    },
  },
  transfers: {
    empty: {
      title: 'Keine Wechselanzeigen',
      body: 'Hier zeigen Vereine, welche Spieler sie suchen, und vereinslose Spieler bieten sich an.',
    },
    error: {
      title: 'Wechselanzeigen konnten nicht geladen werden',
      body: 'Zieh zum Aktualisieren nach unten oder versuch es noch mal.',
      retry: 'Noch mal versuchen',
    },
  },
  dm: {
    empty: {
      title: 'Noch keine Unterhaltungen',
      body: 'Schreib jemandem aus deinem Team oder deinem Trainer direkt über das Profil.',
      cta: 'Unterhaltung starten',
    },
    error: {
      title: 'Nachrichten konnten nicht geladen werden',
      body: 'Zieh zum Aktualisieren nach unten oder versuch es noch mal.',
      retry: 'Noch mal versuchen',
    },
  },
  errors: {
    api: {
      title: 'Etwas ist schiefgelaufen',
      network: 'Prüf deine Verbindung und versuch es noch mal.',
      offline: 'Du bist offline. Stell die Verbindung wieder her und versuch es noch mal.',
      timeout: 'Das hat zu lange gedauert. Versuch es noch mal.',
      rateLimit: 'Zu viele Anfragen. Warte kurz und versuch es dann noch mal.',
      session: 'Deine Sitzung ist abgelaufen. Bitte melde dich neu an.',
      permission: 'Dafür fehlt dir die Berechtigung.',
      unavailable: 'Der Dienst ist gerade nicht erreichbar. Versuch es gleich noch mal.',
      generic: 'Etwas ist schiefgelaufen. Versuch es noch mal.',
    },
  },
}
