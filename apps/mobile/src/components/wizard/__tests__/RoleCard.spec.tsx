import { fireEvent, render, screen } from '@testing-library/react-native'
import { RoleCard } from '../RoleCard'

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}))

describe('RoleCard', () => {
  it('renders title and body and fires onPress', () => {
    const onPress = jest.fn()
    render(<RoleCard iconName="football" title="I play" body="Join my team's roster" onPress={onPress} />)
    expect(screen.getByText('I play')).toBeOnTheScreen()
    expect(screen.getByText("Join my team's roster")).toBeOnTheScreen()
    fireEvent.press(screen.getByText('I play'))
    expect(onPress).toHaveBeenCalled()
  })
})
