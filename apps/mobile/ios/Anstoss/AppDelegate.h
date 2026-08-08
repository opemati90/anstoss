#import <UIKit/UIKit.h>
#import <Expo/Expo.h>

@class EXLegacyAppDelegateWrapper;

@interface AppDelegate : RCTAppDelegate
@property (nonatomic, strong) id reactNativeBootstrap;
@property (nonatomic, strong) EXLegacyAppDelegateWrapper *expoAppDelegateWrapper;
@end
