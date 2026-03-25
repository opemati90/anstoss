import { TeamGroupType } from '../types/roles'

export const DEFAULT_TEAM_GROUPS = [
  { type: TeamGroupType.SENIOR, displayName: 'Herren', sortOrder: 10 },
  { type: TeamGroupType.SENIOR, displayName: 'Damen', sortOrder: 20 },
  { type: TeamGroupType.YOUTH, displayName: 'A-Jugend', sortOrder: 30 },
  { type: TeamGroupType.YOUTH, displayName: 'B-Jugend', sortOrder: 40 },
  { type: TeamGroupType.YOUTH, displayName: 'C-Jugend', sortOrder: 50 },
  { type: TeamGroupType.YOUTH, displayName: 'D-Jugend', sortOrder: 60 },
  { type: TeamGroupType.YOUTH, displayName: 'E-Jugend', sortOrder: 70 },
  { type: TeamGroupType.YOUTH, displayName: 'F-Jugend', sortOrder: 80 },
  { type: TeamGroupType.MINI, displayName: 'G-Jugend', sortOrder: 90 },
  { type: TeamGroupType.MINI, displayName: 'Bambini', sortOrder: 100 },
] as const
