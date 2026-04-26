import { StyleSheet, TextInput, View } from 'react-native'
import { Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { fontSize, fonts, radius, space } from '../../theme/tokens'

export const TEAM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const TEAM_CODE_LENGTH = 5

export type TeamCodeInputProps = {
  value: string
  onChange: (next: string) => void
  autoFocus?: boolean
}

export function TeamCodeInput({ value, onChange, autoFocus = true }: TeamCodeInputProps) {
  const colors = useClubColors()
  const cells = Array.from({ length: TEAM_CODE_LENGTH }, (_, i) => value[i] ?? '')
  return (
    <View>
      <View style={styles.row} pointerEvents="none">
        {cells.map((c, i) => (
          <View
            key={i}
            style={[
              styles.cell,
              { borderColor: c ? colors.textPrimary : colors.border, backgroundColor: colors.surfaceSunken },
            ]}
          >
            <Text style={[styles.char, { color: colors.textPrimary }]}>{c}</Text>
          </View>
        ))}
      </View>
      <TextInput
        testID="team-code-input"
        value={value}
        onChangeText={(raw) => {
          const filtered = raw
            .toUpperCase()
            .split('')
            .filter((ch) => TEAM_CODE_ALPHABET.includes(ch))
            .join('')
            .slice(0, TEAM_CODE_LENGTH)
          onChange(filtered)
        }}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={TEAM_CODE_LENGTH}
        autoFocus={autoFocus}
        style={styles.hidden}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm, justifyContent: 'center' },
  cell: {
    width: 52,
    height: 64,
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  char: { fontFamily: fonts.data, fontSize: fontSize['2xl'], fontWeight: '700' },
  hidden: { position: 'absolute', width: '100%', height: '100%', opacity: 0.01 },
})
