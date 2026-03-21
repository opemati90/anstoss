import { View, Text, StyleSheet } from 'react-native'

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Anstoss</Text>
      <Text style={styles.subtitle}>Your club. Your app.</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FAFAF8',
  },
  title: {
    fontFamily: 'DMSans-Bold',
    fontSize: 32,
    color: '#1A1A18',
  },
  subtitle: {
    fontFamily: 'DMSans-Regular',
    fontSize: 16,
    color: '#6B6B66',
    marginTop: 8,
  },
})
