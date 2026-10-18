// electron-builder afterPack hook.
// Apple Silicon refuses to run unsigned apps, and packaging invalidates the
// signature Electron ships with. Without a Developer ID (no CSC_LINK), re-sign
// the bundle ad hoc: users then see "unidentified developer" (right-click →
// Open) instead of "Storyteller is damaged".
const { execFileSync } = require('child_process')
const path = require('path')

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return
  if (process.env.CSC_LINK || process.env.CSC_NAME) return // real signing configured
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  console.log(`  • ad-hoc signing ${app}`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' })
}
