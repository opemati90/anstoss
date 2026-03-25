import { Image, type ImageSourcePropType, StyleSheet, Text, View } from 'react-native'
import { neutralColors } from '../theme/tokens'

type Props = {
  illustration: ImageSourcePropType
  title: string
  description: string
}

export function IllustratedEmptyState({
  illustration,
  title,
  description,
}: Props) {
  return (
    <View style={styles.container}>
      <Image source={illustration} style={styles.illustration} resizeMode="contain" />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  illustration: {
    width: 196,
    height: 144,
    marginBottom: 18,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: neutralColors.textPrimary,
    textAlign: 'center',
  },
  description: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 21,
    color: neutralColors.textSecondary,
    textAlign: 'center',
  },
})
