import React from 'react'
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet } from 'react-native'
import { Screen, type ScreenProps } from './ui/Screen'

export type FormScreenProps = ScreenProps

export function FormScreen({ children, ...screenProps }: FormScreenProps) {
  return (
    <Screen {...screenProps}>
      <Pressable
        accessible={false}
        onPress={Keyboard.dismiss}
        style={styles.backdrop}
        testID="form-screen-backdrop"
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.avoider}
        >
          {children}
        </KeyboardAvoidingView>
      </Pressable>
    </Screen>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  avoider: { flex: 1 },
})
