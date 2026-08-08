#import "AppDelegate.h"

#import <Expo/EXLegacyAppDelegateWrapper.h>
#import <React/RCTBundleURLProvider.h>
#import <React/RCTLinkingManager.h>

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  self.moduleName = @"main";

  // You can add your custom initial props in the dictionary below.
  // They will be passed down to the ViewController used by React Native.
  self.initialProps = @{};

  self.expoAppDelegateWrapper = [[EXLegacyAppDelegateWrapper alloc] init];
  [self.expoAppDelegateWrapper application:application didFinishLaunchingWithOptions:launchOptions];

  Class bootstrapClass = NSClassFromString(@"AnstossReactNativeBootstrap");
  if (bootstrapClass == Nil) {
    bootstrapClass = NSClassFromString(@"Anstoss.AnstossReactNativeBootstrap");
  }
  self.reactNativeBootstrap = [[bootstrapClass alloc] init];
  self.reactNativeFactory = [self.reactNativeBootstrap valueForKey:@"factory"];

  if (self.automaticallyLoadReactNativeWindow) {
    self.window = [[UIWindow alloc] initWithFrame:[UIScreen mainScreen].bounds];
    [self.reactNativeFactory startReactNativeWithModuleName:self.moduleName
                                                   inWindow:self.window
                                              launchOptions:launchOptions];
  }

  return YES;
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return bridge.bundleURL ?: [self bundleURL];
}

- (NSURL *)bundleURL
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@".expo/.virtual-metro-entry"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

// Linking API
- (BOOL)application:(UIApplication *)application openURL:(NSURL *)url options:(NSDictionary<UIApplicationOpenURLOptionsKey,id> *)options {
  BOOL expoHandled = [self.expoAppDelegateWrapper application:application openURL:url options:options];
  BOOL reactHandled = [RCTLinkingManager application:application openURL:url options:options];
  return expoHandled || reactHandled;
}

// Universal Links
- (BOOL)application:(UIApplication *)application continueUserActivity:(nonnull NSUserActivity *)userActivity restorationHandler:(nonnull void (^)(NSArray<id<UIUserActivityRestoring>> * _Nullable))restorationHandler {
  BOOL result = [RCTLinkingManager application:application continueUserActivity:userActivity restorationHandler:restorationHandler];
  return [self.expoAppDelegateWrapper application:application continueUserActivity:userActivity restorationHandler:restorationHandler] || result;
}

// Explicitly define remote notification delegates to ensure compatibility with some third-party libraries
- (void)application:(UIApplication *)application didRegisterForRemoteNotificationsWithDeviceToken:(NSData *)deviceToken
{
  [self.expoAppDelegateWrapper application:application didRegisterForRemoteNotificationsWithDeviceToken:deviceToken];
}

// Explicitly define remote notification delegates to ensure compatibility with some third-party libraries
- (void)application:(UIApplication *)application didFailToRegisterForRemoteNotificationsWithError:(NSError *)error
{
  [self.expoAppDelegateWrapper application:application didFailToRegisterForRemoteNotificationsWithError:error];
}

// Explicitly define remote notification delegates to ensure compatibility with some third-party libraries
- (void)application:(UIApplication *)application didReceiveRemoteNotification:(NSDictionary *)userInfo fetchCompletionHandler:(void (^)(UIBackgroundFetchResult))completionHandler
{
  [self.expoAppDelegateWrapper application:application didReceiveRemoteNotification:userInfo fetchCompletionHandler:completionHandler];
}

@end
