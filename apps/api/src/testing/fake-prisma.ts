/**
 * Test helper: a tiny in-memory Prisma stand-in that EVALUATES where clauses
 * instead of returning canned rows, so a spec fails when a query filters on
 * the wrong club, team, status or date. Unknown operators throw.
 *
 * Supports: findMany/findFirst/findUnique(+OrThrow)/count/create/update/
 * updateMany/delete/deleteMany/upsert, $transaction(fn), $executeRaw (lock
 * calls are recorded in `locks`). Relation filters (`{ rel: { is: {...} } }`,
 * `{ rel: {...} }`, `{ rel: { some: {...} } }`) use the `relations` map.
 * `select`/`include` are ignored except that included/selected relations are
 * attached one level deep.
 */
type Row = Record<string, any>
export type Relation = { model: string; from: string; to: string; many?: boolean }
export type Relations = Record<string, Record<string, Relation>>

const OPS = new Set(['in', 'notIn', 'not', 'lt', 'lte', 'gt', 'gte', 'equals', 'mode', 'contains'])

export function createFakePrisma(seed: Record<string, Row[]>, relations: Relations = {}) {
  const tables: Record<string, Row[]> = {}
  for (const [k, rows] of Object.entries(seed)) tables[k] = rows.map((r) => ({ ...r }))
  const locks: string[] = []
  let seq = 0

  const table = (model: string) => (tables[model] ??= [])

  const isNullSentinel = (v: any) =>
    v && typeof v === 'object' && !(v instanceof Date) && /Null$/.test(v.constructor?.name ?? '')

  function cmp(value: any, cond: any): boolean {
    if (isNullSentinel(cond)) cond = null
    if (cond instanceof Date) return value instanceof Date && value.getTime() === cond.getTime()
    if (cond === null || typeof cond !== 'object' || Array.isArray(cond)) {
      return value instanceof Date && cond instanceof Date ? value.getTime() === cond.getTime() : value === cond
    }
    const insensitive = cond.mode === 'insensitive'
    if (Array.isArray(cond.path)) {
      value = cond.path.reduce((current: any, key: string) => current?.[key], value)
      const { path: _path, ...rest } = cond
      return cmp(value, rest)
    }
    const norm = (v: any) => (insensitive && typeof v === 'string' ? v.toLowerCase() : v)
    const time = (v: any) => (v instanceof Date ? v.getTime() : v)
    for (const [op, arg] of Object.entries(cond)) {
      if (!OPS.has(op)) throw new Error(`fake-prisma: unsupported operator ${op}`)
      if (op === 'mode') continue
      if (op === 'equals' && norm(value) !== norm(arg)) return false
      if (op === 'in' && !(arg as any[]).map(norm).includes(norm(value))) return false
      if (op === 'notIn' && (arg as any[]).map(norm).includes(norm(value))) return false
      if (op === 'not' && cmp(value, arg)) return false
      if (op === 'contains' && !(typeof value === 'string' && value.includes(arg as string))) return false
      if (['lt', 'lte', 'gt', 'gte'].includes(op)) {
        if (value === null || value === undefined) return false
        const a = time(value)
        const b = time(arg)
        if (op === 'lt' && !(a < b)) return false
        if (op === 'lte' && !(a <= b)) return false
        if (op === 'gt' && !(a > b)) return false
        if (op === 'gte' && !(a >= b)) return false
      }
    }
    return true
  }

  function related(model: string, row: Row, rel: Relation): Row[] {
    return table(rel.model).filter((r) => r[rel.to] === row[rel.from])
  }

  function matches(model: string, row: Row, where: any): boolean {
    if (!where) return true
    for (const [key, cond] of Object.entries(where)) {
      if (cond === undefined) continue
      if (key === 'AND') {
        if (!(cond as any[]).every((c) => matches(model, row, c))) return false
        continue
      }
      if (key === 'OR') {
        if (!(cond as any[]).some((c) => matches(model, row, c))) return false
        continue
      }
      if (key === 'NOT') {
        if (matches(model, row, cond)) return false
        continue
      }
      const rel = relations[model]?.[key]
      if (rel) {
        const rows = related(model, row, rel)
        const c = cond as any
        if (c && typeof c === 'object' && 'some' in c) {
          if (!rows.some((r) => matches(rel.model, r, c.some))) return false
        } else {
          const inner = c && typeof c === 'object' && 'is' in c ? c.is : c
          if (inner === null) {
            if (rows.length > 0) return false
          } else if (!rows.some((r) => matches(rel.model, r, inner))) return false
        }
        continue
      }
      // Compound unique key, e.g. userId_clubId: { userId, clubId }.
      if (key.includes('_') && cond && typeof cond === 'object' && !(cond instanceof Date) &&
        !Object.keys(cond).some((k) => OPS.has(k))) {
        if (!matches(model, row, cond)) return false
        continue
      }
      if (!cmp(row[key] ?? null, cond)) return false
    }
    return true
  }

  function attach(model: string, row: Row, args: any): Row {
    const shape = args?.include ?? args?.select
    if (!shape) return { ...row }
    const out: Row = { ...row }
    for (const [key, val] of Object.entries(shape)) {
      const rel = relations[model]?.[key]
      if (!rel || !val) continue
      const rows = related(model, row, rel).map((r) =>
        attach(rel.model, r, typeof val === 'object' ? val : undefined),
      )
      out[key] = rel.many ? rows : rows[0] ?? null
    }
    return out
  }

  function applyData(row: Row, data: Row) {
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue
      // Prisma.DbNull / JsonNull sentinels store SQL/JSON null.
      row[k] = isNullSentinel(v) ? null : v
    }
    row.updatedAt = new Date()
  }

  function order(rows: Row[], orderBy: any) {
    if (!orderBy) return rows
    const specs = Array.isArray(orderBy) ? orderBy : [orderBy]
    return [...rows].sort((a, b) => {
      for (const spec of specs) {
        const [field, dirRaw] = Object.entries(spec)[0] as [string, any]
        const dir = typeof dirRaw === 'object' ? dirRaw.sort : dirRaw
        const av = a[field] instanceof Date ? a[field].getTime() : a[field]
        const bv = b[field] instanceof Date ? b[field].getTime() : b[field]
        if (av === bv) continue
        if (av === null || av === undefined) return 1
        if (bv === null || bv === undefined) return -1
        return (av < bv ? -1 : 1) * (dir === 'desc' ? -1 : 1)
      }
      return 0
    })
  }

  function delegate(model: string) {
    const find = (args: any = {}) =>
      order(table(model).filter((r) => matches(model, r, args.where)), args.orderBy)
    return {
      findMany: jest.fn(async (args: any = {}) =>
        find(args)
          .slice(0, args.take ?? undefined)
          .map((r) => attach(model, r, args)),
      ),
      findFirst: jest.fn(async (args: any = {}) => {
        const r = find(args)[0]
        return r ? attach(model, r, args) : null
      }),
      findUnique: jest.fn(async (args: any = {}) => {
        const r = find(args)[0]
        return r ? attach(model, r, args) : null
      }),
      findUniqueOrThrow: jest.fn(async (args: any = {}) => {
        const r = find(args)[0]
        if (!r) throw new Error(`${model} not found`)
        return attach(model, r, args)
      }),
      count: jest.fn(async (args: any = {}) => find(args).length),
      create: jest.fn(async (args: any) => {
        const row = { id: args.data.id ?? `${model}-${++seq}`, createdAt: new Date(), ...args.data }
        table(model).push(row)
        return attach(model, row, args)
      }),
      update: jest.fn(async (args: any) => {
        const row = find(args)[0]
        if (!row) throw new Error(`${model} not found`)
        applyData(row, args.data)
        return attach(model, row, args)
      }),
      updateMany: jest.fn(async (args: any) => {
        const rows = find(args)
        rows.forEach((r) => applyData(r, args.data))
        return { count: rows.length }
      }),
      delete: jest.fn(async (args: any) => {
        const row = find(args)[0]
        tables[model] = table(model).filter((r) => r !== row)
        return row
      }),
      deleteMany: jest.fn(async (args: any = {}) => {
        const rows = new Set(find(args))
        tables[model] = table(model).filter((r) => !rows.has(r))
        return { count: rows.size }
      }),
      upsert: jest.fn(async (args: any) => {
        const row = find(args)[0]
        if (row) {
          applyData(row, args.update)
          return row
        }
        const created = { id: `${model}-${++seq}`, ...args.create }
        table(model).push(created)
        return created
      }),
    }
  }

  const client: any = new Proxy(
    {
      tables,
      locks,
      $executeRaw: jest.fn(async (strings: any, ...values: any[]) => {
        const text = Array.isArray(strings) ? strings.join('?') : String(strings?.strings?.join('?') ?? strings)
        const vals = Array.isArray(strings) ? values : (strings?.values ?? [])
        locks.push(`${text}|${vals.join(',')}`)
        return 1
      }),
      $transaction: jest.fn(async (fn: any) => (typeof fn === 'function' ? fn(client) : Promise.all(fn))),
    },
    {
      get(target: any, prop: string) {
        if (prop in target) return target[prop]
        if (typeof prop !== 'string' || prop.startsWith('$') || prop === 'then') return undefined
        target[prop] = delegate(prop)
        return target[prop]
      },
    },
  )
  return client as {
    tables: Record<string, Row[]>
    locks: string[]
    [model: string]: any
  }
}

