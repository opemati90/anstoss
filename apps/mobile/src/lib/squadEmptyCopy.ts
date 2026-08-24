type SquadBucket = 'ACTIVE' | 'TRIAL' | 'INACTIVE'

export function getSquadEmptyCopy(bucket: SquadBucket, canManage: boolean) {
  if (bucket === 'TRIAL') {
    return {
      title: 'No trial players',
      body: canManage
        ? 'Players invited for a trial will appear here.'
        : 'Your coach has not added any trial players.',
    }
  }
  if (bucket === 'INACTIVE') {
    return {
      title: 'No inactive players',
      body: canManage
        ? 'Players you deactivate will remain available here.'
        : 'There are no inactive players in this squad.',
    }
  }
  return canManage
    ? {
        title: 'Build your squad',
        body: 'Invite players or let them claim an open roster slot.',
      }
    : {
        title: 'No players to show yet',
        body: 'Your coach is still setting up this squad.',
      }
}
