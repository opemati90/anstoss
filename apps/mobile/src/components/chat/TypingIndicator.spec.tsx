import { render } from '@testing-library/react-native'
import { TypingIndicator } from './TypingIndicator'

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, values: { name?: string; count?: number }) => key === 'chat.typing' ? `${values.name} is typing…` : `${values.count} people are typing…` }) }))
jest.mock('../../context/ClubThemeContext', () => ({ useClubColors: () => ({ surface: '#fff', textSecondary: '#5B675F' }) }))
jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => true }))

it('hides the bubble when nobody is typing', () => {
  expect(render(<TypingIndicator users={[]} />).queryByTestId('chat-typing-indicator')).toBeNull()
})

it('shows three dots and an accessible sender label', () => {
  const screen = render(<TypingIndicator users={['Mina']} />)
  expect(screen.getAllByTestId('chat-typing-dot', { includeHiddenElements: true })).toHaveLength(3)
  expect(screen.getByLabelText('Mina is typing…')).toBeTruthy()
})

it('labels multiple writers without pretending to know their draft', () => {
  expect(render(<TypingIndicator users={['Alex', 'Alex']} />).getByLabelText('2 people are typing…')).toBeTruthy()
})
