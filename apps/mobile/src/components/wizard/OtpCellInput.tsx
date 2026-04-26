import { StyleSheet, TextInput, View } from 'react-native'
import { Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { fontSize, fonts, radius, space } from '../../theme/tokens'

const LENGTH = 6

export type OtpCellInputProps = {
  value: string
  onChange: (next: string) => void
  autoFocus?: boolean
}

export function OtpCellInput({ value, onChange, autoFocus = true }: OtpCellInputProps) {
  const colors = useClubColors()
  const cells = Array.from({ length: LENGTH }, (_, i) => value[i] ?? '')
  return (
    <View>
      <View style={styles.row} pointerEvents="none">
        {cells.map((d, i) => (
          <View
            key={i}
            style={[
              styles.cell,
              {
                borderColor: d ? colors.textPrimary : colors.border,
                backgroundColor: colors.surfaceSunken,
              },
            ]}
          >
            <Text style={[styles.digit, { color: colors.textPrimary }]}>{d}</Text>
          </View>
        ))}
      </View>
      <TextInput
        testID="otp-input"
        value={value}
        onChangeText={(raw) => onChange(raw.replace(/\D/g, '').slice(0, LENGTH))}
        keyboardType="number-pad"
        autoComplete="sms-otp"
        textContentType="oneTimeCode"
        maxLength={LENGTH}
        autoFocus={autoFocus}
        style={styles.hidden}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm, justifyContent: 'center' },
  cell: {
    width: 48,
    height: 56,
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digit: { fontFamily: fonts.data, fontSize: fontSize['2xl'], fontWeight: '700' },
  hidden: { position: 'absolute', width: '100%', height: '100%', opacity: 0.01 },
})
