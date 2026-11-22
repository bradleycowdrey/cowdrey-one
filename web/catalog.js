/* The apps Cowdrey One offers. To add an app, copy one entry and change it; nothing else needs editing.
   - version: the latest release when this file was last edited. The app also checks GitHub releases
     (repo) for anything newer, so this only needs bumping for apps without GitHub releases.
   - sky: the gradient behind the app's card and page, from its icon (top, bottom).
   - platforms: each has a requirement line and its ways to get the app, best first. kind is one of
     appstore, testflight, macappstore, dmg, apk, web. Leave a platform out if the app isn't on it.
   - status: optional label on the card, e.g. "New" or "Preview".
   - bundle and macApp: how the Mac and Android apps of Cowdrey One find the app on the device (its Android package
     and Mac bundle ID, and its name in Applications). A new Android app also goes in the <queries> list of
     desktop/src-tauri/plugins/installer/android/src/main/AndroidManifest.xml.
   The apps appear in this order everywhere: keep it the same as the software section of bradcowdrey.com. */
window.CATALOG = {
  // Where Cowdrey One lives on the web: the QR code and Share link go here. pages.yml publishes web/ to it.
  hubUrl: 'https://bradleycowdrey.github.io/cowdrey-one/',
  // Public download links for Cowdrey One itself, once there are some. The repository is private, so its
  // GitHub release files can't be downloaded by the public: give these a public home (or the stores) first.
  hubDownloads: { ios: '', android: '', mac: '' },
  termsUrl: 'https://bradcowdrey.com/legal',
  termsVersion: '2026-11',
  developer: { name: 'Bradley Cowdrey', url: 'https://bradcowdrey.com', github: 'https://github.com/bradleycowdrey' },

  apps: [
    {
      id: 'cowdrey-pdf',
      bundle: 'com.bradcowdrey.cowdreypdf',      // Android package and Mac bundle ID
      macApp: 'Cowdrey.PDF.app',
      name: 'Cowdrey.PDF',
      subtitle: 'Edit, comment, organize and protect PDFs',
      headline: 'Sign it. Fill it. Fix it.',
      category: 'Documents',
      version: '1.0.0',
      repo: 'bradleycowdrey/cowdrey-pdf',
      page: 'https://bradcowdrey.com/cowdrey-pdf',
      sky: ['#B0234F', '#5E0A28'],
      about: 'Read, mark up, sign, fill forms and rearrange pages, with nothing leaving your device. Edit text and pictures in place, OCR, redact and compress.',
      features: [
        'Click a line to retype it in its own font and colour',
        'Highlight, draw, sticky notes and signatures',
        'Fill forms; rotate, reorder, insert and extract pages',
        'Open password-protected PDFs; passwords are never stored',
        'Every PDF you open is kept on this device, with its mark-up',
      ],
      platforms: {
        ios: { req: 'iOS 15 or later · App Store version on its way', get: [
          { kind: 'testflight', url: 'https://testflight.apple.com/join/tr4eD534' } ] },
        mac: { req: 'macOS 10.15 or later', get: [
          { kind: 'dmg', url: 'https://github.com/bradleycowdrey/cowdrey-pdf/releases/latest/download/Cowdrey.PDF.dmg' } ] },
        web: { req: 'Any modern browser', get: [ { kind: 'web', url: 'https://bradcowdrey.com/cowdrey-pdf/app' } ] },
      },
      soon: { android: 'Coming soon' },
    },
    {
      id: 'cowdrey-md',
      bundle: 'com.bradcowdrey.cowdreymd',      // Android package and Mac bundle ID
      macApp: 'Cowdrey.MD.app',
      name: 'Cowdrey.MD',
      subtitle: 'Markdown that feels like Docs and Word',
      headline: 'Write in Markdown. Read a page.',
      category: 'Writing',
      version: '2.0.2',
      repo: 'bradleycowdrey/cowdrey-md',
      page: 'https://bradcowdrey.com/cowdrey-md',
      sky: ['#4B70E6', '#1E3BA6'],
      about: 'Write Markdown on the left and see a printable page on the right, with a ribbon toolbar, live preview, math, diagrams, callouts and tables. Files stay where they are.',
      features: [
        'Side-by-side writing with a paper page, or read and tap Edit on a phone',
        'PDF and Word export on every platform',
        'A sync folder, such as iCloud Drive, for every device',
        'Search, folders, pins and 90 days of version history',
        'Your default Markdown app on Mac, iPhone, iPad and Android',
      ],
      platforms: {
        ios: { req: 'iOS 15 or later', get: [
          { kind: 'appstore', url: 'https://apps.apple.com/app/id6826704085' },
          { kind: 'testflight', url: 'https://testflight.apple.com/join/bDgfhxge' } ] },
        android: { req: 'Android 8.0 or later', get: [
          { kind: 'apk', url: 'https://github.com/bradleycowdrey/cowdrey-md/releases/latest/download/Cowdrey.MD.apk' } ] },
        mac: { req: 'macOS 10.15 or later', get: [
          { kind: 'dmg', url: 'https://github.com/bradleycowdrey/cowdrey-md/releases/latest/download/Cowdrey.MD.dmg' } ] },
        web: { req: 'Any modern browser', get: [ { kind: 'web', url: 'https://bradcowdrey.com/cowdrey-md/app' } ] },
      },
    },
    {
      id: 'meridian',
      bundle: 'com.bradcowdrey.meridian',      // Android package and Mac bundle ID
      macApp: 'Meridian.app',
      name: 'Meridian',
      subtitle: 'A world clock and time-zone planner',
      headline: 'Every time zone at a glance.',
      category: 'Productivity',
      version: '2.1.4',
      repo: 'bradleycowdrey/meridian',
      page: 'https://bradcowdrey.com/meridian',
      sky: ['#4A7DB8', '#16243A'],
      about: 'Each city on a photo of its skyline, by day or by night there, with its time, a status (Working, Off hours, Weekend or the holiday’s name) and hour tiles that make working hours stand out.',
      features: [
        'Find a Time: see when everyone is working, then send the invite',
        'People and groups: a card for a colleague in their city',
        'Public holidays count as days off, by name, in every country',
        '34,000 cities, offline',
        'Clock-change notices two weeks ahead',
      ],
      platforms: {
        ios: { req: 'iOS 17 or later · iPhone', get: [
          { kind: 'appstore', url: 'https://apps.apple.com/app/id6826713540' } ] },
        android: { req: 'Android 8.0 or later', get: [
          { kind: 'apk', url: 'https://github.com/bradleycowdrey/meridian/raw/ci-android/Meridian-debug.apk' } ] },
        mac: { req: 'macOS 14 or later', get: [
          { kind: 'dmg', url: 'https://github.com/bradleycowdrey/meridian/releases/latest/download/Meridian.dmg' } ] },
        web: { req: 'Any modern browser', get: [ { kind: 'web', url: 'https://bradcowdrey.com/meridian' } ] },
      },
    },
    {
      id: 'two-degrees',
      bundle: 'com.bradcowdrey.twodegrees',      // Android package and Mac bundle ID
      macApp: 'TwoDegrees.app',
      name: 'Two Degrees',
      subtitle: 'The weather in °F and °C at once',
      headline: 'Two scales. One forecast.',
      category: 'Weather',
      version: '2.3.5',
      repo: 'bradleycowdrey/two-degrees',
      page: 'https://bradcowdrey.com/two-degrees',
      sky: ['#6B86AD', '#2A3550'],
      about: 'Every temperature twice, °F and °C side by side, so nobody has to do the math. Each city on its own sky, with widgets on every platform.',
      features: [
        '°F and °C side by side, everywhere: pick which one is large',
        'The next 2 hours of rain, the next 24 hours and 10 days',
        'Twelve detail tiles, from feels like and wind to air quality and the moon',
        'A rain map for the last two hours',
        'Widgets for iPhone, iPad, Mac and Android',
      ],
      platforms: {
        ios: { req: 'iOS 17 or later', get: [
          { kind: 'appstore', url: 'https://apps.apple.com/app/id6826694344' } ] },
        android: { req: 'Android 8.0 or later', get: [
          { kind: 'apk', url: 'https://github.com/bradleycowdrey/two-degrees/releases/latest/download/TwoDegrees.apk' } ] },
        mac: { req: 'macOS 14 or later', get: [
          { kind: 'macappstore', url: 'https://apps.apple.com/app/id6826694344?platform=mac' },
          { kind: 'dmg', url: 'https://github.com/bradleycowdrey/two-degrees/releases/latest/download/TwoDegrees.dmg' } ] },
        web: { req: 'Any modern browser', get: [ { kind: 'web', url: 'https://bradcowdrey.com/two-degrees/app' } ] },
      },
    },
    {
      id: 'bearings',
      bundle: 'com.bradcowdrey.bearings',      // Android package and Mac bundle ID
      macApp: 'Bearings.app',
      name: 'Bearings',
      subtitle: 'Compass, place, elevation, sun and moon',
      headline: 'Get your bearings.',
      category: 'Navigation',
      status: 'New',
      version: '2.3.1',
      repo: 'bradleycowdrey/bearings',
      page: 'https://bradcowdrey.com/bearings',
      sky: ['#3D74B0', '#14243B'],
      about: 'The compass, where you are, the time, your coordinates and elevation, the sun and moon, and a map, on one screen. Free and open source, with widgets.',
      features: [
        'A clear compass, true or magnetic north, with the declination and accuracy',
        'The town you’re in, the date and time, on a bar the colour of the sky',
        'Elevation in feet and metres at once',
        'Six coordinate formats, from decimal degrees to MGRS and Plus Codes',
        'Lock a bearing or mark a spot, and see how far you’ve turned or walked',
        'Night mode, all in red, to keep your night vision',
      ],
      platforms: {
        ios: { req: 'iOS 17 or later', get: [
          { kind: 'appstore', url: 'https://apps.apple.com/app/id6831731564' },
          { kind: 'testflight', url: 'https://testflight.apple.com/join/b2g6WgZb' } ] },
        android: { req: 'Android 8.0 or later', get: [
          { kind: 'apk', url: 'https://github.com/bradleycowdrey/bearings/releases/latest/download/Bearings.apk' } ] },
        mac: { req: 'macOS 14 or later', get: [
          { kind: 'dmg', url: 'https://github.com/bradleycowdrey/bearings/releases/latest/download/Bearings.dmg' } ] },
        web: { req: 'Any modern browser', get: [ { kind: 'web', url: 'https://bradcowdrey.com/bearings/app.html' } ] },
      },
    },
    {
      id: 'golden-hour',
      name: 'Golden Hour',
      subtitle: 'Sunset forecast and evening planner',
      headline: 'Which evenings are worth it.',
      category: 'Weather',
      status: 'Preview',
      version: '0.8.0',
      repo: 'bradleycowdrey/golden-hour',
      page: 'https://bradleycowdrey.github.io/golden-hour/',
      changelog: 'https://github.com/bradleycowdrey/golden-hour#readme',
      sky: ['#2B2552', '#C2705A'],
      about: 'Rates every coming sunset from 0.0 to 5.0 stars for the places you care about, says which evenings to go and which to skip, and plans the good ones: where to watch from, when to leave and what to bring.',
      features: [
        'A star rating for each evening, led by the colour in the clouds',
        'Go, Maybe or Skip, with one plain sentence of why',
        'Where to watch from: landmarks, adventures and dining with a view',
        'The moon this evening, and golden hour, sunset and last light',
        'Add it to your Home Screen; it works like an app',
      ],
      platforms: {
        web: { req: 'Any modern browser · add it to your Home Screen', get: [
          { kind: 'web', url: 'https://bradleycowdrey.github.io/golden-hour/' } ] },
      },
    },
  ],
};
