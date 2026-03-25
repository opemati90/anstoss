import React from 'react'
import renderer from 'react-test-renderer'
import { TouchableOpacity, Text } from 'react-native'
import { EventFilter } from '../EventFilter'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'eventFilter.all': 'All',
        'eventFilter.training': 'Training',
        'eventFilter.match': 'Match',
        'eventFilter.other': 'Other',
      }
      return map[key] ?? key
    },
  }),
}))

jest.mock('../../context/ClubThemeContext', () => ({
  useClubColors: () => ({ clubPrimary: '#D50000' }),
}))

function collectText(node: any): string {
  if (!node.children) return ''
  return node.children
    .map((c: any) => (typeof c === 'string' ? c : collectText(c)))
    .join('')
}

function getChips(root: any) {
  return root.root.findAllByType(TouchableOpacity)
}

describe('EventFilter', () => {
  it('renders four filter chips', () => {
    const tree = renderer.create(
      <EventFilter selectedType="ALL" onTypeChange={jest.fn()} />,
    )

    const chips = getChips(tree)
    expect(chips).toHaveLength(4)

    const labels = chips.map((chip: any) =>
      chip.findAllByType(Text).map((t: any) => collectText(t)).join(''),
    )
    expect(labels).toEqual(['All', 'Training', 'Match', 'Other'])
  })

  it('calls onTypeChange when a chip is pressed', () => {
    const onTypeChange = jest.fn()
    const tree = renderer.create(
      <EventFilter selectedType="ALL" onTypeChange={onTypeChange} />,
    )

    const chips = getChips(tree)
    const matchChip = chips[2] // MATCH is the third chip
    matchChip.props.onPress()

    expect(onTypeChange).toHaveBeenCalledWith('MATCH')
  })

  it('applies active styling to the selected chip', () => {
    const tree = renderer.create(
      <EventFilter selectedType="TRAINING" onTypeChange={jest.fn()} />,
    )

    const chips = getChips(tree)
    const trainingChip = chips[1]
    const flatStyle = Array.isArray(trainingChip.props.style)
      ? Object.assign({}, ...trainingChip.props.style.filter(Boolean))
      : trainingChip.props.style

    expect(flatStyle.backgroundColor).toBe('#D50000')
  })

  it('does not apply active styling to non-selected chips', () => {
    const tree = renderer.create(
      <EventFilter selectedType="TRAINING" onTypeChange={jest.fn()} />,
    )

    const chips = getChips(tree)
    const allChip = chips[0]
    const styles = Array.isArray(allChip.props.style)
      ? allChip.props.style
      : [allChip.props.style]
    // The second element (active style) should be falsy for non-selected
    expect(styles[1]).toBeFalsy()
  })
})
