/**
 * Chat revamp test helper: a tiny in-memory Prisma stand-in that EVALUATES
 * where clauses (equality, in/notIn/not, comparisons, contains, AND/OR/NOT,
 * relation filters some/none/every/is) instead of resolving any input. Specs
 * built on it fail when a query forgets a scope (clubId, channelId, ...),
 * which a `mockResolvedValue` never catches.
 *
 * Only what the chat specs need is implemented; unknown operators throw so a
 * spec never silently passes on an unsupported filter.
 */
type Row = Record<string, any>

export type RelationDef =
  | { kind: 'one'; model: string; from: string; to?: string }
  | { kind: 'many'; model: string; from?: string; to: string }

export type FakeSchema = Record<string, Record<string, RelationDef>>

let idCounter = 0

function isPlainObject(value: unknown): value is Row {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  )
}

/** Prisma.DbNull / JsonNull / AnyNull sentinels compare as SQL NULL here. */
function isPrismaNull(value: unknown): boolean {
  const name = (value as { constructor?: { name?: string } } | null)?.constructor?.name ?? ''
  return /^(DbNull|JsonNull|AnyNull)$/.test(name) || /NullTypes/.test(String(value))
}

function cmp(a: unknown, b: unknown): number {
  const av = a instanceof Date ? a.getTime() : (a as number)
  const bv = b instanceof Date ? b.getTime() : (b as number)
  return av < bv ? -1 : av > bv ? 1 : 0
}

function eq(a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date) {
    return a != null && b != null && cmp(a, b) === 0
  }
  return a === b
}

export class FakePrisma {
  readonly tables: Record<string, Row[]> = {}
  queryRawResult: unknown[] = []
  readonly calls: Array<{ model: string; op: string; args: unknown }> = []

  constructor(
    private readonly schema: FakeSchema,
    seed: Record<string, Row[]> = {},
  ) {
    for (const model of Object.keys(schema)) this.tables[model] = []
    for (const [model, rows] of Object.entries(seed)) {
      this.tables[model] = rows.map((r) => ({ ...r }))
    }
    for (const model of Object.keys(this.tables)) {
      ;(this as any)[model] = this.delegate(model)
    }
  }

  $transaction = async (arg: unknown) => {
    if (typeof arg === 'function') return (arg as (tx: FakePrisma) => unknown)(this)
    return Promise.all(arg as Array<Promise<unknown>>)
  }
  $executeRaw = async () => 0
  $queryRaw = async (query?: TemplateStringsArray) =>
    query?.join('').includes('clock_timestamp() AS now') ? [{ now: new Date() }] : this.queryRawResult

  rows(model: string): Row[] {
    return this.tables[model] ?? []
  }

  private relation(model: string, row: Row, name: string): Row | Row[] | null | undefined {
    const def = this.schema[model]?.[name]
    if (!def) return undefined
    const target = this.rows(def.model)
    if (def.kind === 'one') {
      const key = row[def.from]
      if (key == null) return null
      return target.find((r) => r[def.to ?? 'id'] === key) ?? null
    }
    const key = row[def.from ?? 'id']
    return target.filter((r) => r[def.to] === key)
  }

  matches(model: string, row: Row, where: Row | undefined): boolean {
    if (!where) return true
    for (const [key, cond] of Object.entries(where)) {
      if (cond === undefined) continue
      if (key === 'AND') {
        const list = Array.isArray(cond) ? cond : [cond]
        if (!list.every((w) => this.matches(model, row, w))) return false
        continue
      }
      if (key === 'OR') {
        if (!(cond as Row[]).some((w) => this.matches(model, row, w))) return false
        continue
      }
      if (key === 'NOT') {
        const list = Array.isArray(cond) ? cond : [cond]
        if (list.some((w) => this.matches(model, row, w))) return false
        continue
      }
      const def = this.schema[model]?.[key]
      if (def) {
        if (!this.matchRelation(def, this.relation(model, row, key), cond as Row)) return false
        continue
      }
      if (!this.matchScalar(row[key], cond)) return false
    }
    return true
  }

  private matchRelation(def: RelationDef, value: Row | Row[] | null | undefined, cond: Row) {
    if (def.kind === 'many') {
      const list = (value as Row[]) ?? []
      if ('some' in cond) return list.some((r) => this.matches(def.model, r, cond.some))
      if ('none' in cond) return !list.some((r) => this.matches(def.model, r, cond.none))
      if ('every' in cond) return list.every((r) => this.matches(def.model, r, cond.every))
      throw new Error(`FakePrisma: unsupported to-many filter ${Object.keys(cond)}`)
    }
    const one = value as Row | null
    if ('is' in cond) return cond.is === null ? !one : !!one && this.matches(def.model, one, cond.is)
    if ('isNot' in cond) {
      return cond.isNot === null ? !!one : !one || !this.matches(def.model, one, cond.isNot)
    }
    return !!one && this.matches(def.model, one, cond)
  }

