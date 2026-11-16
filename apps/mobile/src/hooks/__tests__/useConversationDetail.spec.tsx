import { act, renderHook } from '@testing-library/react-native'
import { useConversationDetail } from '../useConversationDetail'
import { notifyAccessChanged } from '../../auth/accessChanges'
import { ApiError } from '../../api/client'

const mockChannel = jest.fn()
const mockDm = jest.fn()
let mockToken = 'session-a'
let mockUser = 'user-a'
const mockSeed = { id: 'channel', title: 'Old private group' }
jest.mock('../../api/chat', () => ({
  fetchChannelDetail: (...args: unknown[]) => mockChannel(...args),
  fetchConversationDetail: (...args: unknown[]) => mockDm(...args),
}))
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: mockUser }, token: mockToken, activeClub: { club: { id: 'club' } } }),
}))
jest.mock('../useInbox', () => ({ useInboxSnapshot: () => ({ items: [mockSeed] }) }))
const flush = async () => { await act(async () => { await Promise.resolve() }) }

describe('conversation detail access boundary', () => {
  beforeEach(() => { mockChannel.mockReset(); mockDm.mockReset(); mockToken = 'session-a'; mockUser = 'user-a' })

  it('invalidates an old response synchronously when access changes', async () => {
    let finishOld!: (data: unknown) => void
    let denyCurrent!: (error: unknown) => void
    mockChannel.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve }))
      .mockImplementationOnce(() => new Promise((_resolve, reject) => { denyCurrent = reject }))
    const { result } = renderHook(() => useConversationDetail('channel', 'channel'))
    await act(async () => {
      notifyAccessChanged()
      // Resolves in the same turn, before the replacement effect cleans up.
      finishOld({ id: 'channel', name: 'Private history', canWrite: true })
      await Promise.resolve()
    })
    expect(result.current.channel).toBeNull()
    expect(result.current.seed).toBeNull()
    expect(result.current.status).toBe('loading')
    await act(async () => { denyCurrent(new ApiError('Forbidden', 403)) })
    expect(result.current.status).toBe('forbidden')
    expect(result.current.channel).toBeNull()
    expect(result.current.seed).toBeNull()
  })

  it('masks cached details and seed throughout a replacement session request', async () => {
    mockChannel.mockResolvedValueOnce({ id: 'channel', name: 'Old group' })
      .mockImplementation(() => new Promise(() => {}))
    const { result, rerender } = renderHook(() => useConversationDetail('channel', 'channel'))
    await flush()
    expect(result.current.channel?.name).toBe('Old group')
    const oldPatch = result.current.patch
    mockToken = 'session-b'
    mockUser = 'user-b'
    rerender({})
    act(() => oldPatch({ name: 'Stale mutation' }))
    expect(result.current.channel).toBeNull()
    expect(result.current.seed).toBeNull()
  })

  it('clears a cached DM immediately on revocation and cannot restore it on a failed recheck', async () => {
    mockDm.mockResolvedValueOnce({ id: 'dm', otherUser: { id: 'peer', name: 'Private peer' } })
      .mockRejectedValueOnce(new Error('offline'))
    const { result } = renderHook(() => useConversationDetail('dm', 'dm'))
    await flush()
    expect(result.current.dm).not.toBeNull()
    await act(async () => notifyAccessChanged())
    expect(result.current.dm).toBeNull()
    expect(result.current.status).toBe('error')
  })
})
