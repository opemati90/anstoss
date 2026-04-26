import { fireEvent, render, screen } from '@testing-library/react-native'
import { OtpCellInput } from '../OtpCellInput'

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}))

describe('OtpCellInput', () => {
  it('reports the value as the user types', () => {
    const onChange = jest.fn()
    render(<OtpCellInput value="" onChange={onChange} />)
    fireEvent.changeText(screen.getByTestId('otp-input'), '12')
    expect(onChange).toHaveBeenLastCalledWith('12')
  })

  it('truncates beyond 6 digits', () => {
    const onChange = jest.fn()
    render(<OtpCellInput value="" onChange={onChange} />)
    fireEvent.changeText(screen.getByTestId('otp-input'), '1234567')
    expect(onChange).toHaveBeenLastCalledWith('123456')
  })

  it('strips non-digits', () => {
    const onChange = jest.fn()
    render(<OtpCellInput value="" onChange={onChange} />)
    fireEvent.changeText(screen.getByTestId('otp-input'), '12a3')
    expect(onChange).toHaveBeenLastCalledWith('123')
  })
})