  private matchScalar(value: unknown, cond: unknown): boolean {
    if (cond === null || isPrismaNull(cond)) return value === null || value === undefined
    if (!isPlainObject(cond)) return eq(value, cond)
    for (const [op, arg] of Object.entries(cond)) {
      switch (op) {
        case 'equals':
          if (!eq(value, arg)) return false
          break
        case 'in':
          if (!(arg as unknown[]).some((a) => eq(value, a))) return false
          break
        case 'notIn':
          if ((arg as unknown[]).some((a) => eq(value, a))) return false
          break
        case 'not':
          if (arg === null || isPrismaNull(arg) ? value == null : isPlainObject(arg) ? this.matchScalar(value, arg) : eq(value, arg)) {
            return false
          }
          break
        case 'gt':
          if (value == null || cmp(value, arg) <= 0) return false
          break
        case 'gte':
          if (value == null || cmp(value, arg) < 0) return false
          break
        case 'lt':
          if (value == null || cmp(value, arg) >= 0) return false
          break
        case 'lte':
          if (value == null || cmp(value, arg) > 0) return false
          break
        case 'contains': {
          const insensitive = (cond as Row).mode === 'insensitive'
          const hay = String(value ?? '')
          if (!(insensitive ? hay.toLowerCase().includes(String(arg).toLowerCase()) : hay.includes(String(arg)))) {
            return false
          }
          break
        }
        case 'startsWith':
          if (typeof value !== 'string' || typeof arg !== 'string' || !value.startsWith(arg)) return false
          break
        case 'mode':
          break
        default:
          throw new Error(`FakePrisma: unsupported operator ${op}`)
      }
    }
    return true
  }

  /** Flatten composite unique keys ({ channelId_userId: { ... } }). */
  private uniqueWhere(model: string, where: Row): Row {
    const out: Row = {}
    for (const [key, value] of Object.entries(where)) {
      if (isPlainObject(value) && key.includes('_') && !this.schema[model]?.[key]) {
        Object.assign(out, value)
      } else out[key] = value
    }
    return out
  }

  private shape(model: string, row: Row, args: Row | undefined): Row {
    const projection = (args?.select ?? args?.include) as Row | undefined
    const base: Row = args?.select ? {} : { ...row }
    if (!projection) return base
    for (const [key, spec] of Object.entries(projection)) {
      if (!spec) continue
      const def = this.schema[model]?.[key]
      if (!def) {
        base[key] = row[key]
        continue
      }
      const nested = isPlainObject(spec) ? spec : undefined
      const value = this.relation(model, row, key)
      if (def.kind === 'many') {
        let list = ((value as Row[]) ?? []).filter((r) => this.matches(def.model, r, nested?.where))
        list = this.order(list, nested?.orderBy)
        if (typeof nested?.take === 'number') list = list.slice(0, nested.take)
        base[key] = list.map((r) => this.shape(def.model, r, nested))
      } else {
        base[key] = value ? this.shape(def.model, value as Row, nested) : null
      }
    }
    return base
  }

  private order(list: Row[], orderBy: unknown): Row[] {
    if (!orderBy) return list
    const specs = (Array.isArray(orderBy) ? orderBy : [orderBy]) as Row[]
    return [...list].sort((a, b) => {
      for (const spec of specs) {
        const [key, dir] = Object.entries(spec)[0]
        if (typeof dir !== 'string') continue
        const d = cmp(a[key] ?? '', b[key] ?? '')
        if (d !== 0) return dir === 'desc' ? -d : d
      }
      return 0
    })
  }

