import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const plist = require('plist')
const mobileRoot = resolve(__dirname, '../..')
const read = (path: string) => readFileSync(resolve(mobileRoot, path), 'utf8')
const config = JSON.parse(read('app.json')).expo
const debugInfo = plist.parse(read('ios/Anstoss/Info.plist'))
const releaseInfo = plist.parse(read('ios/Anstoss/Info-Release.plist'))

// Configuration regressions only: native cold-launch/device checks remain required.
describe('iOS startup configuration', () => {
  it.each([['Debug', debugInfo], ['Release', releaseInfo]])(
    '%s uses the Expo scene lifecycle declared in app config',
    (_name, info) => {
      expect(info.UIApplicationSceneManifest).toEqual(config.ios.infoPlist.UIApplicationSceneManifest)
      expect(info.UIApplicationSceneManifest.UIApplicationSupportsMultipleScenes).toBe(false)
      expect(info.UIApplicationSceneManifest.UISceneConfigurations.UIWindowSceneSessionRoleApplication)
        .toEqual([{ UISceneConfigurationName: 'Default Configuration', UISceneDelegateClassName: 'EXExpoAppSceneDelegate' }])
    },
  )

  it.each([['Debug', debugInfo], ['Release', releaseInfo]])(
    '%s registers the configured Google OAuth callback',
    (_name, info) => {
      const plugin = config.plugins.find((entry: unknown) => Array.isArray(entry) && entry[0] === '@react-native-google-signin/google-signin')
      expect(info.CFBundleURLTypes.flatMap((entry: { CFBundleURLSchemes: string[] }) => entry.CFBundleURLSchemes))
        .toContain(plugin[1].iosUrlScheme)
    },
  )

  it('builds one Swift scene-compatible app entry point', () => {
    const project = read('ios/Anstoss.xcodeproj/project.pbxproj')
    const appDelegate = read('ios/Anstoss/AppDelegate.swift')
    expect(project).toContain('AppDelegate.swift in Sources')
    expect(project).not.toMatch(/AppDelegate\.mm in Sources|main\.m in Sources|noop-file\.swift/)
    expect(appDelegate).toContain('@main')
    expect(appDelegate).toContain('ExpoAppDelegate, ExpoReactNativeFactoryProvider')
    expect(appDelegate).not.toContain('startReactNative(')
  })
})
