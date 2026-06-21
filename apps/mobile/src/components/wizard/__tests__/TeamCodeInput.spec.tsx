import { fireEvent, render, screen } from '@testing-library/react-native'
import {
  normalizeTeamCode,
  TeamCodeInput,
  TEAM_CODE_ALPHABET,
  TEAM_CODE_LENGTH,
} from '../TeamCodeInput'

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}))

describe('TeamCodeInput', () => {
  it('uppercases input and rejects characters outside the alphabet', () => {
    const onChange = jest.fn()
    render(<TeamCodeInput value="" onChange={onChange} />)
    fireEvent.changeText(screen.getByTestId('team-code-input'), 'abi1o0z')
    // 'a' -> 'A' (in); 'b' -> 'B' (in); 'i' -> 'I' (NOT in, dropped); '1' (NOT in, dropped);
    // 'o' -> 'O' (NOT in, dropped); '0' (NOT in, dropped); 'z' -> 'Z' (in)
    expect(onChange).toHaveBeenLastCalledWith('ABZ')
  })

  it(`truncates beyond ${TEAM_CODE_LENGTH} characters`, () => {
    const onChange = jest.fn()
    render(<TeamCodeInput value="" onChange={onChange} />)
    fireEvent.changeText(screen.getByTestId('team-code-input'), 'ABCDEFG')
    expect(onChange).toHaveBeenLastCalledWith('ABCDE')
  })

  it('normalizes pasted codes with separators before applying the code length', () => {
    const onChange = jest.fn()
    render(<TeamCodeInput value="" onChange={onChange} />)
    const input = screen.getByTestId('team-code-input')

    expect(input.props.maxLength).toBeUndefined()

    fireEvent.changeText(input, 'AB-23-X')
    expect(onChange).toHaveBeenLastCalledWith('AB23X')
    expect(normalizeTeamCode('AB-23-X')).toBe('AB23X')
  })

  it('exposes the alphabet matching the backend (Crockford-derived, no I/O/0/1)', () => {
    expect(TEAM_CODE_ALPHABET).toBe('ABCDEFGHJKMNPQRSTUVWXYZ23456789')
  })
})
