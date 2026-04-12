import React from 'react'
import renderer, { act } from 'react-test-renderer'
import { TextInput, Pressable, Text } from 'react-native'
import { RosterEditSheet } from '../RosterEditSheet'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'roster.editTitle': 'Edit Player',
        'roster.position': 'Position',
        'roster.positionPlaceholder': 'e.g. Midfielder',
        'roster.jerseyNumber': 'Jersey Number',
        'roster.save': 'Save',
        'common.cancel': 'Cancel',
      }
      return map[key] ?? key
    },
  }),
}))

jest.mock('../../context/ClubThemeContext', () => ({
  useClubColors: () => ({ clubPrimary: '#D50000' }),
  useIsDark: () => false,
}))

function collectText(node: any): string {
  if (!node.children) return ''
  return node.children
    .map((c: any) => (typeof c === 'string' ? c : collectText(c)))
    .join('')
}

function findButtonByLabel(root: any, label: string) {
  return root.root
    .findAllByType(Pressable)
    .find((btn: any) =>
      btn.findAllByType(Text).some((t: any) => collectText(t) === label),
    )
}

describe('RosterEditSheet', () => {
  const baseProps = {
    visible: true,
    onClose: jest.fn(),
    onSave: jest.fn(),
    playerName: 'Max Müller',
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders player name and form fields', () => {
    const tree = renderer.create(<RosterEditSheet {...baseProps} />)
    const texts = tree.root.findAllByType(Text)
    const textValues = texts.map((t: any) => collectText(t))

    expect(textValues).toContain('Max Müller')
    expect(textValues).toContain('Position')
    expect(textValues).toContain('Jersey Number')
  })

  it('calls onSave with parsed values when save is pressed', () => {
    const onSave = jest.fn()
    const tree = renderer.create(
      <RosterEditSheet {...baseProps} onSave={onSave} />,
    )

    const inputs = tree.root.findAllByType(TextInput)
    act(() => {
      inputs[0].props.onChangeText('Midfielder')
      inputs[1].props.onChangeText('10')
    })

    const saveBtn = findButtonByLabel(tree, 'Save')
    act(() => {
      saveBtn.props.onPress()
    })

    expect(onSave).toHaveBeenCalledWith({
      position: 'Midfielder',
      jerseyNumber: 10,
    })
  })

  it('sends null for empty fields', () => {
    const onSave = jest.fn()
    const tree = renderer.create(
      <RosterEditSheet {...baseProps} onSave={onSave} />,
    )

    const saveBtn = findButtonByLabel(tree, 'Save')
    act(() => {
      saveBtn.props.onPress()
    })

    expect(onSave).toHaveBeenCalledWith({
      position: null,
      jerseyNumber: null,
    })
  })

  it('calls onClose when cancel is pressed', () => {
    const onClose = jest.fn()
    const tree = renderer.create(
      <RosterEditSheet {...baseProps} onClose={onClose} />,
    )

    const cancelBtn = findButtonByLabel(tree, 'Cancel')
    act(() => {
      cancelBtn.props.onPress()
    })

    expect(onClose).toHaveBeenCalled()
  })

  it('initializes fields from initial values', () => {
    const tree = renderer.create(
      <RosterEditSheet
        {...baseProps}
        initialPosition="Goalkeeper"
        initialJerseyNumber={1}
      />,
    )

    const inputs = tree.root.findAllByType(TextInput)
    expect(inputs[0].props.value).toBe('Goalkeeper')
    expect(inputs[1].props.value).toBe('1')
  })

  it('handles non-numeric jersey input as null', () => {
    const onSave = jest.fn()
    const tree = renderer.create(
      <RosterEditSheet {...baseProps} onSave={onSave} />,
    )

    const inputs = tree.root.findAllByType(TextInput)
    act(() => {
      inputs[1].props.onChangeText('abc')
    })

    const saveBtn = findButtonByLabel(tree, 'Save')
    act(() => {
      saveBtn.props.onPress()
    })

    expect(onSave).toHaveBeenCalledWith({
      position: null,
      jerseyNumber: null,
    })
  })
})
