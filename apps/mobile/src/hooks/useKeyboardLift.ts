import { useEffect, useState } from 'react'
import { Keyboard, Platform } from 'react-native'

/**
 * How far a bottom-docked element has to rise to clear the keyboard.
 *
 * `KeyboardAvoidingView` is the usual answer and it does nothing inside a
 * bottom-tab scene: the scene container keeps a fixed height, so the view's
 * measured frame never changes and `behavior="padding"` computes a zero
 * inset. The chat composer sat under the keyboard with nowhere to type.
 *
 * Measuring the keyboard directly avoids that entirely. `offset` is the
 * height of chrome below the screen that the keyboard already covers — the
 * tab bar — which must not be reserved twice.
 *
 * iOS only: Android resizes the window for the keyboard by default, so
 * adding a second JS-measured inset there double-lifts the composer.
 */
export function useKeyboardLift(offset = 0): number {
  const [lift, setLift] = useState(0)

  useEffect(() => {
    if (Platform.OS !== 'ios') return

    // `WillChangeFrame` fires with the animation, so the lift moves in step
    // with the keyboard instead of snapping after it lands.
    const sub = Keyboard.addListener('keyboardWillChangeFrame', (event) => {
      const screenHeight = event.endCoordinates.screenY + event.endCoordinates.height
      const covered = screenHeight - event.endCoordinates.screenY
      setLift(Math.max(0, covered - offset))
    })
    const hide = Keyboard.addListener('keyboardWillHide', () => setLift(0))

    return () => {
      sub.remove()
      hide.remove()
    }
  }, [offset])

  return lift
}
