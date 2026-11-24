/** Both providers occupy the same capsule, including at larger text sizes. */
export function socialButtonLayout(fontScale: number) {
  const scale = Math.max(1, Math.min(fontScale, 2))
  // Google Sans has a larger apparent size than Apple's native title.
  // Match the rendered optical size, not just the numeric font-size value.
  return { height: 44 * scale, cornerRadius: 22 * scale, fontSize: 16 * scale }
}
