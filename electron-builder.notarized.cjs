const packageJson = require('./package.json')

module.exports = {
  ...packageJson.build,
  appId: 'com.evanarts.sherlock',
  productName: 'EWork Odyssey',
  artifactName: 'sherlock-${os}-${arch}.${ext}',
  directories: {
    ...packageJson.build.directories,
    output: 'dist-notarized'
  },
  extraResources: [
    ...(packageJson.build.extraResources || []),
    {
      from: 'build/sherlock-plugin-profile',
      to: 'sherlock-plugin-profile'
    },
    {
      from: 'build/app-update-notarized.yml',
      to: 'app-update.yml'
    }
  ],
  extraMetadata: {
    name: 'sherlock',
    productName: 'EWork Odyssey',
    dshDesktopChannel: 'notarized'
  },
  mac: {
    ...packageJson.build.mac,
    // PDF CMaps are data, not executable code. Keep every file in the bundle
    // and its outer resource seal, without 336 redundant codesign invocations.
    // Match only the two PDF asset roots; native modules remain signed.
    signIgnore: [
      ...[packageJson.build.mac.signIgnore || []].flat(),
      '/Contents/Resources/(?:app/node_modules/@deepseek-ai/dsh-web-frontend/dist/sherlock-pdfjs|sherlock-plugin-profile/modules/pdfjs-dist)/cmaps/[^/]+\\.bcmap$'
    ],
    notarize: true,
    target: ['dmg', 'zip']
  },
  dmg: {
    ...packageJson.build.dmg,
    sign: true
  },
  publish: [
    {
      provider: 'generic',
      url: 'https://updates.evanarts.com/notarized/latest/',
      // CDN cache misses may not support multipart ranges; keep differential downloads single-range.
      useMultipleRangeRequest: false
    }
  ]
}
