import type { StatesCopy } from './states'

export const statesDe: StatesCopy = {
  common: {
    offline: 'Du bist offline. Bitte prüfe deine Verbindung und versuche es erneut.',
    unknownError: 'Etwas ist schiefgelaufen.',
    retry: 'Erneut versuchen',
  },
  events: {
    empty: {
      title: 'Noch keine Events',
      body: 'Trainings und Spiele erscheinen hier, sobald der Trainer sie anlegt.',
      cta: 'Erstes Event erstellen',
    },
    error: {
      title: 'Events konnten nicht geladen werden',
      body: 'Zum Aktualisieren ziehen oder erneut versuchen.',
      retry: 'Erneut versuchen',
    },
  },
  pending_requests: {
    empty: {
      title: 'Keine offenen Anfragen',
      body: 'Neue Beitrittsanfragen erscheinen hier.',
    },
    error: {
      title: 'Anfragen konnten nicht geladen werden',
      body: 'Zum Aktualisieren ziehen oder erneut versuchen.',
      retry: 'Erneut versuchen',
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
      body: 'Zum Aktualisieren ziehen oder erneut versuchen.',
      retry: 'Erneut versuchen',
    },
  },
  contributions: {
    empty: {
      title: 'Noch keine Beiträge',
      body: 'Sobald dein Verein Beiträge einrichtet, erscheinen sie hier.',
    },
    error: {
      title: 'Beiträge konnten nicht geladen werden',
      body: 'Zum Aktualisieren ziehen oder erneut versuchen.',
      retry: 'Erneut versuchen',
    },
  },
  team_matches: {
    empty: {
      title: 'Keine Spiele geplant',
      body: 'Kommende und vergangene Spiele erscheinen hier.',
    },
    error: {
      title: 'Spiele konnten nicht geladen werden',
      body: 'Zum Aktualisieren ziehen oder erneut versuchen.',
      retry: 'Erneut versuchen',
    },
  },
  transfers: {
    empty: {
      title: 'Keine Transfereinträge',
      body: 'Vereine posten hier verfügbare oder gesuchte Spieler.',
    },
    error: {
      title: 'Transfers konnten nicht geladen werden',
      body: 'Zum Aktualisieren ziehen oder erneut versuchen.',
      retry: 'Erneut versuchen',
    },
  },
  dm: {
    empty: {
      title: 'Noch keine Unterhaltungen',
      body: 'Starte eine Direktnachricht aus dem Profil eines Teammitglieds oder Trainers.',
      cta: 'Unterhaltung starten',
    },
    error: {
      title: 'Nachrichten konnten nicht geladen werden',
      body: 'Zum Aktualisieren ziehen oder erneut versuchen.',
      retry: 'Erneut versuchen',
    },
  },
  errors: {
    api: {
      title: 'Etwas ist schiefgelaufen',
      network: 'Verbindung prüfen und erneut versuchen.',
      offline: 'Du bist offline. Stelle die Verbindung wieder her und versuche es erneut.',
      timeout: 'Die Anfrage hat zu lange gedauert. Bitte erneut versuchen.',
      rateLimit: 'Zu viele Anfragen. Bitte kurz warten und erneut versuchen.',
      session: 'Deine Sitzung ist abgelaufen. Bitte erneut anmelden.',
      permission: 'Du hast keine Berechtigung dafür.',
      unavailable: 'Dienst vorübergehend nicht verfügbar. Bitte gleich erneut versuchen.',
      generic: 'Etwas ist schiefgelaufen. Bitte erneut versuchen.',
    },
  },
}
