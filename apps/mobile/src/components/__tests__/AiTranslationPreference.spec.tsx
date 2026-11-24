import React from 'react'
import { Alert } from 'react-native'
import renderer, { act } from 'react-test-renderer'
import { AI_TRANSLATION_NOTICE_VERSION } from '@anstoss/shared'
import { AiTranslationPreference } from '../AiTranslationPreference'
import { aiTranslationCopy } from '../../i18n/aiTranslation'

const mockApi = jest.fn()
jest.mock('../../api/client', () => ({ api: (...args: unknown[]) => mockApi(...args) }))
jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}))
jest.mock('../../context/ClubThemeContext', () => ({
  useClubColors: () => ({ surface: '#fff', primary: '#0E3B2B', borderControl: '#ddd' }),
}))
jest.mock('../ui', () => ({
  Text: (props: any) => require('react').createElement(require('react-native').Text, props),
  Button: (props: any) => require('react').createElement(require('react-native').Pressable, props),
}))

const preference = (enabled: boolean, available = true) => ({
  enabled,
  available,
  noticeVersion: AI_TRANSLATION_NOTICE_VERSION,
})
describe('AI translation consent UI', () => {
  let tree: ReturnType<typeof renderer.create>
  let alert: jest.SpyInstance
  const toggle = () => tree.root.findAllByProps({ testID: 'ai-translation-switch' })[0]
  beforeEach(() => {
    jest.clearAllMocks()
    mockApi.mockResolvedValue(preference(false))
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
  })
  afterEach(() => {
    if (tree) act(() => tree.unmount())
    alert.mockRestore()
  })
  const mount = async () => {
    await act(async () => {
      tree = renderer.create(<AiTranslationPreference language="en" sessionToken="test-session" />)
    })
  }

  it('defaults off and never writes merely by opening settings', async () => {
    await mount()
    expect(toggle().props.value).toBe(false)
    expect(mockApi.mock.calls).toEqual([
      ['/me/ai-translation', { headers: { Authorization: 'Bearer test-session' } }],
    ])
  })
  it('requires explicit disclosure confirmation, then persists the exact notice version', async () => {
    await mount()
    act(() => toggle().props.onValueChange(true))
    expect(mockApi).toHaveBeenCalledTimes(1)
    expect(alert.mock.calls[0][1]).toContain('OpenAI')
    expect(alert.mock.calls[0][2][0]).toMatchObject({ style: 'cancel' })
    mockApi.mockResolvedValue(preference(true))
    await act(async () => alert.mock.calls[0][2][1].onPress())
    expect(mockApi).toHaveBeenLastCalledWith('/me/ai-translation', {
      method: 'PUT',
      body: { enabled: true, noticeVersion: AI_TRANSLATION_NOTICE_VERSION },
      headers: { Authorization: 'Bearer test-session' },
    })
    expect(toggle().props.value).toBe(true)
  })
  it('allows immediate revocation even when provider is unavailable', async () => {
    mockApi
      .mockResolvedValueOnce(preference(true, false))
      .mockResolvedValueOnce(preference(false, false))
    await mount()
    expect(toggle().props.disabled).toBe(false)
    await act(async () => toggle().props.onValueChange(false))
    expect(alert).not.toHaveBeenCalled()
    expect(mockApi).toHaveBeenLastCalledWith(
      '/me/ai-translation',
      expect.objectContaining({
        body: { enabled: false, noticeVersion: AI_TRANSLATION_NOTICE_VERSION },
      }),
    )
    expect(toggle().props.disabled).toBe(true)
  })
  it('shows an unknown state after a failed save and lets the user reload it', async () => {
    mockApi
      .mockResolvedValueOnce(preference(true))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(preference(false))
    await mount()
    await act(async () => toggle().props.onValueChange(false))
    expect(toggle().props.disabled).toBe(true)
    await act(async () =>
      tree.root.findAllByProps({ testID: 'ai-translation-retry' })[0].props.onPress(),
    )
    expect(toggle().props.value).toBe(false)
    expect(toggle().props.disabled).toBe(false)
  })
  it('does not write after a stale confirmation from a previous session', async () => {
    await mount()
    act(() => toggle().props.onValueChange(true))
    act(() => tree.unmount())
    await act(async () => alert.mock.calls[0][2][1].onPress())
    expect(mockApi).toHaveBeenCalledTimes(1)
  })
  it('provides complete disclosure and actions in all six languages', () => {
    expect(Object.keys(aiTranslationCopy)).toHaveLength(6)
    for (const copy of Object.values(aiTranslationCopy)) {
      expect(Object.keys(copy).sort()).toEqual(Object.keys(aiTranslationCopy.en).sort())
      expect(copy.disclosure).toContain('OpenAI')
      expect(copy.disclosure).toContain('30')
      expect(Object.values(copy).every((value) => value.trim().length > 0)).toBe(true)
    }
  })
})
