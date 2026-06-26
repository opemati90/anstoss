import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

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
  }
}

type EasJson = {
  build?: Record<string, { credentialsSource?: string; environment?: string }>
}

const appJson = json<AppJson>('apps/mobile/app.json')
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
expectNotIncludes(
  releaseManifest,
  'android.permission.SYSTEM_ALERT_WINDOW',
  'Android release manifest',
)
for (const permission of [
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VIDEO',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
]) {
  expectNotIncludes(releaseManifest, permission, 'Android release manifest')
}

const buildGradle = read('apps/mobile/android/app/build.gradle')
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
expectIncludes(
  buildGradle,
  'gradle.taskGraph.whenReady',
  'Android release signing fail-fast guard',
)

const easJson = json<EasJson>('apps/mobile/eas.json')
expect(
  easJson.build?.production?.credentialsSource === 'remote',
  'EAS production profile must use remote credentials',
)
expect(
  easJson.build?.testflight?.credentialsSource === 'remote',
  'EAS testflight profile must use remote credentials',
)

const infoPlist = read('apps/mobile/ios/Anstoss/Info.plist')
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

const privacyManifest = read('apps/mobile/ios/Anstoss/PrivacyInfo.xcprivacy')
expectIncludes(privacyManifest, '<key>NSPrivacyTracking</key>', 'iOS privacy manifest')
expectIncludes(privacyManifest, '<false/>', 'iOS privacy manifest tracking flag')
for (const dataType of [
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
for (const needle of ['privacy@anstoss.io', 'within 30 days', 'More', 'Data', 'Delete account']) {
  expectIncludes(accountDeletion, needle, 'Account deletion page')
}
expectIncludes(read('apps/web/src/legal.html'), 'account-deletion', 'Web legal page')
expectIncludes(read('apps/mobile/src/content/policies.ts'), 'account-deletion', 'In-app policies')
expectIncludes(read('apps/web/src/i18n.js'), 'account-deletion', 'Web FAQ i18n')

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
    { re: /FUSSBALL\.DE|fussball\.de/i, label: 'unlicensed source-brand copy' },
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

console.log('Store readiness audit passed')
