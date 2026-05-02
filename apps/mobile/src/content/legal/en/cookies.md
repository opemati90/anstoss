# Cookie and Tracking Policy

Last updated: [ANSTOSS_LEGAL_VERSION_DATE]

## 1. What are cookies and similar technologies?

Cookies are small text files stored on your device when you visit our website. The mobile app does not use browser cookies but does use similar technologies, including:
- **Secure Storage** (to store your auth token)
- **AsyncStorage** (for app settings such as language and cache)
- **Push tokens** (Apple/Google, for delivering notifications)
- **Server logs** (IP, user‑agent — for security and debugging)

## 2. What is stored?

### 2.1 Strictly necessary (no consent required, Art. 6(1)(b) GDPR)
| Key | Purpose | Retention |
|---|---|---|
| `clerk_session` | Authentication (OTP login) | Until logout |
| `app_language` | Selected app language | Until changed |
| `e2e_session` | Test/dev mode | Dev builds only |
| Push token | Delivery of notifications | Until uninstall or revocation |

### 2.2 Functional/analytics (Art. 6(1)(f) GDPR)
| Provider | Purpose | Retention |
|---|---|---|
| Sentry | Anonymised error and crash reports | 90 days |
| Server logs | IP, endpoint, status code | 30 days |

We do **not** use any marketing or advertising trackers (no Google Analytics, Facebook Pixel, etc.).

## 3. Push notifications

Push notifications are sent only with your consent via your device's system permission dialog. You can revoke the permission at any time in your device settings or under "More → Notifications".

## 4. Translation cache

So that chat messages display in the recipients' language, we cache the translated variant once per target language. Translation is performed via our self‑hosted LibreTranslate server in the EU — the message never leaves our infrastructure.

If you delete a message, the corresponding translation cache is automatically deleted (cascade).

## 5. Third parties

A complete list of all processors is in our Privacy Policy, section 5.

## 6. Withdrawal

Strictly necessary storage is essential for the operation of the app — withdrawing consent means you can no longer use the app. Functional consents (push, telemetry) can be disabled at any time under "More → Settings".

## 7. Contact

For questions about cookies and tracking: [ANSTOSS_PRIVACY_EMAIL]
