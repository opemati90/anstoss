import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

const SUPPORTED = new Set(['de', 'en', 'fr', 'pt', 'it', 'tr', 'ar'])
const DEFAULT_TARGET = 'de'

type Surface = 'channel' | 'dm'

@Injectable()
export class TranslationService {
  private readonly logger = new Logger(TranslationService.name)
  private readonly baseUrl = process.env.LIBRETRANSLATE_URL?.replace(/\/$/, '')
  private readonly apiKey = process.env.LIBRETRANSLATE_API_KEY?.trim() || null

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Public-facing helper: given a message + reader's locale, returns the
   * translated content if the reader's locale differs from the message
   * source language, else null. Uses cache; populates cache on miss.
   * Failures are swallowed — chat must never break because translate is down.
   */
  async translateForReader(
    surface: Surface,
    messageId: string,
    sourceLanguage: string | null,
    content: string,
    targetLanguage: string,
  ): Promise<{ content: string; sourceLanguage: string } | null> {
    if (!this.baseUrl) return null
    if (!content || content.trim().length === 0) return null
    const target = this.normalize(targetLanguage)
    if (!target) return null

    let source = sourceLanguage ? this.normalize(sourceLanguage) : null
    if (!source) {
      source = await this.detect(content)
      if (source) {
        await this.persistDetectedSource(surface, messageId, source).catch(() => undefined)
      }
    }
    if (!source) return null
    if (source === target) return null

    const cached = await this.readCached(surface, messageId, target)
    if (cached) return { content: cached, sourceLanguage: source }

    const translated = await this.translate(content, source, target)
    if (!translated) return null

    await this.writeCached(surface, messageId, target, translated).catch(() => undefined)
    return { content: translated, sourceLanguage: source }
  }

  /**
   * Detect language for a brand-new message. Used by gateway as soon as the
   * message is persisted so subsequent reads find sourceLanguage already set.
   */
  async detectAndPersistSource(
    surface: Surface,
    messageId: string,
    content: string,
  ): Promise<string | null> {
    if (!this.baseUrl) return null
    const detected = await this.detect(content)
    if (!detected) return null
    await this.persistDetectedSource(surface, messageId, detected).catch(() => undefined)
    return detected
  }

  /**
   * Translate-target chooser:
   *   1. User's stored preferredLanguage (set when they pick a language)
   *   2. The Accept-Language header from the request (set on every mobile request)
   *   3. German (Anstoss is German-first)
   */
  resolveTargetLanguage(
    storedPreference: string | null | undefined,
    acceptLanguageHeader: string | null | undefined,
  ): string {
    const stored = this.normalize(storedPreference)
    if (stored) return stored
    if (acceptLanguageHeader) {
      // Accept-Language: "de-DE,de;q=0.9,en-US;q=0.8" — walk in order
      const tags = acceptLanguageHeader
        .split(',')
        .map((t) => t.split(';')[0]?.trim())
        .filter(Boolean) as string[]
      for (const tag of tags) {
        const head = this.normalize(tag)
        if (head) return head
      }
    }
    return DEFAULT_TARGET
  }

  // ── Internals ──────────────────────────────────────────────────────────

  private normalize(value: string | null | undefined): string | null {
    if (!value) return null
    const head = value.split(/[-_]/)[0]?.toLowerCase()
    return head && SUPPORTED.has(head) ? head : null
  }

  private async detect(text: string): Promise<string | null> {
    try {
      const body = new URLSearchParams({ q: text.slice(0, 500) })
      if (this.apiKey) body.set('api_key', this.apiKey)
      const res = await fetch(`${this.baseUrl}/detect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      })
      if (!res.ok) return null
      const data = (await res.json()) as Array<{ language: string; confidence: number }>
      const top = data?.[0]
      if (!top) return null
      const norm = this.normalize(top.language)
      return norm
    } catch (err) {
      this.logger.warn(`detect failed: ${(err as Error).message}`)
      return null
    }
  }

  private async translate(
    text: string,
    source: string,
    target: string,
  ): Promise<string | null> {
    try {
      const body = new URLSearchParams({
        q: text,
        source,
        target,
        format: 'text',
      })
      if (this.apiKey) body.set('api_key', this.apiKey)
      const res = await fetch(`${this.baseUrl}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      })
      if (!res.ok) return null
      const data = (await res.json()) as { translatedText?: string }
      return typeof data?.translatedText === 'string' && data.translatedText.length > 0
        ? data.translatedText
        : null
    } catch (err) {
      this.logger.warn(`translate failed: ${(err as Error).message}`)
      return null
    }
  }

  private async readCached(
    surface: Surface,
    messageId: string,
    target: string,
  ): Promise<string | null> {
    if (surface === 'channel') {
      const row = await this.prisma.messageTranslation.findUnique({
        where: { messageId_targetLanguage: { messageId, targetLanguage: target } },
        select: { content: true },
      })
      return row?.content ?? null
    }
    const row = await this.prisma.directMessageTranslation.findUnique({
      where: {
        directMessageId_targetLanguage: { directMessageId: messageId, targetLanguage: target },
      },
      select: { content: true },
    })
    return row?.content ?? null
  }

  private async writeCached(
    surface: Surface,
    messageId: string,
    target: string,
    content: string,
  ): Promise<void> {
    if (surface === 'channel') {
      await this.prisma.messageTranslation.upsert({
        where: { messageId_targetLanguage: { messageId, targetLanguage: target } },
        create: { messageId, targetLanguage: target, content },
        update: { content },
      })
      return
    }
    await this.prisma.directMessageTranslation.upsert({
      where: {
        directMessageId_targetLanguage: { directMessageId: messageId, targetLanguage: target },
      },
      create: { directMessageId: messageId, targetLanguage: target, content },
      update: { content },
    })
  }

  private async persistDetectedSource(
    surface: Surface,
    messageId: string,
    source: string,
  ): Promise<void> {
    if (surface === 'channel') {
      await this.prisma.message.update({
        where: { id: messageId },
        data: { sourceLanguage: source },
      })
      return
    }
    await this.prisma.directMessage.update({
      where: { id: messageId },
      data: { sourceLanguage: source },
    })
  }
}
