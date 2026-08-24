type SquadBucket = 'ACTIVE' | 'TRIAL' | 'INACTIVE'

export function getSquadEmptyCopy(bucket: SquadBucket, canManage: boolean) {
  if (bucket === 'TRIAL') {
    return {
      titleKey: 'squad.empty.trialTitle',
      bodyKey: canManage ? 'squad.empty.trialManagerBody' : 'squad.empty.trialMemberBody',
      title: 'No trial players',
      body: canManage
        ? 'Players invited for a trial will appear here.'
        : 'Your coach has not added any trial players.',
    }
  }
  if (bucket === 'INACTIVE') {
    return {
      titleKey: 'squad.empty.inactiveTitle',
      bodyKey: canManage
        ? 'squad.empty.inactiveManagerBody'
        : 'squad.empty.inactiveMemberBody',
      title: 'No inactive players',
      body: canManage
        ? 'Players you deactivate will remain available here.'
        : 'There are no inactive players in this squad.',
    }
  }
  return canManage
    ? {
        titleKey: 'squad.empty.title',
        bodyKey: 'squad.empty.body',
        title: 'Build your squad',
        body: 'Invite players or let them claim an open roster slot.',
      }
    : {
        titleKey: 'squad.empty.memberTitle',
        bodyKey: 'squad.empty.memberBody',
        title: 'No players to show yet',
        body: 'Your coach is still setting up this squad.',
      }
}
