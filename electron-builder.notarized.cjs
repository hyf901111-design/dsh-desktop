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
