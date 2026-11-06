import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { LAUNCH_FEATURES } from '../packages/shared/src/constants/launch-features'
import { verifyStoreZip } from './store-zip-integrity'

const root = process.cwd()
const failures: string[] = []

function path(rel: string) {
  return join(root, rel)
}

function read(rel: string) {
  return readFileSync(path(rel), 'utf8')
}

function json<T>(rel: string): T {
  return JSON.parse(read(rel)) as T
}

function fail(message: string) {
  failures.push(message)
}

function expect(condition: unknown, message: string) {
  if (!condition) fail(message)
}

function expectIncludes(haystack: string, needle: string, context: string) {
  expect(haystack.includes(needle), `${context} must include ${needle}`)
}

function expectNotIncludes(haystack: string, needle: string, context: string) {
  expect(!haystack.includes(needle), `${context} must not include ${needle}`)
}

// Approval is explicit and bound to the reviewed files and source revision.
const reviewPath = 'store-assets/review.json'
const storeScreenshotNames = [
  '01-anstoss.png', '02-club-home.png', '03-events-rsvp.png',
  '04-team-chat.png', '05-squad.png', '06-contributions.png',
]
const reviewedFiles = [
  ...['launch', 'current-after-user', 'events', 'chat', 'squad', 'contributions'].map((name) => `store-assets/source/${name}.png`),
  'store-assets/source/amateur-pitch-editorial-v2.png',
  ...['app-store', 'play-store'].flatMap((store) => storeScreenshotNames.map((name) => `store-assets/${store}/en-US/${name}`)),
  'store-assets/app-store/en-US/app-icon-1024.png',
  'store-assets/play-store/en-US/play-icon-512.png',
  'store-assets/play-store/en-US/feature-graphic-1024x500.png',
  'store-assets/app-store-upload.zip', 'store-assets/play-store-upload.zip',
  'store-assets/generate-store-assets-v2.js',
]
if (!existsSync(path(reviewPath))) fail('Store asset review manifest is missing')
else {
  const review = json<{ approved: boolean; releaseCommit: string | null; runtimeVersion: string | null;
    launchScope: string; reviewedAt: string | null; reviewer: string | null; sha256: Record<string, string> }>(reviewPath)
  expect(review.approved === true, 'Store artwork is withdrawn: capture and review current adult-launch screens before submission')
  if (review.approved === true) {
    try {
      if (!review.releaseCommit || !/^[a-f0-9]{40}$/.test(review.releaseCommit)) throw new Error('Invalid reviewed commit')
      execFileSync('git', ['merge-base', '--is-ancestor', review.releaseCommit, 'HEAD'], { cwd: root, stdio: 'ignore' })
      const changed = execFileSync('git', ['diff', '--name-only', review.releaseCommit, 'HEAD'], { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean)
      expect(changed.every((file) => file === reviewPath), 'Only the approval manifest may change after the reviewed commit')
      const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()
      expect(!dirty, 'Store approval requires a clean working tree')
    } catch { fail('Cannot verify the reviewed store release commit') }
    expect(review.runtimeVersion === '57.0.1' && review.launchScope === 'adult-only', 'Store artwork review must match runtime and launch scope')
    expect(LAUNCH_FEATURES.minimumAccountAge === 18 && !LAUNCH_FEATURES.youthParticipation && !LAUNCH_FEATURES.healthReporting,
      'Store artwork review requires the adult-only launch feature scope')
    expect(!!review.reviewer?.trim() && !!review.reviewedAt && !Number.isNaN(Date.parse(review.reviewedAt)), 'Store artwork needs a named reviewer and review date')
    for (const file of reviewedFiles) {
      if (!existsSync(path(file))) { fail(`Reviewed store asset missing: ${file}`); continue }
      const actual = createHash('sha256').update(readFileSync(path(file))).digest('hex')
      expect(review.sha256?.[file] === actual, `Store asset changed or was not reviewed: ${file}`)
    }
    for (const store of ['app-store', 'play-store'] as const) {
      const names = [...storeScreenshotNames, ...(store === 'app-store'
        ? ['app-icon-1024.png'] : ['feature-graphic-1024x500.png', 'play-icon-512.png'])].sort()
      try {
        verifyStoreZip(path(`store-assets/${store}-upload.zip`), path(`store-assets/${store}/en-US`), names)
      } catch { fail(`Could not verify ${store} ZIP contents`) }
    }
  }
}

function walk(rel: string): string[] {
  const full = path(rel)
  if (!existsSync(full)) return []
  return readdirSync(full).flatMap((entry) => {
    const child = join(rel, entry)
    const stat = statSync(path(child))
    return stat.isDirectory() ? walk(child) : [child]
  })
}

function scanForbidden(
  files: string[],
  patterns: Array<{ re: RegExp; label: string }>,
  label: string,
) {
  for (const file of files) {
    const contents = read(file)
    for (const pattern of patterns) {
      if (pattern.re.test(contents)) {
        fail(`${label}: ${file} contains forbidden ${pattern.label}`)
      }
    }
  }
}

type AppJson = {
  expo?: {
    android?: {
      blockedPermissions?: string[]
    }
    plugins?: Array<string | [string, Record<string, unknown>]>
    runtimeVersion?: string | { policy?: string }
  }
}

type EasJson = {
  build?: Record<
    string,
    {
      credentialsSource?: string
      channel?: string
      environment?: string
      env?: Record<string, string>
      ios?: { image?: string }
      android?: { image?: string }
    }
  >
}

const appJson = json<AppJson>('apps/mobile/app.json')
expect(
  appJson.expo?.runtimeVersion === '57.0.1',
  'app.json must use the explicit Expo 57 runtime; increment it whenever native code changes',
)
const splashPlugin = appJson.expo?.plugins?.find(
  (plugin): plugin is [string, Record<string, unknown>] =>
    Array.isArray(plugin) && plugin[0] === 'expo-splash-screen',
)
expect(splashPlugin?.[1]?.image === './assets/icon.png', 'Splash screen must use the cropped logo')
expect(
  typeof splashPlugin?.[1]?.imageWidth === 'number' && splashPlugin[1].imageWidth >= 200,
  'Splash screen logo must render at least 200 points wide',
)
const blockedPermissions = appJson.expo?.android?.blockedPermissions ?? []
expect(
  blockedPermissions.includes('android.permission.SYSTEM_ALERT_WINDOW'),
  'app.json must block android.permission.SYSTEM_ALERT_WINDOW',
)
for (const permission of [
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VIDEO',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
]) {
  expect(blockedPermissions.includes(permission), `app.json must block ${permission}`)
}

const releaseManifest = read('apps/mobile/android/app/src/main/AndroidManifest.xml')
function releaseManifestDeclares(permission: string): boolean {
  const permissionElements = releaseManifest.match(/<uses-permission\b[^>]*\/?\s*>/gs) ?? []
  return permissionElements.some(
    (element) =>
      element.includes(`android:name="${permission}"`) && !element.includes('tools:node="remove"'),
  )
}

expect(
  !releaseManifestDeclares('android.permission.SYSTEM_ALERT_WINDOW'),
  'Android release manifest must not declare android.permission.SYSTEM_ALERT_WINDOW',
)
for (const permission of [
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VIDEO',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
]) {
  expect(
    !releaseManifestDeclares(permission),
    `Android release manifest must not declare ${permission}`,
  )
}

const buildGradle = read('apps/mobile/android/app/build.gradle')
expect(
  !buildGradle.includes('"/sdks/hermesc/%OS-BIN%/hermesc"'),
  'Android must not use the removed React Native sdks/hermesc path',
)
expectIncludes(buildGradle, "require.resolve('hermes-compiler/package.json')", 'Android Hermes compiler path')
expectIncludes(buildGradle, '"/hermesc/%OS-BIN%/hermesc"', 'Android Hermes compiler binary suffix')
const buildTypesReleaseBlock =
  buildGradle.match(/buildTypes\s*\{[\s\S]*?release\s*\{([\s\S]*?)\n\s{8}\}/)?.[1] ?? ''
expect(
  !/signingConfig\s+signingConfigs\.debug/.test(buildTypesReleaseBlock),
  'Android release build must not sign with signingConfigs.debug',
)
expectIncludes(buildGradle, 'android.injected.signing.store.file', 'Android release signing config')
expectIncludes(
  buildGradle,
  'Release signing credentials are required',
  'Android release signing fail-fast guard',
)
expectIncludes(buildGradle, 'gradle.taskGraph.whenReady', 'Android release signing fail-fast guard')
expectIncludes(buildGradle, 'android.buildTypes.release.signingConfig', 'effective Android release signing guard')
expectIncludes(buildGradle, "it.name.equalsIgnoreCase('assembleRelease')", 'Android preview artifact guard')
expectIncludes(buildGradle, "it.name.equalsIgnoreCase('bundleRelease')", 'Android release artifact guard')
expectIncludes(buildGradle, "releaseSigning?.keyAlias == 'androiddebugkey'", 'Android debug credential guard')

const easJson = json<EasJson>('apps/mobile/eas.json')
expect(
  easJson.build?.production?.credentialsSource === 'remote',
  'EAS production profile must use remote credentials',
)
expect(
  easJson.build?.testflight?.credentialsSource === 'remote',
  'EAS testflight profile must use remote credentials',
)
for (const profile of ['preview', 'testflight', 'production']) {
  expect(
    easJson.build?.[profile]?.channel === profile,
    `EAS ${profile} OTA-enabled build profile must declare its matching update channel`,
  )
}
for (const profile of ['development', 'preview', 'testflight', 'production']) {
  expect(
    easJson.build?.[profile]?.ios?.image === 'sdk-57',
    `EAS ${profile} iOS profile must use the Expo SDK 57 image`,
  )
  expect(
    easJson.build?.[profile]?.android?.image === 'sdk-57',
    `EAS ${profile} Android profile must use the Expo SDK 57 image`,
  )
}
expect(
  easJson.build?.testflight?.env?.EXPO_USE_PRECOMPILED_MODULES === undefined,
  'EAS testflight profile must use the same precompiled-module defaults as production',
)

const xcodeProject = read('apps/mobile/ios/Anstoss.xcodeproj/project.pbxproj')
expectIncludes(
  xcodeProject,
  'INFOPLIST_FILE = "Anstoss/Info-Release.plist";',
  'iOS Release build configuration',
)

const infoPlist = read('apps/mobile/ios/Anstoss/Info-Release.plist')
expectIncludes(
  infoPlist,
  'Allow Anstoss to take photos for profiles, club media, sponsors, and chat.',
  'iOS camera purpose string',
)
expectIncludes(
  infoPlist,
  'Allow Anstoss to record voice messages for your team chat.',
  'iOS microphone purpose string',
)
expectIncludes(
  infoPlist,
  'Allow Anstoss to let you choose profile, club, sponsor, and chat images.',
  'iOS photo purpose string',
)
expectNotIncludes(infoPlist, 'NSFaceIDUsageDescription', 'iOS plist')
expectNotIncludes(infoPlist, 'NSBonjourServices', 'iOS Release plist')
expectNotIncludes(infoPlist, 'NSLocalNetworkUsageDescription', 'iOS Release plist')
expectNotIncludes(infoPlist, 'NSAllowsLocalNetworking', 'iOS Release plist')

const expoPlist = read('apps/mobile/ios/Anstoss/Supporting/Expo.plist')
expect(
  /<key>EXUpdatesRuntimeVersion<\/key>\s*<string>57\.0\.1<\/string>/.test(expoPlist),
  'iOS Expo Updates runtime must set EXUpdatesRuntimeVersion to 57.0.1',
)
expectNotIncludes(expoPlist, 'file:fingerprint', 'iOS Expo Updates runtime')

const androidStrings = read('apps/mobile/android/app/src/main/res/values/strings.xml')
expectIncludes(
  androidStrings,
  '<string name="expo_runtime_version">57.0.1</string>',
  'Android Expo Updates runtime',
)
expectNotIncludes(androidStrings, 'file:fingerprint', 'Android Expo Updates runtime')

const privacyManifest = read('apps/mobile/ios/Anstoss/PrivacyInfo.xcprivacy')
expectIncludes(privacyManifest, '<key>NSPrivacyTracking</key>', 'iOS privacy manifest')
expectIncludes(privacyManifest, '<false/>', 'iOS privacy manifest tracking flag')
for (const dataType of [
  'NSPrivacyCollectedDataTypeHealth',
  'NSPrivacyCollectedDataTypeName',
  'NSPrivacyCollectedDataTypeEmailAddress',
  'NSPrivacyCollectedDataTypeUserID',
  'NSPrivacyCollectedDataTypeDeviceID',
  'NSPrivacyCollectedDataTypeEmailsOrTextMessages',
  'NSPrivacyCollectedDataTypePhotosorVideos',
  'NSPrivacyCollectedDataTypeAudioData',
  'NSPrivacyCollectedDataTypeOtherUserContent',
  'NSPrivacyCollectedDataTypePurchaseHistory',
  'NSPrivacyCollectedDataTypeOtherFinancialInfo',
  'NSPrivacyCollectedDataTypeProductInteraction',
  'NSPrivacyCollectedDataTypeCrashData',
  'NSPrivacyCollectedDataTypePerformanceData',
  'NSPrivacyCollectedDataTypeOtherDataTypes',
]) {
  expectIncludes(privacyManifest, dataType, 'iOS privacy manifest collected data')
}

const accountDeletionRel = 'apps/web/src/account-deletion.html'
expect(existsSync(path(accountDeletionRel)), 'Public account-deletion page must exist')
const accountDeletion = existsSync(path(accountDeletionRel)) ? read(accountDeletionRel) : ''
for (const needle of ['privacy@anstoss.io', 'within one month', 'Profile', 'Data &amp; account', 'Delete account', 'free-agent mode', 'More']) {
  expectIncludes(accountDeletion, needle, 'Account deletion page')
}
expectIncludes(read('apps/web/src/legal.html'), 'account-deletion', 'Web legal page')
expectIncludes(read('apps/mobile/src/content/policies.ts'), 'account-deletion', 'In-app policies')
expectIncludes(read('apps/web/src/i18n.js'), 'account-deletion', 'Web FAQ i18n')
for (const file of ['apps/mobile/src/content/policies.ts', 'apps/web/src/i18n.js']) {
  for (const label of ['Profile', 'Data & account', 'More', 'Profil', 'Daten und Konto', 'Mehr']) {
    expectIncludes(read(file), label, `${file} deletion guidance for both personas`)
  }
}

const assetLinks = read('apps/web/src/.well-known/assetlinks.json')
expectIncludes(assetLinks, 'com.renuirug.anstoss', 'Android App Links association')
expectIncludes(
  assetLinks,
  '92:FC:95:00:C7:B8:D6:55:9B:82:E4:15:53:9A:6D:D8:97:B4:74:4D:F3:89:EC:99:F5:CD:B3:40:9A:81:A1:CE',
  'Android EAS signing fingerprint',
)
expectIncludes(assetLinks,
  '77:59:FA:F6:E2:90:91:92:AC:DE:B0:2B:4E:E6:82:48:01:8F:9B:6B:97:F2:BD:99:30:C0:0D:B1:03:E2:7B:45',
  'Android Play app-signing fingerprint supplied by operator on 2026-10-28')
expectIncludes(
  read('apps/web/nginx.conf'),
  '/.well-known/assetlinks.json',
  'Android App Links nginx route',
)

const storeChecklist = read('docs/launch/store-submission.md')
for (const needle of [
  'App Store Connect',
  'Google Play',
  'account-deletion',
  'SYSTEM_ALERT_WINDOW',
  'Data Safety',
  'privacy labels',
]) {
  expectIncludes(storeChecklist, needle, 'Store submission checklist')
}

const generatedLocaleFiles = walk('apps/mobile/src/i18n/generated').filter((file) =>
  file.endsWith('.ts'),
)
const baseLocaleFiles = walk('apps/mobile/src/i18n').filter(
  (file) =>
    file.endsWith('.ts') &&
    !file.includes('/generated/') &&
    !file.includes('/__tests__/') &&
    !file.endsWith('index.ts'),
)
scanForbidden(
  [
    ...generatedLocaleFiles,
    ...baseLocaleFiles,
    'apps/mobile/.env.example',
    'apps/mobile/.env.production',
    'apps/mobile/src/components/billing/PaywallSheet.tsx',
    'apps/mobile/app/admin-billing.tsx',
  ],
  [
    { re: /TestFlight/i, label: 'TestFlight release copy' },
    {
      re: /(?:scrap(?:e|ing)|auto(?:matic)?(?:ally)?\s+(?:sync|import)).{0,60}(?:FUSSBALL\.DE|fussball\.de)/i,
      label: 'unlicensed source-ingestion claim',
    },
    { re: /Anstoss Plus/i, label: 'Anstoss Plus digital-upgrade copy' },
    { re: /STRIPE_PLUS|EXPO_PUBLIC_STRIPE_PLUS/i, label: 'external Plus price env' },
    { re: /Upgrade to/i, label: 'digital upgrade copy' },
    { re: /€\s?19|19,99|19\.99/i, label: 'old digital subscription price' },
    {
      re: /Stripe checkout|checkout Stripe|Secure checkout/i,
      label: 'external digital checkout copy',
    },
    { re: /Platform billing|Plattform-Abrechnung/i, label: 'platform billing copy' },
    { re: /proPlan:\s*['"]Pro['"]/i, label: 'Pro platform plan copy' },
    {
      re: /Subscription will cancel|Das Abo wird|abonnement sera annul|abbonamento verr|subscrição será cancelada/i,
      label: 'subscription cancellation copy',
    },
    {
      re: /Stripe covers Anstoss|Stripe deckt Anstoss|Stripe couvre Anstoss|Stripe copre Anstoss|Stripe cobre a Anstoss/i,
      label: 'external platform billing explainer',
    },
    {
      re: /Stripe.{0,80}(?:used|utilisé|usado|usato|genutzt|kullanılır).{0,80}(?:dues|contributions|cotisations|quote|quotas|Beiträge|Mitgliedsbeiträge|aidat)/i,
      label: 'Stripe club-dues processing claim',
    },
  ],
  'Mobile store-copy scan',
)

scanForbidden(
  ['apps/web/src/index.html', 'apps/web/src/i18n.js', 'apps/web/src/main.js'],
  [
    { re: /FUSSBALL\.DE|fussball\.de/i, label: 'unlicensed public data-source claim' },
    { re: /Verein Plus|Club Plus/i, label: 'external digital plus-plan copy' },
    { re: /Premium-Features|Premium features/i, label: 'paid digital premium copy' },
    {
      re: /Beitragseinzug per Stripe|Stripe membership-dues collection/i,
      label: 'Stripe marketing copy',
    },
    { re: /29&thinsp;€|29\s?€/i, label: 'old external plus price' },
  ],
  'Public web store-copy scan',
)

if (failures.length) {
  console.error('Store readiness audit failed:')
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log('Static store source/configuration audit passed (not launch approval).')
console.log('Unverified here: store-console disclosures, Play app-signing certificate, production/device journeys, legal sign-off and pilot outcomes.')
