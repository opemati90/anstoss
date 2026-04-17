import { useState } from 'react'
import {
  View,
  Pressable,
  Image,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import * as ImageManipulator from 'expo-image-manipulator'
import { useTranslation } from 'react-i18next'
import { useClubColors } from '../context/ClubThemeContext'
import { Icon } from './ui'
import { Text } from './ui/Text'
import {
  hairline,
  RADIUS_FULL,
  RADIUS_LG,
  SPACING_SM,
  SPACING_XS,
} from '../theme/tokens'

const BADGE_SIZE = 512

type BadgeUploadPickerProps = {
  imageUri: string | null
  onImagePicked: (uri: string) => void
  accentColor: string
}

export function BadgeUploadPicker({
  imageUri,
  onImagePicked,
  accentColor,
}: BadgeUploadPickerProps) {
  const { t } = useTranslation()
  const c = useClubColors()
  const [isProcessing, setIsProcessing] = useState(false)

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert(
        t('common.error'),
        t('club.badgePermissionDenied'),
      )
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })

    if (result.canceled || !result.assets[0]) return

    setIsProcessing(true)
    try {
      const manipulated = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: BADGE_SIZE, height: BADGE_SIZE } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.PNG },
      )
      onImagePicked(manipulated.uri)
    } catch {
      Alert.alert(t('common.error'), t('club.badgeProcessingError'))
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <View style={styles.container}>
      <Text variant="subheadline" color="primary">
        {t('club.badge')}
      </Text>
      <Pressable
        style={[
          styles.picker,
          { borderColor: c.borderDefault, backgroundColor: c.surface },
          imageUri && { borderStyle: 'solid' as const },
        ]}
        onPress={pickImage}
        disabled={isProcessing}
        accessibilityRole="button"
        accessibilityLabel={t('club.uploadBadge')}
      >
        {isProcessing ? (
          <ActivityIndicator color={accentColor} />
        ) : imageUri ? (
          <View style={styles.previewContainer}>
            <Image source={{ uri: imageUri }} style={styles.preview} />
            <View style={[styles.editBadge, { backgroundColor: accentColor }]}>
              <Icon name="pencil" size="sm" color={c.textInverse} />
            </View>
          </View>
        ) : (
          <View style={styles.placeholder}>
            <Icon name="photo" size="xl" color={c.textTertiary} />
            <Text variant="caption2" color="tertiary" align="center">
              {t('club.uploadBadge')}
            </Text>
          </View>
        )}
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: SPACING_SM },
  picker: {
    width: 88,
    height: 88,
    borderRadius: RADIUS_LG,
    borderWidth: hairline,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  previewContainer: {
    width: '100%',
    height: '100%',
  },
  preview: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  editBadge: {
    position: 'absolute',
    bottom: SPACING_XS,
    right: SPACING_XS,
    width: 22,
    height: 22,
    borderRadius: RADIUS_FULL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholder: {
    alignItems: 'center',
    gap: SPACING_XS,
  },
})
