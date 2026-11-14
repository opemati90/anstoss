import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { FilterChipRow, Text } from '../../../components/ui'
import { SPACING_XS } from '../../../theme/tokens'

export function RecruitmentRolePicker({
  value,
  onChange,
}: {
  value: 'PLAYER' | 'COACH'
  onChange: (role: 'PLAYER' | 'COACH') => void
}) {
  const { t } = useTranslation()
  return (
    <View style={{ gap: SPACING_XS }}>
      <Text variant="subheadline" color="secondary">
        {t('recruitment.role')}
      </Text>
      <FilterChipRow
        singleSelect
        wrap
        chips={(['PLAYER', 'COACH'] as const).map((key) => ({
          key,
          label: t(`recruitment.${key}`),
        }))}
        selected={value}
        onToggle={onChange}
      />
    </View>
  )
}
