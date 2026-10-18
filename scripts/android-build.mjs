// Build the Android APK: web bundle → Capacitor sync → Gradle → release/.
// Usage: node scripts/android-build.mjs [release|debug]
// Finds a JDK and the Android SDK in the usual places when they aren't on PATH.
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const variant = process.argv[2] === 'debug' ? 'debug' : 'release'
const win = process.platform === 'win32'
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

function firstExisting(paths) {
  return paths.find((p) => p && existsSync(p))
}

function findJavaHome() {
  if (process.env.JAVA_HOME && existsSync(process.env.JAVA_HOME)) return process.env.JAVA_HOME
  const jdks = join(homedir(), '.jdks')
  // JDKs downloaded by IntelliJ / Android Studio, newest name first.
  const fromJdks = existsSync(jdks)
    ? readdirSync(jdks)
        .map((d) => join(jdks, d))
        .filter((d) => existsSync(join(d, 'bin', win ? 'java.exe' : 'java')))
        .sort()
        .reverse()
    : []
  return firstExisting([
    ...fromJdks,
    'C:/Program Files/Android/Android Studio/jbr',
    join(process.env.LOCALAPPDATA ?? '', 'Programs/Android Studio/jbr'),
    '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
    '/opt/android-studio/jbr'
  ])
}

function findAndroidSdk() {
  return firstExisting([
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    join(process.env.LOCALAPPDATA ?? '', 'Android/Sdk'),
    join(homedir(), 'Library/Android/sdk'),
    join(homedir(), 'Android/Sdk')
  ])
}

function run(cmd, args, opts = {}) {
  console.log(`\n> ${cmd} ${args.join(' ')}`)
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: win, cwd: root, ...opts })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

const javaHome = findJavaHome()
const sdk = findAndroidSdk()
if (!javaHome) console.warn('! No JDK 21 found (set JAVA_HOME). Gradle will try the one on PATH.')
if (!sdk) {
  console.error('Android SDK not found. Install Android Studio or set ANDROID_HOME.')
  process.exit(1)
}
const env = {
  ...process.env,
  ...(javaHome ? { JAVA_HOME: javaHome } : {}),
  ANDROID_HOME: sdk,
  ANDROID_SDK_ROOT: sdk
}

run('npx', ['vite', 'build', '-c', 'vite.mobile.config.ts'], { env })
run('npx', ['cap', 'sync', 'android'], { env })
// Absolute path: some shells don't look in the current directory for commands.
const gradlew = join(root, 'android', win ? 'gradlew.bat' : 'gradlew')
run(win ? `"${gradlew}"` : gradlew, [variant === 'release' ? 'assembleRelease' : 'assembleDebug', '--no-daemon'], {
  cwd: join(root, 'android'),
  env
})

const apk = join(root, `android/app/build/outputs/apk/${variant}/app-${variant}.apk`)
const outDir = join(root, 'release')
mkdirSync(outDir, { recursive: true })
const target = join(outDir, `Storyteller-${version}-android${variant === 'debug' ? '-debug' : ''}.apk`)
copyFileSync(apk, target)
console.log(`\nAPK: ${target}`)
