/** Development-only integration fixture; never points at an external host. */
export function isSimulatorFixtureRoute(isDev: boolean, enabled: string | undefined, hasSession: boolean, path: string): boolean {
  const pathname = path.split('?')[0]
  const event = /^\/clubs\/club-e2e-sv-albatros\/events\/event-match-away(?:\/(?:rsvp|rsvp-summary|attendance))?$/.test(pathname)
  const join = /^\/clubs\/club-e2e-sv-albatros\/join-requests(?:\/[A-Za-z0-9_-]+\/approve)?$/.test(pathname)
  return isDev && enabled === '1' && hasSession && (event || join || pathname === '/me/join-requests/active' || pathname === '/me')
}

export function withoutAuthorization(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).filter(([key]) => key.toLowerCase() !== 'authorization'))
}
