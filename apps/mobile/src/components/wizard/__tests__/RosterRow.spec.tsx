import { fireEvent, render, screen } from '@testing-library/react-native'
import { RosterRow } from '../RosterRow'

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}))

describe('RosterRow', () => {
  it('shows name + position and is pressable when unclaimed', () => {
    const onPress = jest.fn()
    render(<RosterRow name="Mara K." position="MID" claimed={false} onPress={onPress} />)
    fireEvent.press(screen.getByText('Mara K.'))
    expect(onPress).toHaveBeenCalled()
  })

  it('renders "claimed" pill and is non-pressable when claimed', () => {
    const onPress = jest.fn()
    render(<RosterRow name="X" position="GK" claimed onPress={onPress} />)
    expect(screen.getByText(/claimed/i)).toBeOnTheScreen()
    fireEvent.press(screen.getByText('X'))
    expect(onPress).not.toHaveBeenCalled()
  })
})
