# MNIS Citizen App (Flutter)

The citizen-facing mobile app for the **MNIS** national medical identity system. Talks to the same `mnis-api` backend as the clinical staff portal.

## What this app does

Citizens sign in with their **national ID + password** (accounts are opened by hospital reception on the first visit — there is no self-registration) and can:

- View their medical profile, prescriptions and **verified** lab results
- Request an appointment and cancel a pending/confirmed one
- Request a renewal of a *dispensed* prescription (a doctor reviews and signs it)
- Generate a one-time, 10-minute code a doctor can use to view their record (`Share with a doctor`)
- Request a **lab-only appointment** (no doctor needed) by naming the test, separate from a clinic visit
- **Upload their own medical documents** (a photo or PDF of an outside lab result/report) and view/share them back out
- Open an **offline-capable emergency card**: blood type, allergies, chronic conditions, organ-donor status, plus up to 3 on-device emergency contacts and a one-tap call to the ambulance hotline (137) — all reachable from the login screen without signing in, and cached on-device so it still works with no signal

## Setup

```bash
flutter pub get
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3001   # Android emulator + local backend
```

`API_BASE_URL` is read at build/run time (see `lib/core/config/env.dart`):

| Target | Value |
|---|---|
| Android emulator + backend running on your machine | `http://10.0.2.2:3001` |
| Physical phone + backend on your machine | `http://<your-computer-LAN-IP>:3001` (same Wi‑Fi) |
| Production | `https://<your-mnis-api>.onrender.com` (the default baked into `env.dart` — replace it with your real API URL before building) |

A debug-only manifest override (`android/app/src/debug/AndroidManifest.xml`) allows plain `http://` for the two local-dev rows above; release builds stay HTTPS-only.

## Building a release APK/AAB

1. Create a keystore once (see `android/key.properties.example` for the exact command) and copy that file to `android/key.properties`, filling in your real values. Keep the `.jks` file and `key.properties` **out of git** — both are already ignored.
2. ```bash
   flutter build appbundle --dart-define=API_BASE_URL=https://your-mnis-api.onrender.com
   ```
   Without `key.properties`, this still builds (signed with the debug key) so you can test the release build shape locally — **never upload a debug-signed build to a store.**
3. Before publishing, update `android/app/build.gradle.kts`'s `applicationId` (currently a placeholder) to your own package name, and set a real app name in `android/app/src/main/AndroidManifest.xml`.

Play Store publishing needs a one-time Google Play developer registration fee and its own signing/upload flow — this project gets you to a signed `.aab`, not through the store console itself.

## Architecture

```
lib/
  core/
    config/env.dart            API base URL
    network/                   ApiClient (401→refresh→retry), ApiException, MnisRepository (one method per endpoint)
    storage/                   SecureSessionStore (refresh token + offline emergency/profile cache, flutter_secure_storage)
    models/                    Typed models mapping the API's camelCase JSON to what the UI uses
    providers/                 session_provider (login/logout/change-password/bootstrap),
                                data_providers (profile, emergency card, prescriptions, labs, visits,
                                appointments, doctors, renewals + derived dashboard/timeline),
                                emergency_contacts_provider (local-only, SharedPreferences)
    widgets/                   AsyncValueView, EmptyState, PatientAvatar, AccountSheet (logout, change
                                password, share, appointments)
  features/                    One folder per screen (unchanged structure from the original design)
```

`ApiClient` keeps the access token in memory only; the refresh token is the only thing persisted (encrypted). A 401 anywhere triggers one shared refresh-and-retry; if that also fails, `sessionControllerProvider` clears itself and `main_shell.dart`'s listener bounces the user to `/login`.

## What changed from the original UI-only build

This project already had a fully designed UI with mock/hardcoded data. This pass wired it to `mnis-api` end to end and filled in what was structurally missing, without redesigning what already worked:

- Real auth (national ID + password, forced temporary-password change, refresh-token session persistence)
- A genuine biometric **app lock**: once enabled, every cold start *and* every return from the background requires Face/Touch ID again before the app shows anything — not a one-time check that only fires right after setup. Two Android-specific things had to be fixed for this to work at all: `MainActivity` had to extend `FlutterFragmentActivity` (plain `FlutterActivity` cannot host Android's `BiometricPrompt` — this is why biometric silently did nothing before), and the unlock had to be driven by app lifecycle events (`AppLifecycleGate` in `main.dart`), not just a button on the login screen that was rarely even reachable.
- Every screen (Home, Medical File, Lab Results, Prescriptions, Emergency QR) now reads live data instead of fixed strings
- Added: sign-out (there was no way to log out before), Appointments (request/list/cancel), prescription renewal requests, the doctor share-code flow, and editable on-device emergency contacts
- Fixed a few correctness bugs found along the way: gender was hardcoded to "Male" everywhere, the emergency-card "insurance" tile and the medical file's critical-allergy banner showed regardless of the actual patient data, and the prescriptions screen claimed an AI drug-safety check and a specific "penicillin allergy" that don't exist in the backend — that copy is now honest and data-driven. A non-functional "physician contact" block (blank phone number, no such data in the backend) was replaced with a real, dialable ambulance hotline.
- Release-readiness: proper R8 minify/shrink + a real signing-config path for `android/app/build.gradle.kts` (was debug-signed with a TODO), proguard rules, and a debug-only cleartext exception for local development.

## Known gaps (be upfront about these)

- **Not verified to compile.** This was written in a sandbox with no Flutter SDK and no internet access, so `flutter pub get` / `flutter analyze` / a real build have not been run. Please run `flutter analyze` after `pub get` and send me anything it flags — most likely small API-shape mismatches, not structural issues.
- **iOS isn't in this project** (only `android/` was present in what you sent), so nothing here has been adapted for iOS-specific config (Info.plist permissions, bundle id, etc.).
- Uploaded documents have nowhere to be reviewed yet on the lab/portal side — they sit as `PENDING_REVIEW` until that screen is built. Files are stored inline as base64 in Postgres (capped at ~4MB each), not real object storage — fine for a project this size, not for production volume.
- No automated tests, no push notifications, no password-reset-by-email flow, no in-app doctor name lookup (the backend doesn't yet join physician names onto prescriptions/appointments for the citizen view — left honestly blank rather than guessed).
- Emergency contacts and the "biometric enabled" flag are stored locally only (`SharedPreferences`) — reinstalling the app or switching phones loses them; there's no backend field for either yet.
