# Building and installing on iPhone / iPad

**No iOS binary has been produced yet.** In this repository's development environment (Linux) the
app was type-checked and its iOS JavaScript bundle was built (`expo export --platform ios`), which
proves the code bundles for iOS; it does not prove it runs on a device. The first device run may
surface issues that a browser run cannot.

You need: an Apple ID, and for installation on real devices an **Apple Developer Program**
membership (paid). A Mac is *not* required when building with EAS in the cloud.

## 0. Point the app at your backend
The phone must reach the backend over HTTPS. Set the URL in `mobile/eas.json`
(`EXPO_PUBLIC_API_URL`) for the `preview` and `production` profiles. The login screen also has a
"Server URL" field for changing it later.

## 1. Fastest look, no build: Expo Go
```bash
cd mobile && npm ci && npx expo start
```
Scan the QR code with the iPhone camera (Expo Go from the App Store, same Wi-Fi). Suitable for
checking screens. Push notifications and the final bundle identifier need a real build.

## 2. Installable build with EAS (no Mac needed)
```bash
npm install -g eas-cli
cd mobile
eas login
eas init                                   # creates the project id (needed for push notifications)
# set a bundle identifier you own in app.json -> expo.ios.bundleIdentifier (replace com.example…)
eas device:create                          # registers your iPhone/iPad UDID (open the link on each device)
eas build --platform ios --profile preview # EAS creates the certificate and ad-hoc profile for you
```
When the build finishes EAS shows an install link / QR code: open it on the registered device.
On first launch enable Developer Mode if iOS asks (Settings → Privacy & Security → Developer Mode).

For wider distribution use TestFlight:
```bash
eas build --platform ios --profile production
eas submit --platform ios                  # uploads to App Store Connect
```

## 3. Local build with Xcode (Mac)
```bash
cd mobile && npm ci
npx expo prebuild --platform ios           # generates ios/
open ios/*.xcworkspace
```
In Xcode: select the target → Signing & Capabilities → choose your Team → set the bundle
identifier → pick your device → Run. A free Apple ID can install to your own device for 7 days;
push notifications require the paid program.

## iPad
`supportsTablet` is on and all orientations are enabled. At ≥900 pt width the app switches to a
side rail with multi-column screens; narrower widths use bottom tabs.

## Push notifications
After installing a real build: Settings → "Enable push on this device". The server stores the Expo
push token and sends through Expo's push service. Delivery has not been tested on a device yet.

## Windows desktop and browser
```bash
cd mobile && npx expo export --platform web --output-dir dist
```
The backend serves `mobile/dist` at `/` (set `ATP_WEB_DIST_DIR`, done automatically by
`docker-compose.yml` and `scripts/dev.sh`). On Windows open it in Edge → ⋯ → Apps → *Install this
site as an app* for a desktop window. There is no native Windows binary.
