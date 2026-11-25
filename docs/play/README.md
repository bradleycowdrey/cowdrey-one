# Cowdrey One on Google Play

Everything Google Play shows for Cowdrey One lives in this folder:

- `listing.json`: title, short and full description, contact email and website.
- `icon.png`: 512 × 512, from the full-bleed 1024 icon (`desktop/src-tauri/icons/ios-source.png`); Play rounds the corners.
- `feature-graphic.png`: 1024 × 500, the family style on Cowdrey One's clay sky.
- `phone-1.png` … `phone-5.png`: 1080 × 2160 screenshots of the Google Play version, in dark mode, in the order of
  the App Store pictures: Discover; an app's page (Meridian) with its screenshots in a row; Get Every App; the
  Library; Share. They are the app's own screens at a Pixel 7's width (412 dp), taken from the files the Play
  build bundles (`STORE=play node desktop/build.mjs`, then `desktop/dist`) with the native side stood in for as in
  `tests/e2e.cjs`, Two Degrees and Bearings shown as installed from Google Play, and the apps' real GitHub releases.

## The Google Play version

Same app, same package (`com.bradcowdrey.cowdreyone`), a separate build. Google Play doesn't allow an app to install
other apps or download APKs, so:

- **No install permission.** The Play build's manifest removes `REQUEST_INSTALL_PACKAGES` (which the installer
  plugin adds for the GitHub APK) with `tools:node="remove"`, and CI stops the build if the bundle still asks for it.
  The installer plugin also refuses to install when the app doesn't have that permission.
- **Each app from its Google Play page.** `desktop/build.mjs` with `STORE=play` adds `store.js`
  (`window.COWDREY_STORE = 'play'`). In the Android app, `web/app.js` then gets every app with an Android version
  from `play.google.com/store/apps/details?id=<package>` (Android hands it to the Play Store); apps without one open
  on the web, as before. No APK links, no Install All, no "Allow Cowdrey One to install apps" sheet, no update
  badges or Check for updates (Google Play updates the apps). It still sees which apps are installed (the
  `<queries>` list stays) and offers Open. The Share screen offers Cowdrey One's Google Play page instead of the APK.
- **The GitHub APK and every other build are unchanged.** Play signs its copy with Google's app signing key and the
  APK is signed with the upload key, so one can't install over the other: switching means uninstalling first.

## Builds and uploads

- **Android app** (`.github/workflows/android-app.yml`) builds both: the APK for the GitHub release, then the Google
  Play App Bundle, checks the bundle (package, version code, target API, no install permission, and that it carries
  `store.js` while the APK doesn't) and signs it with the upload key. Every run keeps `CowdreyOne-GooglePlay.aab` in the run's artifact **CowdreyOne-Android**.
- **Only runs started by hand on `main` go to the closed test:** Actions → Android app → Run workflow. Pushes build
  and check the bundle but never send it.
- **Google Play listing** (`.github/workflows/play-listing.yml`) sends the text and pictures here when they change on
  `main` (not for edits to this README), or when run by hand.

**Version codes.** Play takes a build only with a higher version code than the last. Tauri's code comes from the
version number (1.0.0 is 1000000), which doesn't change between builds, so the Play bundle's code is
**100000000 + the Android app workflow's run number** (`--config` sets `bundle.android.versionCode`), and every run
has a higher one. The APK keeps Tauri's code (1000000 for 1.0.0), below every Play code until version 100.
Re-running a run reuses its number, so Play skips it (`[SKIP]` in the log): start a new run instead.

**Target API level.** Play requires new apps to target Android 16 (API 36) or later. The Tauri CLI pinned in
`desktop/package-lock.json` (2.12.1) generates the Android project in CI with `compileSdk` and `targetSdk` 37; the
check step fails the build if the bundle targets less than 36.

## One-time steps in Play Console

1. **Create app** (done): Cowdrey One, package `com.bradcowdrey.cowdreyone`, English (United States), App, Free.
2. **Let the workflows in:** Users and permissions → invite the service account's email (`client_email` in
   `PLAY_SERVICE_ACCOUNT_JSON`) for Cowdrey One with **Release to testing tracks** and **Manage store presence**.
