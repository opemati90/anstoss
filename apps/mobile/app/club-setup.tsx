import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { router } from 'expo-router'
import { useAuth } from '../src/context/AuthContext'
import { api } from '../src/api/client'
import { neutralColors } from '../src/theme/tokens'

const PRESET_COLORS = [
  '#1E3A5F', '#C4372C', '#2D7A3A', '#1A1A18', '#B8860B',
  '#6B3FA0', '#E85D04', '#0077B6', '#800020', '#2F4F4F',
]

const AGE_GROUPS = [
  'Herren', 'Frauen', 'A-Jugend', 'B-Jugend', 'C-Jugend',
  'D-Jugend', 'E-Jugend', 'F-Jugend', 'G-Jugend',
]

export default function ClubSetupScreen() {
  const { refreshUser } = useAuth()
  const [step, setStep] = useState(1)
  const [isLoading, setIsLoading] = useState(false)

  // Step 1: Club info
  const [clubName, setClubName] = useState('')
  const [primaryColor, setPrimaryColor] = useState(PRESET_COLORS[0])

  // Step 2: First team
  const [teamName, setTeamName] = useState('')
  const [ageGroup, setAgeGroup] = useState('Herren')

  const handleCreate = async () => {
    if (!clubName.trim()) {
      Alert.alert('Club name required')
      return
    }
    if (!teamName.trim()) {
      Alert.alert('Team name required')
      return
    }

    setIsLoading(true)
    try {
      await api('/clubs/setup', {
        method: 'POST',
        body: {
          club: {
            name: clubName.trim(),
            primaryColor,
          },
          team: {
            name: teamName.trim(),
          },
        },
      })
      await refreshUser()
      router.replace('/(tabs)')
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create club')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>
        {step === 1 ? 'Create your club' : 'Add your first team'}
      </Text>
      <Text style={styles.subtitle}>
        {step === 1
          ? 'Your players will see your club branding throughout the app.'
          : 'You can add more teams later.'}
      </Text>

      {step === 1 ? (
        <View style={styles.form}>
          <Text style={styles.label}>Club name</Text>
          <TextInput
            style={styles.input}
            value={clubName}
            onChangeText={setClubName}
            placeholder="FC Lichtenberg"
            placeholderTextColor={neutralColors.textTertiary}
          />

          <Text style={[styles.label, { marginTop: 16 }]}>Club colour</Text>
          <View style={styles.colorGrid}>
            {PRESET_COLORS.map((color) => (
              <TouchableOpacity
                key={color}
                style={[
                  styles.colorSwatch,
                  { backgroundColor: color },
                  primaryColor === color && styles.colorSelected,
                ]}
                onPress={() => setPrimaryColor(color)}
              />
            ))}
          </View>

          <TouchableOpacity
            style={[styles.button, { backgroundColor: primaryColor }]}
            onPress={() => {
              if (!clubName.trim()) {
                Alert.alert('Club name required')
                return
              }
              setStep(2)
            }}
          >
            <Text style={styles.buttonText}>Next</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.form}>
          <Text style={styles.label}>Team name</Text>
          <TextInput
            style={styles.input}
            value={teamName}
            onChangeText={setTeamName}
            placeholder="Herren I"
            placeholderTextColor={neutralColors.textTertiary}
          />

          <Text style={[styles.label, { marginTop: 16 }]}>Age group</Text>
          <View style={styles.ageGrid}>
            {AGE_GROUPS.map((ag) => (
              <TouchableOpacity
                key={ag}
                style={[
                  styles.ageChip,
                  ageGroup === ag && { backgroundColor: primaryColor },
                ]}
                onPress={() => setAgeGroup(ag)}
              >
                <Text
                  style={[
                    styles.ageChipText,
                    ageGroup === ag && { color: '#FFF' },
                  ]}
                >
                  {ag}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => setStep(1)}
            >
              <Text style={styles.backButtonText}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.button,
                { backgroundColor: primaryColor, flex: 1 },
                isLoading && styles.buttonDisabled,
              ]}
              onPress={handleCreate}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.buttonText}>Create Club</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.stepIndicator}>
        <View style={[styles.dot, step >= 1 && { backgroundColor: primaryColor }]} />
        <View style={[styles.dot, step >= 2 && { backgroundColor: primaryColor }]} />
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: neutralColors.background },
  content: { padding: 24, paddingTop: 80 },
  title: { fontSize: 28, fontWeight: '700', color: neutralColors.textPrimary },
  subtitle: { fontSize: 16, color: neutralColors.textSecondary, marginTop: 8, marginBottom: 32 },
  form: { gap: 8 },
  label: { fontSize: 14, fontWeight: '600', color: neutralColors.textPrimary },
  input: {
    height: 52, borderWidth: 1, borderColor: neutralColors.border, borderRadius: 8,
    paddingHorizontal: 16, fontSize: 16, color: neutralColors.textPrimary,
    backgroundColor: neutralColors.surface,
  },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginVertical: 8 },
  colorSwatch: { width: 44, height: 44, borderRadius: 22 },
  colorSelected: { borderWidth: 3, borderColor: neutralColors.textPrimary },
  ageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 },
  ageChip: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8,
    borderWidth: 1, borderColor: neutralColors.border, backgroundColor: neutralColors.surface,
  },
  ageChipText: { fontSize: 14, fontWeight: '500', color: neutralColors.textPrimary },
  button: {
    height: 52, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginTop: 24,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  buttonRow: { flexDirection: 'row', gap: 12, marginTop: 24 },
  backButton: {
    height: 52, borderRadius: 8, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 24, borderWidth: 1, borderColor: neutralColors.border,
  },
  backButtonText: { fontSize: 16, fontWeight: '500', color: neutralColors.textPrimary },
  stepIndicator: {
    flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 32,
  },
  dot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: neutralColors.border,
  },
})