/** Relations used by the privacy/safeguarding specs. */
export const PRIVACY_RELATIONS: Relations = {
  rsvp: { event: { model: 'event', from: 'eventId', to: 'id' } },
  carpoolSeat: { ride: { model: 'carpoolRide', from: 'rideId', to: 'id' } },
  carpoolRide: { event: { model: 'event', from: 'eventId', to: 'id' } },
  channelMember: { channel: { model: 'channel', from: 'channelId', to: 'id' } },
  membership: { user: { model: 'user', from: 'userId', to: 'id' } },
  messageReport: {
    message: { model: 'message', from: 'messageId', to: 'id' },
    reporter: { model: 'user', from: 'reporterUserId', to: 'id' },
  },
  message: { sender: { model: 'user', from: 'senderId', to: 'id' } },
  directMessageReport: {
    directMessage: { model: 'directMessage', from: 'directMessageId', to: 'id' },
    reporter: { model: 'user', from: 'reporterUserId', to: 'id' },
  },
  directMessage: {
    conversation: { model: 'conversation', from: 'conversationId', to: 'id' },
    sender: { model: 'user', from: 'senderId', to: 'id' },
  },
  parentalConsent: {
    club: { model: 'club', from: 'clubId', to: 'id' },
    team: { model: 'team', from: 'teamId', to: 'id' },
    player: { model: 'user', from: 'playerUserId', to: 'id' },
  },
}

/** A DOB that makes the person `years` old today (birthday a month ago). */
export function dobForAge(years: number, today = new Date()): Date {
  const d = new Date(today)
  d.setFullYear(d.getFullYear() - years)
  d.setMonth(d.getMonth() - 1)
  return d
}