3. **App signing:** Google-generated app signing key (Play's default, chosen for Cowdrey One). The key in the
   secrets is the upload key.
4. **First bundle:** run Actions → Android app → Run workflow on `main`. If its "Google Play closed test" step says
   Play needs the first bundle by hand: download the run's artifact **CowdreyOne-Android**, and in Testing → Closed
   testing → Closed testing - Alpha → Create new release, upload `CowdreyOne-GooglePlay.aab` (release name e.g.
   `1.0.0 (100000065)`), Next, Save. After that the workflow uploads each new run itself.
5. **App content** (Policy → App content, answers below) and **Store settings** (Grow users → Store presence → Store
   settings): category **Tools** (the App Store has it in Utilities); contact email **legal@bradcowdrey.com**;
   website https://bradleycowdrey.github.io/cowdrey-one/ (the listing workflow sends these two).
6. **Closed test:** Testing → Closed testing → Closed testing - Alpha (the track the workflow releases to) →
   Testers: an email list with at least 12 people; Countries and regions: where they are (or all). Then send the
   release the workflow uploaded for review and roll it out, and send testers the opt-in link.
7. **12 testers, 14 days:** a personal developer account can apply for production only after a closed test with at
   least 12 testers who stay opted in for 14 days in a row.

## Suggested answers for App content

Checked against the code (`web/app.js`, `web/catalog.js`, the installer plugin) and the Terms. **Before review:**
the Terms (`TERMS.md`, kept in cowdrey-md) don't have Cowdrey One yet; add it to Sections 6, 15 and 25, as the
main README says, so the privacy policy describes this app too.

- **Privacy policy:** https://bradcowdrey.com/legal
- **Ads:** No.
- **App access:** All functionality is available without special access (no account; first launch only asks to
  agree to the Terms).
- **Content rating:** category **All Other App Types**. It lists Bradley Cowdrey's own free apps and links to their
  store pages and web versions; it sells nothing, so it isn't a store. Answer **No** to every question: no violence,
  fear, sexuality, language, controlled substances, gambling or crude humour; users can't talk to or exchange
  content with other users (Share hands a link to the apps the user picks); no location; no purchases of digital
  goods; not a web browser or search engine (pages open in the browser or the Play Store). Expect **Everyone /
  PEGI 3 / IARC 3+**.
- **Target audience:** **13–15, 16–17 and 18 and over**. Not designed for children (the Terms say the Services
  aren't directed to children under 13); the listing doesn't appeal to children.
- **News app:** No. **Government app:** No. **Financial features:** none. **Health:** none. **Advertising ID:** not
  used (no ads or analytics libraries).
- **Permissions:** Internet, and the specific packages in `<queries>` (Bradley's five Android apps) to see which are
  installed. No `QUERY_ALL_PACKAGES`, so there is no permissions declaration to fill in.

### Data safety

- *Does your app collect or share any of the required user data types?* **No.** Then submit; the encryption and
  deletion questions are only asked when data is collected.
- What leaves the phone, from the code:
  - The one request Cowdrey One makes itself: GitHub's public releases API
    (`api.github.com/repos/bradleycowdrey/<app>/releases/latest`), at most every six hours for all six apps, and for
    one app when its page is opened and its notes are over an hour old. It reads version numbers and release notes.
    It sends nothing about the user: no identifier, account, location or list of installed apps; GitHub sees the
    IP address, as with any web request.
  - Get and Open hand an address to Android: an app's Google Play page (the Play Store app), a web version (the
    browser), or an installed app. Share hands Cowdrey One's link to the app the user picks. These are the user's
    own actions in other apps, not collection.
- What stays on the phone: which of Bradley's apps are installed (read through `<queries>`, kept in the app's own
  storage), settings, and the Terms agreement. No servers of Bradley's own, analytics, ads, crash reporting or
  third-party SDKs; fonts, icons and screenshots are built into the app.
- Where Google's definitions leave room for judgement: the family's cautious rule (data the app sends to a
  third-party service counts as **shared**) changes nothing here, because the GitHub requests carry none of Play's
  data types. The closest call is the release-notes request when a page is opened, which tells GitHub that someone
  at that IP address looked at that app's notes; it's a content request like any web page's, not tracking, and
  carries no identifier. If you'd rather declare it, it would be App activity → App interactions: shared (with
  GitHub), not optional, for App functionality, encrypted in transit, nothing to delete.

## Repository secrets

- `PLAY_SERVICE_ACCOUNT_JSON`: the Google Cloud service account's JSON key (as for the other apps). Without it,
  nothing is sent to Play and the workflows still pass.
- The upload key, already used by the Android workflow: `ANDROID_KEYSTORE` (base64; `ANDROID_KEYSTORE_B64` also
  works), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD` only if the key's password
  differs. Without them the Play bundle is built and checked but not signed or uploaded.
