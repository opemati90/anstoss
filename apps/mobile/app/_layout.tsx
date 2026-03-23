import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'react-native'
import * as SplashScreen from 'expo-splash-screen'
import { AuthProvider } from '../src/context/AuthContext'
import { ClubThemeProvider } from '../src/context/ClubThemeContext'

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync()
  }, [])

  return (
    <AuthProvider>
      <ClubThemeProvider>
        <StatusBar barStyle="dark-content" backgroundColor="#FAFAF8" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
          <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
          <Stack.Screen name="club-setup" options={{ presentation: 'modal' }} />
          <Stack.Screen name="invite" options={{ presentation: 'modal' }} />
        </Stack>
      </ClubThemeProvider>
    </AuthProvider>
  )
}
