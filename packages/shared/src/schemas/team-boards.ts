import { z } from 'zod'

// Redesign 2026-11, team and club boards (17 Spielerprofil, 18 Mehr).
// Contracts the mobile app already reads; the API side is tracked in
// docs/redesign/BACKEND_GAPS.md ("Contract for backend").

/**
 * The seven role toggles on the member profile ("Rollen in 1. Herren").
 * PLAYER / COACH / CAPTAIN / TEAM_MANAGER are per team; TREASURER, MEDIA_MANAGER
 * and BOARD are club-level (Kassenwart, Medienwart, Vorstand). Only Vorstand may change them.
 */
export const MEMBER_ROLE_KEYS = [
  'PLAYER',
  'CAPTAIN',
  'COACH',
  'TEAM_MANAGER',
  'TREASURER',
  'MEDIA_MANAGER',
  'BOARD',
] as const
export const memberRoleKeySchema = z.enum(MEMBER_ROLE_KEYS)
export type MemberRoleKey = z.infer<typeof memberRoleKeySchema>

/** Dues state as the profile shows it: "Aktuell", "Offen", "Überfällig". */
export const MEMBER_DUES_STATES = ['CURRENT', 'OPEN', 'OVERDUE'] as const
export type MemberDuesState = (typeof MEMBER_DUES_STATES)[number]

/**
 * GET /clubs/:clubId/teams/:teamId/members/:userId/profile — one bundle for
 * the member profile (board 17). Every block is nullable: the server leaves
 * out what the viewer may not see (dues: Kassenwart, Vorstand, the member).
 */
export const teamMemberProfileSchema = z.object({
  userId: z.string().min(1),
  roles: z.array(memberRoleKeySchema),
  /** ISO date the member joined this team ("seit 2023"). */
  memberSince: z.string().nullable(),
  season: z.string().max(16).nullable(),
  stats: z
    .object({
      appearances: z.number().int().min(0),
      goals: z.number().int().min(0),
      assists: z.number().int().min(0),
    })
    .nullable(),
  /** Last trainings, oldest → newest; true = attended. */
  attendance: z
    .object({
      items: z.array(z.boolean()).max(20),
      attended: z.number().int().min(0),
      total: z.number().int().min(0),
    })
    .nullable(),
  duesState: z.enum(MEMBER_DUES_STATES).nullable(),
  playerPass: z
    .object({
      number: z.string().max(40).nullable(),
      validUntil: z.string().nullable(),
    })
    .nullable(),
})
export type TeamMemberProfile = z.infer<typeof teamMemberProfileSchema>

/** PUT …/members/:userId/roles — Vorstand only; the full new set. */
export const updateMemberRolesSchema = z.object({
  roles: z.array(memberRoleKeySchema).max(MEMBER_ROLE_KEYS.length),
})
export type UpdateMemberRolesInput = z.infer<typeof updateMemberRolesSchema>

/**
 * GET /me/summary?clubId=&teamId= — the right-aligned values on Mehr
 * (board 18): "4 offen", "Platz 4", "3 neu", "SVS-7K2Q". Null when unknown.
 */
export const moreSummarySchema = z.object({
  /** Open dues the viewer handles (treasurer: club; member: own). */
  openDues: z.number().int().min(0).nullable(),
  tablePosition: z.number().int().min(1).nullable(),
  /** Free agents near the club who appeared since the viewer last looked. */
  newFreeAgents: z.number().int().min(0).nullable(),
  /** Short, human-readable team join code. */
  teamInviteCode: z.string().max(16).nullable(),
})
export type MoreSummary = z.infer<typeof moreSummarySchema>
