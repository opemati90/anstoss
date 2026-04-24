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
}
