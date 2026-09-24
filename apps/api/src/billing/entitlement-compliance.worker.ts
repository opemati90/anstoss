import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { sendEmail } from '../email/mailer'
import { ClubEntitlementsService } from './club-entitlements.service'
import { INTL_LOCALE_TAG, resolveLocale, type Locale } from '../i18n/translations'

type OverQuotaCopy = {
  subject: (club: string) => string
  body: (p: { club: string; teams: number; players: number; ends: string }) => string
}

/** Over-quota notice to the club owner, in the owner's language. */
const OVER_QUOTA: Record<Locale, OverQuotaCopy> = {
  de: {
    subject: (club) => `${club}: Handlungsbedarf beim Anstoss-Tarif`,
    body: ({ club, teams, players, ends }) =>
      `${club} liegt über dem Limit deines Anstoss-Tarifs: ${teams} ${teams === 1 ? 'Mannschaft' : 'Mannschaften'} und ${players} ${players === 1 ? 'Spielerplatz' : 'Spielerplätze'} zu viel. Alle Daten bleiben erhalten. Archiviere überzählige Mannschaften oder Plätze oder wechsle den Tarif bis zum ${ends}. Solange der Verein über dem Limit liegt, sind neue Freischaltungen gesperrt.`,
  },
  en: {
    subject: (club) => `${club}: action needed for Anstoss plan limits`,
    body: ({ club, teams, players, ends }) =>
      `${club} is above its current Anstoss plan limit by ${teams} ${teams === 1 ? 'team' : 'teams'} and ${players} player ${players === 1 ? 'seat' : 'seats'}. Existing data stays available. Archive excess teams or seats, or change plan, by ${ends}. New activations are blocked while the club is over quota.`,
  },
  fr: {
    subject: (club) => `${club} : action requise sur les limites de ton offre Anstoss`,
    body: ({ club, teams, players, ends }) =>
      `${club} dépasse la limite de ton offre Anstoss de ${teams} ${teams === 1 ? 'équipe' : 'équipes'} et ${players} ${players === 1 ? 'place joueur' : 'places joueurs'}. Toutes les données restent disponibles. Archive les équipes ou places en trop, ou change d’offre, d’ici le ${ends}. Tant que le club dépasse la limite, les nouvelles activations sont bloquées.`,
  },
  it: {
    subject: (club) => `${club}: intervento necessario sui limiti del piano Anstoss`,
    body: ({ club, teams, players, ends }) =>
      `${club} supera il limite del tuo piano Anstoss di ${teams} ${teams === 1 ? 'squadra' : 'squadre'} e ${players} ${players === 1 ? 'posto giocatore' : 'posti giocatore'}. Tutti i dati restano disponibili. Archivia le squadre o i posti in eccesso, oppure cambia piano, entro il ${ends}. Finché il club supera il limite, le nuove attivazioni sono bloccate.`,
  },
  pt: {
    subject: (club) => `${club}: é preciso agir sobre os limites do plano Anstoss`,
    body: ({ club, teams, players, ends }) =>
      `O ${club} ultrapassa o limite do teu plano Anstoss em ${teams} ${teams === 1 ? 'equipa' : 'equipas'} e ${players} ${players === 1 ? 'lugar de jogador' : 'lugares de jogador'}. Todos os dados continuam disponíveis. Arquiva as equipas ou lugares a mais, ou muda de plano, até ${ends}. Enquanto o clube estiver acima do limite, as novas ativações ficam bloqueadas.`,
  },
  tr: {
    subject: (club) => `${club}: Anstoss paket sınırı için işlem gerekiyor`,
    body: ({ club, teams, players, ends }) =>
      `${club} kulübü Anstoss paket sınırını aşıyor: ${teams} takım ve ${players} oyuncu kontenjanı fazla. Tüm veriler korunuyor. Fazla takımları veya kontenjanları arşivle ya da paketini değiştir. Son tarih: ${ends}. Kulüp sınırın üzerinde kaldığı sürece yeni etkinleştirmeler engelli.`,
  },
}

const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000

@Injectable()
export class EntitlementComplianceWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EntitlementComplianceWorker.name)
  private timer: NodeJS.Timeout | null = null
  private running = false

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: ClubEntitlementsService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return
    this.timer = setInterval(() => void this.tick(), SWEEP_INTERVAL_MS)
    this.timer.unref?.()
    void this.tick()
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  async runCycle() {
    const clubs = await this.prisma.club.findMany({ select: { id: true, name: true } })
    let notified = 0
    for (const club of clubs) {
      try {
        const compliance = await this.entitlements.refreshCompliance(club.id)
        if (!compliance || compliance.status !== 'OVER_QUOTA' || compliance.notifiedAt) continue
        const owner = await this.prisma.membership.findFirst({
          where: { clubId: club.id, role: 'OWNER' },
          include: { user: { select: { email: true, preferredLanguage: true } } },
        })
        if (!owner?.user.email) continue
        // Owner's language + locale date (was English prose with a de-DE date).
        const locale = resolveLocale(owner.user.preferredLanguage)
        const ends = new Intl.DateTimeFormat(INTL_LOCALE_TAG[locale], {
          dateStyle: 'long',
          timeZone: 'Europe/Berlin',
        }).format(compliance.remediationEndsAt)
        const copy = OVER_QUOTA[locale]
        const message = copy.body({
          club: club.name,
          teams: compliance.excessTeams,
          players: compliance.excessPlayers,
          ends,
        })
        const sent = await sendEmail({
          to: owner.user.email,
          subject: copy.subject(club.name),
          text: message,
          html: `<p>${escapeHtml(message)}</p>`,
        })
        if (!sent) continue
        await this.prisma.clubPlanCompliance.updateMany({
          where: { id: compliance.id, status: 'OVER_QUOTA', notifiedAt: null },
          data: { notifiedAt: new Date() },
        })
        notified += 1
      } catch (error) {
        this.logger.warn(
          `Entitlement compliance failed for club ${club.id}: ${error instanceof Error ? error.message : 'unknown error'}`,
        )
      }
    }
    return { clubs: clubs.length, notified }
  }

  private async tick() {
    if (this.running) return
    this.running = true
    try {
      await this.runCycle()
    } finally {
      this.running = false
    }
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}
