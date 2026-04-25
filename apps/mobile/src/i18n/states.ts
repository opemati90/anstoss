export const statesEn = {
  common: {
    offline: "You're offline. Check your connection and try again.",
    unknownError: 'Something went wrong.',
    retry: 'Try again',
  },
  events: {
    empty: {
      title: 'No events yet',
      body: 'Coaches will post training sessions and matches here.',
      cta: 'Create the first event',
    },
    error: {
      title: "Couldn't load events",
      body: 'Pull to refresh or try again.',
      retry: 'Try again',
    },
  },
  pending_requests: {
    empty: {
      title: 'No pending requests',
      body: 'New join requests will show up here.',
    },
    error: {
      title: "Couldn't load requests",
      body: 'Pull to refresh or try again.',
      retry: 'Try again',
    },
  },
  admin_members: {
    empty: {
      title: 'No members yet',
      body: 'Invite your first member to get started.',
      cta: 'Invite a member',
    },
    error: {
      title: "Couldn't load members",
      body: 'Pull to refresh or try again.',
      retry: 'Try again',
    },
  },
  contributions: {
    empty: {
      title: 'No contributions yet',
      body: 'When your club sets up dues, they appear here.',
    },
    error: {
      title: "Couldn't load contributions",
      body: 'Pull to refresh or try again.',
      retry: 'Try again',
    },
  },
  team_matches: {
    empty: {
      title: 'No matches scheduled',
      body: 'Upcoming and recent matches will appear here.',
    },
    error: {
      title: "Couldn't load matches",
      body: 'Pull to refresh or try again.',
      retry: 'Try again',
    },
  },
  transfers: {
    empty: {
      title: 'No transfer listings',
      body: 'Clubs will post available or wanted players here.',
    },
    error: {
      title: "Couldn't load transfers",
      body: 'Pull to refresh or try again.',
      retry: 'Try again',
    },
  },
  dm: {
    empty: {
      title: 'No conversations yet',
      body: 'Start a direct message from a teammate or coach profile.',
      cta: 'Start a conversation',
    },
    error: {
      title: "Couldn't load messages",
      body: 'Pull to refresh or try again.',
      retry: 'Try again',
    },
  },
  errors: {
    api: {
      title: 'Something went wrong',
      network: 'Check your connection and try again.',
      offline: "You're offline. Reconnect and try again.",
      timeout: 'The request took too long. Try again.',
      rateLimit: 'Too many requests. Wait a moment and try again.',
      session: 'Your session expired. Please sign in again.',
      permission: "You don't have access to do that.",
      unavailable: 'Service temporarily unavailable. Try again shortly.',
      generic: 'Something went wrong. Try again.',
    },
  },
} as const

type Widen<T> = T extends string
  ? string
  : { [K in keyof T]: Widen<T[K]> }

export type StatesCopy = Widen<typeof statesEn>
