internal import Expo
import React
import ReactAppDependencyProvider

@objc(AnstossReactNativeBootstrap)
final class AnstossReactNativeBootstrap: NSObject {
  private let delegate: AnstossReactNativeDelegate

  @objc let factory: RCTReactNativeFactory

  override init() {
    let delegate = AnstossReactNativeDelegate()
    delegate.dependencyProvider = RCTAppDependencyProvider()

    self.delegate = delegate
    self.factory = ExpoReactNativeFactory(delegate: delegate)

    super.init()
  }
}

private final class AnstossReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    bridge.bundleURL ?? bundleURL()
  }

  override func bundleURL() -> URL? {
    #if DEBUG
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(
      forBundleRoot: ".expo/.virtual-metro-entry"
    )
    #else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
    #endif
  }
}
