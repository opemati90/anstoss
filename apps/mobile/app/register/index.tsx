// apps/mobile/app/register/index.tsx
import { useMemo, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { RegistrationRole } from '@anstoss/shared'
import { Screen, Card, Button, Text, Icon, type IconName } from '../../src/components/ui'
import { PressableScale } from '../../src/components/ui/PressableScale'
import { useOnboardingDraft } from '../../src/context/OnboardingContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { fontSize, fonts, hairline, radius, space } from '../../src/theme/tokens'

type RoleCard = {
  role: RegistrationRole
  title: string
  body: string
  icon: IconName
  nextRoute: '/register/club' | '/register/join' | '/register/free-agent' | '/register/parent'
}

const ROLE_CARDS: RoleCard[] = [
  {
    role: RegistrationRole.CLUB_ADMIN,
    title: "I'm starting a club",
    body: 'Create a new club, pick a badge and colors, invite a first team.',
    icon: 'star.fill',
    nextRoute: '/register/club',
  },
  {
    role: RegistrationRole.PLAYER,
    title: "I'm joining a club",
    body: 'Use an invite code from a coach or club admin.',
    icon: 'person.2.fill',
    nextRoute: '/register/join',
  },
  {
    role: RegistrationRole.COACH,
    title: "I'm coaching",
    body: 'Join a club as head or assistant coach via invite.',
    icon: 'person.fill',
    nextRoute: '/register/join',
  },
  {
    role: RegistrationRole.FREE_AGENT,
    title: "I'm looking for a club",
    body: 'Build a free-agent profile so clubs can find you.',
    icon: 'magnifyingglass',
    nextRoute: '/register/free-agent',
  },
  {
    role: RegistrationRole.PARENT,
    title: 'My child plays',
    body: 'Link to your child with an approval code.',
    icon: 'heart.fill',
    nextRoute: '/register/parent',
  },
]

export default function RoleSelectScreen() {
  const { draft, setRole } = useOnboardingDraft()
  const c = useClubColors()
  const [selectedRoute, setSelectedRoute] = useState<RoleCard['nextRoute'] | null>(null)

  const handleSelect = (card: RoleCard) => {
    setRole(card.role)
    setSelectedRoute(card.nextRoute)
  }

  const canContinue = draft.registrationRole !== null && selectedRoute !== null

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.title, { color: c.textPrimary }]}>How will you use Anstoss?</Text>
        <Text style={[styles.subtitle, { color: c.textSecondary }]}>
          Pick the option that fits best. You can change it later.
        </Text>

        <View style={{ gap: space.sm, marginTop: space.lg }}>
          {ROLE_CARDS.map((card) => {
            const isSelected = draft.registrationRole === card.role
            return (
              <PressableScale key={card.role} onPress={() => handleSelect(card)}>
                <Card
                  padding="card"
                  style={{
                    borderWidth: hairline,
                    borderColor: isSelected ? c.primary : c.border,
                    gap: space.sm,
                  }}
                >
                  <View style={styles.cardHeader}>
                    <Icon name={card.icon} size="lg" color={isSelected ? 'tint' : 'primary'} />
                    <Text style={[styles.cardTitle, { color: c.textPrimary }]}>{card.title}</Text>
                  </View>
                  <Text style={[styles.cardBody, { color: c.textSecondary }]}>{card.body}</Text>
                </Card>
              </PressableScale>
            )
          })}
        </View>

        <View style={styles.actions}>
          <Button
            label="Continue"
            variant="filled"
            size="lg"
            fullWidth
            disabled={!canContinue}
            onPress={() => {
              if (canContinue) router.replace(selectedRoute)
            }}
          />
        </View>
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  scroll: { padding: space.lg, paddingBottom: space.xl },
  title: { fontSize: fontSize.xl, fontFamily: fonts.heading },
  subtitle: { fontSize: fontSize.md, fontFamily: fonts.body, marginTop: space.xs },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  cardTitle: { fontSize: fontSize.lg, fontFamily: fonts.heading },
  cardBody: { fontSize: fontSize.sm, fontFamily: fonts.body },
  actions: { marginTop: space.xl },
})
