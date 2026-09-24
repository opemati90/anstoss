import { GUARDS_METADATA } from '@nestjs/common/constants'
import { AgeGateGuard } from '../auth/age-gate.guard'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { MessagesController } from '../messages/messages.controller'
import { TeamLookupController, TeamsController } from './teams.controller'

describe('team route age-gate wiring', () => {
  it('checks club-scoped team routes after authentication', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, TeamsController)).toEqual([
      ClerkAuthGuard,
      AgeGateGuard,
    ])
  })

  it('keeps code lookup available before the onboarding age check', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, TeamLookupController)).toEqual([
      ClerkAuthGuard,
    ])
  })

  it('checks legacy pinned-message routes before club content is returned', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, MessagesController)).toEqual([
      ClerkAuthGuard,
      AgeGateGuard,
    ])
  })
})
