# Anstoss legal documents

Drafts of the policies the More tab links to. All copies use placeholders
that need to be filled in before publishing — search for `[ANSTOSS_` in
each file.

## Required placeholders

| Placeholder | Example |
|---|---|
| `[ANSTOSS_LEGAL_NAME]` | Anstoss GmbH |
| `[ANSTOSS_STREET]` | Friedrichstraße 123 |
| `[ANSTOSS_POSTAL_CODE]` | 10117 |
| `[ANSTOSS_CITY]` | Berlin |
| `[ANSTOSS_PHONE]` | +49 30 1234567 |
| `[ANSTOSS_CONTACT_EMAIL]` | hallo@anstoss.io |
| `[ANSTOSS_PRIVACY_EMAIL]` | privacy@anstoss.io |
| `[ANSTOSS_REPRESENTATIVE_NAME]` | Max Mustermann |
| `[ANSTOSS_REGISTRY_COURT]` | Amtsgericht Berlin‑Charlottenburg |
| `[ANSTOSS_HRB_NUMBER]` | 123456 B |
| `[ANSTOSS_VAT_ID]` | DE123456789 |
| `[ANSTOSS_RESPONSIBLE_NAME]` | Max Mustermann |
| `[ANSTOSS_RESPONSIBLE_ADDRESS]` | (same as imprint) |
| `[ANSTOSS_DPO_NAME]` | Erika Datenschutz |
| `[ANSTOSS_DPO_EMAIL]` | dpo@anstoss.io |
| `[ANSTOSS_DPA_AUTHORITY]` | Berliner Beauftragte für Datenschutz und Informationsfreiheit |
| `[ANSTOSS_JURISDICTION_CITY]` | Berlin |
| `[ANSTOSS_LEGAL_VERSION_DATE]` | 2 May 2026 |

## Files

```
de/
  impressum.md         — Impressum (TMG §5, MStV §18)
  datenschutz.md       — DSGVO‑konforme Datenschutzerklärung
  agb.md               — Nutzungsbedingungen / AGB
  cookies.md           — Cookie‑ und Tracking‑Richtlinie

en/
  imprint.md           — English imprint (mirror of impressum.md)
  privacy.md           — GDPR‑aligned privacy policy
  terms.md             — Terms of service
  cookies.md           — Cookie & tracking policy
```

## Important: legal review

These are starting drafts — **not** signed‑off legal text. Before publication
you should:
1. Replace every `[ANSTOSS_…]` placeholder with your real company info.
2. Have a lawyer review the German set in particular (TMG / DSGVO are
   strict and your specific data processors and retention periods may
   need adjustment).
3. Confirm processor list (privacy §5) matches what you actually run in
   production. If you swap Clerk → another provider, or drop Stripe, etc.,
   update the docs.
4. Decide whether to participate in consumer arbitration (currently the
   imprint says "no" — you can flip that).
5. Get a Data Protection Officer (DPO) on record if you're processing data
   for ≥20 employees or doing systematic large‑scale monitoring (e.g. a
   public free‑agent marketplace at scale could trigger this).

## Wiring the in‑app screens

Currently `apps/mobile/app/(tabs)/more/index.tsx` links to
`https://anstoss.io/legal.html#…` (external). To switch to in‑app screens,
add a `legal/[doc].tsx` route that renders these markdown files via
`react-native-markdown-display` (or similar). Suggested approach:

```tsx
// apps/mobile/app/legal/[doc].tsx
import { useLocalSearchParams } from 'expo-router'
import Markdown from 'react-native-markdown-display'
import { getAppLanguage } from '../../src/i18n'

const sources = {
  de: {
    impressum: require('../../src/content/legal/de/impressum.md'),
    privacy: require('../../src/content/legal/de/datenschutz.md'),
    terms: require('../../src/content/legal/de/agb.md'),
    cookies: require('../../src/content/legal/de/cookies.md'),
  },
  en: { /* … */ },
}
```

(The Metro config will need a markdown asset loader — `metro-react-native-babel-preset` doesn't load `.md` out of the box, so either use `expo-asset` or convert these to `.ts` exports.)
