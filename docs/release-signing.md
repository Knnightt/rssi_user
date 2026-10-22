# Mobile app release signing

Signing keys identify the published app. Keep private keys and passwords in secure storage and keep them out of Git. Never reuse the Android debug key for a release.

## Android

This project reads release signing values from `android/keystore.properties`; the file and `.jks` files are ignored by Git. The checked-in `android/keystore.properties.example` is only a template.

1. From PowerShell at the repository root, generate a private upload keystore. `keytool` is included with a JDK; Android Studio includes its own JDK.

   ```powershell
   keytool -genkeypair -v -keystore android/app/rssi-upload-key.jks -storetype JKS -alias rssi-upload -keyalg RSA -keysize 2048 -validity 10000
   ```

   Choose and record strong passwords. Keep an encrypted backup of the keystore and passwords in a secure location. Losing the upload key can prevent future uploads until the key is reset in Play Console.

2. Create the local signing properties and enter the same passwords used above:

   ```powershell
   Copy-Item android/keystore.properties.example android/keystore.properties
   notepad android/keystore.properties
   ```

3. Build a signed Android App Bundle for Play Console:

   ```powershell
   Push-Location android
   .\gradlew.bat bundleRelease
   Pop-Location
   ```

   The bundle is written to `android/app/build/outputs/bundle/release/app-release.aab`. For Google Play, enroll the app in Play App Signing and use this key as the upload key. The private keystore must never be checked into the repository.

   To build a signed APK for direct installation instead, run `assembleRelease` in place of `bundleRelease`.

## iOS

iOS distribution signing must be completed on a Mac with Xcode and access to the team's Apple Developer account. The project currently has a React Native sample bundle identifier; set a permanent, unique bundle identifier in Xcode before registering the App ID. Then select the Apple Developer team and enable **Automatically manage signing** in the RSSI_User target's **Signing & Capabilities**. Xcode can create and manage the distribution certificate and provisioning profile for that team. Do not commit exported certificates, private keys, or provisioning profiles.

## Before distributing either build

- Replace the temporary ngrok API base URL in `src/config.ts` with the stable HTTPS address used for the release backend. The backend needs its own valid TLS certificate; that is separate from the Android/iOS app signing certificates.
- Increment Android `versionCode` / `versionName` and iOS `CURRENT_PROJECT_VERSION` / `MARKETING_VERSION` for each release.
- Set the final Android application ID and iOS bundle identifier before publishing the first store release. Changing them later creates a different app listing.
- Confirm the backend and privacy/support information are ready for the stores. A signing certificate alone does not make a build store-ready.
