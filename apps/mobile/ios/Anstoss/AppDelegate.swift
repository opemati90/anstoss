internal import Expo
import React
import ReactAppDependencyProvider

@main
final class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {
  var window: UIWindow?
  var reactNativeFactory: RCTReactNativeFactory?
  private var reactNativeDelegate: AnstossReactNativeDelegate?

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = AnstossReactNativeDelegate()
    delegate.dependencyProvider = RCTAppDependencyProvider()
    reactNativeDelegate = delegate
    reactNativeFactory = ExpoReactNativeFactory(delegate: delegate)

    // EXExpoAppSceneDelegate owns the window and starts React Native once the
    // scene connects. ExpoAppDelegate forwards APNs and other subscriber events.
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    let expoHandled = super.application(app, open: url, options: options)
    let reactHandled = RCTLinkingManager.application(app, open: url, options: options)
    return expoHandled || reactHandled
  }

  override func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    let expoHandled = super.application(
      application, continue: userActivity, restorationHandler: restorationHandler
    )
    let reactHandled = RCTLinkingManager.application(
      application, continue: userActivity, restorationHandler: restorationHandler
    )
    return expoHandled || reactHandled
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
