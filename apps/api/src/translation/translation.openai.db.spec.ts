import { randomUUID } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service'
import { tenantContext } from '../prisma/tenant.context'
import { TranslationService } from './translation.service'
import { TranslationController } from './translation.controller'
import { AI_TRANSLATION_NOTICE_VERSION } from '@anstoss/shared'

const url = process.env.ANSTOSS_STUDIO_TEST_DATABASE_URL
if (url && (new URL(url).hostname !== '127.0.0.1' || !new URL(url).pathname.endsWith('_test')))
  throw new Error('Translation tests require an isolated local *_test database')

;(url ? describe : describe.skip)(
  'OpenAI translation: PostgreSQL cache and real tenant middleware',
  () => {
    const originalEnv = { ...process.env }
    let db: PrismaService
    let clubId: string
    let userId: string
    let messageId: string
    let dmId: string
    let ai: { isEnabled: jest.Mock; generate: jest.Mock }
    let service: TranslationService
    const asClub = <T>(fn: () => Promise<T>) =>
      tenantContext.run({ clubId, userId }, async () => await fn())

    beforeAll(async () => {
      process.env.CHAT_TRANSLATION_ENABLED = 'true'
      process.env.CHAT_TRANSLATION_PROVIDER = 'openai'
      db = new PrismaService({ datasources: { db: { url: url! } } })
      await db.onModuleInit()
      userId = (
        await db.user.create({
          data: {
            name: 'Synthetic translation QA',
            aiTranslationConsentAt: new Date('2026-01-01'),
          },
        })
      ).id
      clubId = (
        await db.club.create({
          data: { name: 'Translation QA', slug: `translation-${randomUUID()}` },
        })
      ).id
      await asClub(async () => {
        const group = await db.teamGroup.create({
          data: { clubId, type: 'SENIOR', displayName: 'QA' },
        })
        const team = await db.team.create({
          data: { clubId, groupId: group.id, name: 'QA', displayName: 'QA' },
        })
        messageId = (
          await db.message.create({
            data: { clubId, teamId: team.id, senderId: userId, content: 'Hello' },
          })
        ).id
      })
      const conversation = await db.conversation.create({ data: { clubId } })
      dmId = (
        await db.directMessage.create({
          data: { conversationId: conversation.id, senderId: userId, content: 'Hello' },
        })
      ).id
      ai = {
        isEnabled: jest.fn().mockReturnValue(true),
        generate: jest
          .fn()
          .mockResolvedValue(JSON.stringify({ sourceLanguage: 'en', translation: 'Hallo' })),
      }
      service = new TranslationService(db, ai as never)
    })
    afterAll(async () => {
      process.env = { ...originalEnv }
      if (clubId) await db.club.delete({ where: { id: clubId } })
      if (userId) await db.user.delete({ where: { id: userId } })
      await db.$disconnect()
    })
    it.each(['channel', 'dm'] as const)(
      'persists %s source/cache outside request tenant context; fresh instance reads cache',
      async (surface) => {
        const id = surface === 'channel' ? messageId : dmId
        ai.generate.mockClear()
        expect(await service.translateForReader(surface, id, null, 'Hello', 'de', userId)).toEqual({
          content: 'Hallo',
          sourceLanguage: 'en',
        })
        expect(
          await new TranslationService(db, ai as never).translateForReader(
            surface,
            id,
            null,
            'Hello',
            'de',
            userId,
          ),
        ).toEqual({ content: 'Hallo', sourceLanguage: 'en' })
        expect(ai.generate).toHaveBeenCalledTimes(1)
      },
    )
    it('ignores stale stored source/cache after editing into another language', async () => {
      await asClub(() =>
        db.message.update({
          where: { id: messageId },
          data: { content: 'Guten Morgen', editedAt: new Date() },
        }),
      )
      ai.generate.mockResolvedValue(
        JSON.stringify({ sourceLanguage: 'de', translation: 'Good morning' }),
      )
      expect(
        await service.translateForReader('channel', messageId, 'en', 'Guten Morgen', 'en', userId),
      ).toEqual({ content: 'Good morning', sourceLanguage: 'de' })
      const saved = await db.messageTranslation.findUniqueOrThrow({
        where: { messageId_targetLanguage: { messageId, targetLanguage: 'en' } },
      })
      expect(saved.originalHash).toHaveLength(64)
      expect(saved.sourceLanguage).toBe('de')
    })
    it('does not re-create translations when deletion races an in-flight response', async () => {
      ai.generate.mockImplementationOnce(async () => {
        await asClub(() =>
          db.message.update({
            where: { id: messageId },
            data: { deletedAt: new Date(), content: '' },
          }),
        )
        await db.messageTranslation.deleteMany({ where: { messageId } })
        return JSON.stringify({ sourceLanguage: 'de', translation: 'Bonjour' })
      })
      expect(
        await service.translateForReader('channel', messageId, 'de', 'Guten Morgen', 'fr', userId),
      ).toBeNull()
      expect(await db.messageTranslation.count({ where: { messageId } })).toBe(0)
    })
    it('persists revocation, uses the database cutoff and excludes old messages after re-enabling', async () => {
      const controller = new TranslationController(db, service)
      const notice = { noticeVersion: AI_TRANSLATION_NOTICE_VERSION }
      expect(
        await controller.setPreference({ id: userId }, { ...notice, enabled: false }),
      ).toMatchObject({ enabled: false })
      ai.generate.mockClear()
      expect(await service.translateForReader('dm', dmId, null, 'Hello', 'de', userId)).toBeNull()
      expect(
        await controller.setPreference({ id: userId }, { ...notice, enabled: true }),
      ).toMatchObject({ enabled: true })
      const first = await db.user.findUniqueOrThrow({ where: { id: userId } })
      await controller.setPreference({ id: userId }, { ...notice, enabled: true })
      const second = await db.user.findUniqueOrThrow({ where: { id: userId } })
      expect(second.aiTranslationConsentAt).toEqual(first.aiTranslationConsentAt)
      expect(await service.translateForReader('dm', dmId, null, 'Hello', 'de', userId)).toBeNull()
      expect(ai.generate).not.toHaveBeenCalled()
    })
  },
)
