import { fireEvent, render, screen } from '@testing-library/react-native'
import { ActionCard } from '../ActionCard'

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))

jest.mock('../../../context/ClubThemeContext', () => ({
  useClubColors: () => ({ primary: '#0050ff', primary50: '#dde7ff' }),
}))

describe('ActionCard', () => {
  it('renders title and body and routes onPress', () => {
    const onPress = jest.fn()
    render(
      <ActionCard
        eyebrow="next event"
        title="Match vs FC X"
        body="Saturday 14:00"
        onPress={onPress}
      />,
    )
    expect(screen.getByText(/Match vs FC X/)).toBeOnTheScreen()
    expect(screen.getByText(/Saturday 14:00/)).toBeOnTheScreen()
    expect(screen.getByText(/NEXT EVENT/)).toBeOnTheScreen()
    fireEvent.press(screen.getByLabelText(/Match vs FC X. Saturday 14:00/))
    expect(onPress).toHaveBeenCalled()
  })

  it('renders selectable actions and reports the selected one via a11y state', () => {
    const yes = jest.fn()
    const no = jest.fn()
    render(
      <ActionCard
        title="Are you in?"
        actions={[
          { id: 'yes', label: 'Yes', onPress: yes, selected: true },
          { id: 'no', label: 'No', onPress: no },
        ]}
      />,
    )
    fireEvent.press(screen.getByLabelText('No'))
    expect(no).toHaveBeenCalled()
    expect(screen.getByLabelText('Yes').props.accessibilityState.selected).toBe(true)
    expect(screen.getByLabelText('No').props.accessibilityState.selected).toBeFalsy()
  })
})
