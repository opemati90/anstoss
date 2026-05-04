# Cookie‑ und Tracking‑Richtlinie

Stand: [ANSTOSS_LEGAL_VERSION_DATE]

## 1. Was sind Cookies und ähnliche Technologien?

Cookies sind kleine Textdateien, die dein Gerät beim Besuch unserer Webseite ablegen. In der Mobile‑App nutzen wir keine Browser‑Cookies, jedoch ähnliche Technologien wie:
- **Secure Storage** (zur Speicherung deines Auth‑Tokens)
- **AsyncStorage** (für App‑Einstellungen wie Sprache, Cache)
- **Push‑Tokens** (Apple/Google, zur Zustellung von Benachrichtigungen)
- **Server‑Logs** (IP, User‑Agent — für Sicherheit und Fehlersuche)

## 2. Welche Speicherung findet statt?

### 2.1 Notwendig (keine Einwilligung erforderlich, Art. 6 Abs. 1 lit. b DSGVO)
| Schlüssel | Zweck | Aufbewahrung |
|---|---|---|
| `clerk_session` | Authentifizierung (OTP‑Login) | bis zur Abmeldung |
| `app_language` | Gewählte App‑Sprache | bis zur Änderung |
| `e2e_session` | Test‑/Entwicklungs­modus | nur in Dev‑Builds |
| Push‑Token | Zustellung von Benachrichtigungen | bis zur App‑Deinstallation oder Widerruf |

### 2.2 Funktional/Statistik (Art. 6 Abs. 1 lit. f DSGVO)
| Anbieter | Zweck | Aufbewahrung |
|---|---|---|
| Sentry | Anonymisierte Fehler‑ und Absturz­berichte | 90 Tage |
| Server‑Logs | IP‑Adresse, Endpunkt, Status­code | 30 Tage |

Wir setzen **keine** Marketing‑ oder Werbe‑Tracker (kein Google Analytics, Facebook Pixel, etc.).

## 3. Push‑Benachrichtigungen

Push‑Benachrichtigungen werden nur mit deiner Einwilligung über das System‑Dialogfeld deines Geräts versendet. Du kannst die Berechtigung jederzeit in den Geräte­einstellungen oder unter „Mehr → Benachrichtigungen" widerrufen.

## 4. Übersetzungs‑Cache

Damit Chat‑Nachrichten in der Sprache der Empfänger:innen angezeigt werden, speichern wir die übersetzte Variante einmalig pro Ziel­sprache. Die Übersetzung wird über unseren selbst gehosteten LibreTranslate‑Server in der EU erstellt — die Nachricht verlässt unsere Infrastruktur nicht.

Wenn du eine Nachricht löschst, wird der zugehörige Übersetzungs‑Cache automatisch mit gelöscht (Kaskade).

## 5. Drittanbieter

Eine vollständige Liste aller Auftrags­verarbeiter findest du in unserer Datenschutz­erklärung, Abschnitt 5.

## 6. Widerruf

Notwendige Speicherungen sind für den Betrieb der App unverzichtbar — bei einem Widerruf kannst du die App nicht mehr nutzen. Funktionale Einwilligungen (Push, Telemetrie) kannst du in „Mehr → Einstellungen" jederzeit deaktivieren.

## 7. Kontakt

Bei Fragen zu Cookies und Tracking: [ANSTOSS_PRIVACY_EMAIL]
