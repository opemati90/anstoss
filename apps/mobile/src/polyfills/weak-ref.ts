class WeakRefShim<T extends object> {
  private readonly value: T

  constructor(value: T) {
    this.value = value
  }

  deref() {
    return this.value
  }
}

if (typeof globalThis.WeakRef === 'undefined') {
  // React Navigation 7 uses WeakRef internally, but Hermes in this app's
  // runtime doesn't expose it yet. A strong-reference shim is enough here.
  globalThis.WeakRef = WeakRefShim as typeof globalThis.WeakRef
}

export {}
