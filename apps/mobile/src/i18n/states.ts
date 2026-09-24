export const statesEn = {
  common: {
    offline: "You're offline. Check your connection and try again.",
    unknownError: 'Something went wrong.',
    retry: 'Try again',
  },
  home: {
    error: {
      title: 'Couldn\'t load your week',
      body: 'Check your connection and pull down to try again.',
    },
    stale: 'Showing the last saved version. Pull down to refresh.',
  },
  events: {
    empty: {
      title: 'No events yet',
      body: 'Training sessions and matches appear here once your coach adds them.',
      cta: 'Add the first event',
    },
    error: {
      title: "Couldn't load events",
      body: 'Pull down to refresh or try again.',
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
      body: 'Pull down to refresh or try again.',
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
      body: 'Pull down to refresh or try again.',
      hint: 'Check your connection or sign out and back in.',
      retry: 'Try again',
    },
  },
  contributions: {
    empty: {
      title: 'No fees yet',
      body: 'Once your club sets up membership fees, they appear here.',
    },
    error: {
      title: "Couldn't load fees",
      body: 'Pull down to refresh or try again.',
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
      body: 'Pull down to refresh or try again.',
      retry: 'Try again',
    },
    noTeam: {
      title: 'No team selected',
      body: 'Join or pick a team to see its fixtures.',
    },
  },
  transfers: {
    empty: {
      title: 'No transfer listings',
      body: 'Clubs post the players they are looking for here, and free agents offer themselves.',
    },
    error: {
      title: "Couldn't load transfers",
      body: 'Pull down to refresh or try again.',
      retry: 'Try again',
    },
  },
  dm: {
    empty: {
      title: 'No conversations yet',
      body: 'Message a teammate or your coach directly from their profile.',
      cta: 'Start a conversation',
    },
    error: {
      title: "Couldn't load messages",
      body: 'Pull down to refresh or try again.',
      retry: 'Try again',
    },
  },
  errors: {
    api: {
      title: 'Something went wrong',
      network: 'Check your connection and try again.',
      offline: "You're offline. Reconnect and try again.",
      timeout: 'That took too long. Please try again.',
      rateLimit: 'Too many requests. Wait a moment and try again.',
      session: 'Your session has expired. Please sign in again.',
      permission: "You don't have access to do that.",
      unavailable: 'The service is temporarily unavailable. Please try again shortly.',
      generic: 'Something went wrong. Please try again.',
    },
  },
} as const

type Widen<T> = T extends string
  ? string
  : { [K in keyof T]: Widen<T[K]> }

export type StatesCopy = Widen<typeof statesEn>
