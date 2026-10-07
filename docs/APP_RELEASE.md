# Vuka Music apps: production release checklist

The Android/Windows/Mac downloads on `/downloads` go through
`/api/app-download/<windows|mac|android>`, which logs the download in
`download_logs` (itemType `app`) and redirects to the newest GitHub release file.

## Why the Android APK threw an error
The old `vuka-mobile-build.yml` publishes `assembleDebug`, a *debug* build. Debug
builds do not contain the JavaScript bundle and expect a Metro dev server, so they
fail on a normal phone. Production builds come from `vuka-signed-mobile-release.yml`
(EAS, `production-apk` profile) and embed the bundle.

## One-time setup (cannot be done from code)
Add these to GitHub > Settings > Environments > `production-release` > Secrets:

| Platform | Secrets |
|---|---|
| Android + iOS (EAS) | `EXPO_TOKEN` (create at expo.dev > Access tokens) |
| Android keystore | first run `npx eas-cli build --platform android --profile production-apk` once on your PC and accept "generate a new keystore" |
| Windows | `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` (code-signing certificate) |
| macOS | `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`, `APPLE_TEAM_ID` (Apple Developer account) |

Android needs only `EXPO_TOKEN` + the keystore. iOS, Windows and Mac each need a
paid developer/certificate account, and a platform whose secrets are missing fails on its own and no longer blocks the others from being published.

## Releasing
1. Bump the version in `apps/mobile/app.json` and `apps/desktop/package.json`.
2. Push a tag, e.g. `git tag v1.0.3 && git push origin v1.0.3` (update the tag in the
   two `vuka-signed-*` workflows), or run the workflows manually (Actions > Run workflow).
3. `/downloads` automatically serves the newest release.

## Icons
`npm install` in `apps/mobile` and `apps/desktop` regenerates the PNG icons from
the SVG sources (`apps/mobile/assets/icon-source.svg`, `apps/desktop/build/icon.svg`).