  private delegate(model: string) {
    const table = () => this.tables[model]
    const log = (op: string, args: unknown) => this.calls.push({ model, op, args })
    const findMany = async (args: Row = {}) => {
      log('findMany', args)
      let list = table().filter((r) => this.matches(model, r, args.where))
      list = this.order(list, args.orderBy)
      if (typeof args.take === 'number') list = list.slice(0, args.take)
      return list.map((r) => this.shape(model, r, args))
    }
    const findFirst = async (args: Row = {}) => (await findMany({ ...args, take: 1 }))[0] ?? null
    const create = async (args: Row) => {
      log('create', args)
      const row = { id: args.data.id ?? `${model}-${++idCounter}`, createdAt: new Date(), updatedAt: new Date(), ...args.data }
      table().push(row)
      return this.shape(model, row, args)
    }
    return {
      findMany,
      findFirst,
      findUnique: async (args: Row) =>
        findFirst({ ...args, where: this.uniqueWhere(model, args.where) }),
      findUniqueOrThrow: async (args: Row) => {
        const row = await findFirst({ ...args, where: this.uniqueWhere(model, args.where) })
        if (!row) throw new Error(`${model} not found`)
        return row
      },
      count: async (args: Row = {}) => table().filter((r) => this.matches(model, r, args.where)).length,
      create,
      createMany: async (args: Row) => {
        log('createMany', args)
        for (const data of args.data as Row[]) table().push({ id: `${model}-${++idCounter}`, createdAt: new Date(), ...data })
        return { count: (args.data as Row[]).length }
      },
      update: async (args: Row) => {
        log('update', args)
        const row = table().find((r) => this.matches(model, r, this.uniqueWhere(model, args.where)))
        if (!row) throw new Error(`${model} not found for update`)
        Object.assign(row, args.data)
        return this.shape(model, row, args)
      },
      updateMany: async (args: Row) => {
        log('updateMany', args)
        const list = table().filter((r) => this.matches(model, r, args.where))
        list.forEach((r) => Object.assign(r, args.data))
        return { count: list.length }
      },
      upsert: async (args: Row) => {
        log('upsert', args)
        const row = table().find((r) => this.matches(model, r, this.uniqueWhere(model, args.where)))
        if (row) {
          Object.assign(row, args.update)
          return row
        }
        return create({ data: args.create })
      },
      deleteMany: async (args: Row = {}) => {
        log('deleteMany', args)
        const keep = table().filter((r) => !this.matches(model, r, args.where))
        const count = table().length - keep.length
        this.tables[model] = keep
        return { count }
      },
    }
  }
}

/** Relations of the chat models used by the channel / DM specs. */
export const CHAT_FAKE_SCHEMA: FakeSchema = {
  user: {
    memberships: { kind: 'many', model: 'membership', to: 'userId' },
    teamAccess: { kind: 'many', model: 'teamAccess', to: 'userId' },
  },
  membership: { user: { kind: 'one', model: 'user', from: 'userId' } },
  team: {},
  teamAccess: {
    user: { kind: 'one', model: 'user', from: 'userId' },
  },
  guardianRelationship: {
    player: { kind: 'one', model: 'user', from: 'playerUserId' },
  },
  parentalConsent: {},
  channel: {
    members: { kind: 'many', model: 'channelMember', to: 'channelId' },
    messages: { kind: 'many', model: 'message', to: 'channelId' },
    team: { kind: 'one', model: 'team', from: 'teamId' },
  },
  channelMember: {
    channel: { kind: 'one', model: 'channel', from: 'channelId' },
    user: { kind: 'one', model: 'user', from: 'userId' },
  },
  message: {
    sender: { kind: 'one', model: 'user', from: 'senderId' },
    channel: { kind: 'one', model: 'channel', from: 'channelId' },
  },
  conversation: {
    participants: { kind: 'many', model: 'conversationParticipant', to: 'conversationId' },
    messages: { kind: 'many', model: 'directMessage', to: 'conversationId' },
  },
  conversationParticipant: {
    conversation: { kind: 'one', model: 'conversation', from: 'conversationId' },
    user: { kind: 'one', model: 'user', from: 'userId' },
  },
  directMessage: {
    conversation: { kind: 'one', model: 'conversation', from: 'conversationId' },
    sender: { kind: 'one', model: 'user', from: 'senderId' },
    replyTo: { kind: 'one', model: 'directMessage', from: 'replyToId' },
    reactions: { kind: 'many', model: 'directMessageReaction', to: 'directMessageId' },
    reports: { kind: 'many', model: 'directMessageReport', to: 'directMessageId' },
  },
  directMessageReaction: {},
  directMessageReport: {},
  userBlock: {},
  event: {
    team: { kind: 'one', model: 'team', from: 'teamId' },
  },
}

/** Birth date `years` years (plus a margin) before now, so fixtures never age out. */
export function yearsAgo(years: number, now = new Date()): Date {
  const d = new Date(now)
  d.setUTCFullYear(d.getUTCFullYear() - years)
  d.setUTCDate(d.getUTCDate() - 30)
  return d
}
