import type { StatesCopy } from './states'

export const statesIt: StatesCopy = {
  common: {
    offline: 'Sei offline. Controlla la connessione e riprova.',
    unknownError: 'Qualcosa è andato storto.',
    retry: 'Riprova',
  },
  events: {
    empty: {
      title: 'Nessun evento ancora',
      body: "Allenamenti e partite appariranno qui non appena l'allenatore li crea.",
      cta: 'Crea il primo evento',
    },
    error: {
      title: 'Impossibile caricare gli eventi',
      body: 'Scorri verso il basso per aggiornare o riprova.',
      retry: 'Riprova',
    },
  },
  pending_requests: {
    empty: {
      title: 'Nessuna richiesta in sospeso',
      body: 'Le nuove richieste di accesso appariranno qui.',
    },
    error: {
      title: 'Impossibile caricare le richieste',
      body: 'Scorri verso il basso per aggiornare o riprova.',
      retry: 'Riprova',
    },
  },
  admin_members: {
    empty: {
      title: 'Nessun membro ancora',
      body: 'Invita il primo membro per iniziare.',
      cta: 'Invita un membro',
    },
    error: {
      title: 'Impossibile caricare i membri',
      body: 'Scorri verso il basso per aggiornare o riprova.',
      hint: 'Controlla la connessione o esci e accedi di nuovo.',
      retry: 'Riprova',
    },
  },
  contributions: {
    empty: {
      title: 'Nessun contributo ancora',
      body: 'Le quote impostate dal tuo club appariranno qui.',
    },
    error: {
      title: 'Impossibile caricare i contributi',
      body: 'Scorri verso il basso per aggiornare o riprova.',
      retry: 'Riprova',
    },
  },
  team_matches: {
    empty: {
      title: 'Nessuna partita in programma',
      body: 'Le prossime e le ultime partite appariranno qui.',
    },
    error: {
      title: 'Impossibile caricare le partite',
      body: 'Scorri verso il basso per aggiornare o riprova.',
      retry: 'Riprova',
    },
    noTeam: {
      title: 'Nessuna squadra selezionata',
      body: 'Unisciti o seleziona una squadra per vedere le partite.',
    },
  },
  transfers: {
    empty: {
      title: 'Nessun annuncio di mercato',
      body: 'I club pubblicano qui i giocatori disponibili o cercati.',
    },
    error: {
      title: 'Impossibile caricare i trasferimenti',
      body: 'Scorri verso il basso per aggiornare o riprova.',
      retry: 'Riprova',
    },
  },
  dm: {
    empty: {
      title: 'Nessuna conversazione ancora',
      body: 'Avvia un messaggio diretto dal profilo di un compagno o del tuo allenatore.',
      cta: 'Inizia una conversazione',
    },
    error: {
      title: 'Impossibile caricare i messaggi',
      body: 'Scorri verso il basso per aggiornare o riprova.',
      retry: 'Riprova',
    },
  },
  errors: {
    api: {
      title: 'Qualcosa è andato storto',
      network: 'Controlla la connessione e riprova.',
      offline: 'Sei offline. Riconnettiti e riprova.',
      timeout: 'La richiesta ha impiegato troppo tempo. Riprova.',
      rateLimit: 'Troppe richieste. Attendi un momento e riprova.',
      session: 'La tua sessione è scaduta. Accedi di nuovo.',
      permission: 'Non hai i permessi per eseguire questa azione.',
      unavailable: 'Servizio temporaneamente non disponibile. Riprova tra poco.',
      generic: 'Qualcosa è andato storto. Riprova.',
    },
  },
}
