import { PREVIEW_STANDIN_ENABLED } from '../../launchFeatures'
import { getViewAsState, resetViewAs, startPreview, setActingSession } from './store'

const mockWriteBlocker = jest.fn()
jest.mock('../../api/client', () => ({ setWriteBlocker: (...args: unknown[]) => mockWriteBlocker(...args) }))

it('keeps preview and stand-in disabled without blocking normal writes', () => {
  resetViewAs()
  mockWriteBlocker.mockClear()
  expect(PREVIEW_STANDIN_ENABLED).toBe(false)
  startPreview('PLAYER', { id: 'team', name: 'Team', clubId: 'club' })
  setActingSession({ id: 'stale', clubId: 'club' } as never)
  expect(getViewAsState()).toEqual({ preview: null, acting: null })
  expect(mockWriteBlocker).not.toHaveBeenCalled()
})
