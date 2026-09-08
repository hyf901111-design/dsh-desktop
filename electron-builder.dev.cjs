const packageJson = require('./package.json')

module.exports = {
  ...packageJson.build,
  appId: 'io.dsh.desktop.dev',
  productName: 'EWork Odyssey Dev',
  directories: {
    ...packageJson.build.directories,
    output: 'dist-dev'
  },
  extraMetadata: {
    name: 'sherlock-dev',
    productName: 'EWork Odyssey Dev',
    dshDesktopChannel: 'development'
  },
  nsis: {
    ...packageJson.build.nsis,
    artifactName: 'sherlock-dev-windows-${arch}-setup.${ext}'
  },
  publish: null
}
