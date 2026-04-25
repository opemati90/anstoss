import React from 'react'
import { View, StyleSheet } from 'react-native'

export type LoadingBoundaryProps = {
  isLoading: boolean
  skeleton: React.ReactNode
  children: React.ReactNode
  testID?: string
}

export function LoadingBoundary({
  isLoading,
  skeleton,
  children,
  testID,
}: LoadingBoundaryProps) {
  return (
    <View style={styles.root} testID={testID}>
      {isLoading ? skeleton : children}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
})
