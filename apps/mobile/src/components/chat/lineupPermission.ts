type CoachingAccess = {
  role: string
  status?: string | null
  team: { id: string }
}

/** Pass only the authenticated user's access rows for the conversation's club. */
export function canShareChatLineup(
  accesses: readonly CoachingAccess[] | undefined,
  kind: 'dm' | 'channel',
  teamId: string | null,
): boolean {
  return (
    accesses?.some(
      (access) =>
        (kind === 'dm' || access.team.id === teamId) &&
        (access.status == null || access.status === 'ACTIVE') &&
        (access.role === 'HEAD_COACH' || access.role === 'ASSISTANT_COACH'),
    ) ?? false
  )
}
