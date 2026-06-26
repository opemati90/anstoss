import { Platform } from 'react-native'
import * as ImagePicker from 'expo-image-picker'

/**
 * Android's system picker grants one-time access to the selected media item, so
 * we avoid broad READ_MEDIA/READ_EXTERNAL_STORAGE permissions for store builds.
 * iOS still needs the explicit photo-library prompt before opening the picker.
 */
export async function ensurePickerMediaAccess(): Promise<boolean> {
  if (Platform.OS === 'android') {
    return true
  }

  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
  return permission.granted || permission.status === 'granted'
}
