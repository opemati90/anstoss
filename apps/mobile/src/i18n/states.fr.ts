import type { StatesCopy } from './states'

export const statesFr: StatesCopy = {
  common: {
    offline: 'Tu es hors ligne. Vérifie ta connexion et réessaie.',
    unknownError: 'Une erreur est survenue.',
    retry: 'Réessayer',
  },
  home: {
    error: {
      title: 'Impossible de charger ta semaine',
      body: 'Vérifie ta connexion et tire vers le bas pour réessayer.',
    },
    stale: 'Dernières données enregistrées. Tire vers le bas pour actualiser.',
  },
  events: {
    empty: {
      title: 'Aucun événement pour l’instant',
      body: 'Les entraînements et les matchs apparaîtront ici dès que l’entraîneur les aura créés.',
      cta: 'Créer le premier événement',
    },
    error: {
      title: 'Impossible de charger les événements',
      body: 'Tire vers le bas pour actualiser ou réessaie.',
      retry: 'Réessayer',
    },
  },
  pending_requests: {
    empty: {
      title: 'Aucune demande en attente',
      body: 'Les nouvelles demandes d’adhésion apparaîtront ici.',
    },
    error: {
      title: 'Impossible de charger les demandes',
      body: 'Tire vers le bas pour actualiser ou réessaie.',
      retry: 'Réessayer',
    },
  },
  admin_members: {
    empty: {
      title: 'Aucun membre pour l’instant',
      body: 'Invite ton premier membre pour commencer.',
      cta: 'Inviter un membre',
    },
    error: {
      title: 'Impossible de charger les membres',
      body: 'Tire vers le bas pour actualiser ou réessaie.',
      hint: 'Vérifie ta connexion ou déconnecte-toi et reconnecte-toi.',
      retry: 'Réessayer',
    },
  },
  contributions: {
    empty: {
      title: 'Aucune cotisation pour l’instant',
      body: 'Dès que ton club aura configuré les cotisations, elles apparaîtront ici.',
    },
    error: {
      title: 'Impossible de charger les cotisations',
      body: 'Tire vers le bas pour actualiser ou réessaie.',
      retry: 'Réessayer',
    },
  },
  team_matches: {
    empty: {
      title: 'Aucun match prévu',
      body: 'Les matchs à venir et passés apparaîtront ici.',
    },
    error: {
      title: 'Impossible de charger les matchs',
      body: 'Tire vers le bas pour actualiser ou réessaie.',
      retry: 'Réessayer',
    },
    noTeam: {
      title: 'Aucune équipe sélectionnée',
      body: 'Rejoins ou sélectionne une équipe pour voir les matchs.',
    },
  },
  transfers: {
    empty: {
      title: 'Aucune annonce',
      body: 'Les clubs publient ici les joueurs disponibles et les joueurs recherchés.',
    },
    error: {
      title: 'Impossible de charger les annonces',
      body: 'Tire vers le bas pour actualiser ou réessaie.',
      retry: 'Réessayer',
    },
  },
  dm: {
    empty: {
      title: 'Aucune conversation pour l’instant',
      body: 'Lance un message privé depuis le profil d’un coéquipier ou d’un entraîneur.',
      cta: 'Démarrer une conversation',
    },
    error: {
      title: 'Impossible de charger les messages',
      body: 'Tire vers le bas pour actualiser ou réessaie.',
      retry: 'Réessayer',
    },
  },
  errors: {
    api: {
      title: 'Une erreur est survenue',
      network: 'Vérifie ta connexion et réessaie.',
      offline: 'Tu es hors ligne. Reconnecte-toi et réessaie.',
      timeout: 'Le serveur met trop de temps à répondre. Réessaie.',
      rateLimit: 'Trop de tentatives. Patiente un instant et réessaie.',
      session: 'Ta session a expiré. Reconnecte-toi.',
      permission: 'Tu n’as pas les droits pour faire ça.',
      unavailable: 'Service temporairement indisponible. Réessaie dans un instant.',
      generic: 'Une erreur est survenue. Réessaie.',
    },
  },
}
