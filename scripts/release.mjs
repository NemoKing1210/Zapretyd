#!/usr/bin/env node
/**
 * Version bump / sync / tag helpers for Zapretyd releases.
 *
 *   node scripts/release.mjs sync
 *   node scripts/release.mjs bump <patch|minor|major|X.Y.Z>
 *   node scripts/release.mjs tag
 *   node scripts/release.mjs release <patch|minor|major|X.Y.Z>
 *
 * `release` = bump + commit version files + annotated tag + push (triggers CI).
 * `tag`     = annotated tag for the current package.json version + push.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const PATHS = {
  packageJson: join(root, 'package.json'),
  packageLock: join(root, 'package-lock.json'),
  tauriConf: join(root, 'src-tauri', 'tauri.conf.json'),
  cargoToml: join(root, 'src-tauri', 'Cargo.toml'),
  httpRs: join(root, 'src-tauri', 'src', 'http.rs'),
}

const VERSION_FILES = [
  'package.json',
  'package-lock.json',
  'src-tauri/tauri.conf.json',
  'src-tauri/Cargo.toml',
  'src-tauri/src/http.rs',
]

function fail(message) {
  console.error(`error: ${message}`)
  process.exit(1)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function writeJson(path, data) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

function parseSemVer(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!match) fail(`invalid SemVer "${version}" (expected X.Y.Z)`)
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  }
}

function formatSemVer({ major, minor, patch }) {
  return `${major}.${minor}.${patch}`
}

function bumpVersion(current, kind) {
  if (/^\d+\.\d+\.\d+$/.test(kind)) {
    parseSemVer(kind)
    return kind
  }

  const next = parseSemVer(current)
  if (kind === 'major') {
    next.major += 1
    next.minor = 0
    next.patch = 0
  } else if (kind === 'minor') {
    next.minor += 1
    next.patch = 0
  } else if (kind === 'patch') {
    next.patch += 1
  } else {
    fail(`unknown bump "${kind}" (use patch, minor, major, or X.Y.Z)`)
  }
  return formatSemVer(next)
}

function git(args, { stdio = 'inherit' } = {}) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio })
}

function gitOutput(args) {
  return git(args, { stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function assertCleanWorkingTree() {
  const status = gitOutput(['status', '--porcelain'])
  if (status) {
    fail(`working tree is dirty. Commit or stash changes first:\n${status}`)
  }
}

function assertTagMissing(tag) {
  if (gitOutput(['tag', '-l', tag])) {
    fail(`tag ${tag} already exists locally`)
  }

  let remote = ''
  try {
    remote = gitOutput(['ls-remote', '--tags', 'origin', `refs/tags/${tag}`])
  } catch {
    // Offline / no remote — local check is enough.
  }
  if (remote) fail(`tag ${tag} already exists on origin`)
}

function currentVersion() {
  return readJson(PATHS.packageJson).version
}

function syncVersion(version) {
  const parsed = parseSemVer(version)
  const userAgent = `Zapretyd/${parsed.major}.${parsed.minor}`

  const pkg = readJson(PATHS.packageJson)
  pkg.version = version
  writeJson(PATHS.packageJson, pkg)

  const lock = readJson(PATHS.packageLock)
  lock.version = version
  if (lock.packages?.['']) {
    lock.packages[''].version = version
  }
  writeJson(PATHS.packageLock, lock)

  const tauri = readJson(PATHS.tauriConf)
  tauri.version = version
  writeJson(PATHS.tauriConf, tauri)

  const cargo = readFileSync(PATHS.cargoToml, 'utf8')
  if (!/^\[package\][\s\S]*?^version\s*=\s*"[^"]+"/m.test(cargo)) {
    fail('could not find package.version in Cargo.toml')
  }
  const cargoNext = cargo.replace(
    /^(\[package\][\s\S]*?^version\s*=\s*")[^"]+(")/m,
    (_, start, end) => `${start}${version}${end}`,
  )
  writeFileSync(PATHS.cargoToml, cargoNext, 'utf8')

  for (const rsPath of [PATHS.httpRs]) {
    const source = readFileSync(rsPath, 'utf8')
    const next = source.replace(/Zapretyd\/\d+\.\d+/g, userAgent)
    if (!next.includes(userAgent)) {
      fail(`could not update user-agent in ${rsPath}`)
    }
    writeFileSync(rsPath, next, 'utf8')
  }

  console.log(`synced version ${version} (user-agent ${userAgent})`)
  return version
}

function commitVersionBump(version) {
  git(['add', ...VERSION_FILES])
  const staged = gitOutput(['diff', '--cached', '--name-only'])
  if (!staged) fail('nothing to commit — version files unchanged')
  git(['commit', '-m', `chore: release v${version}`])
}

function createAndPushTag(version) {
  const tag = `v${version}`
  assertTagMissing(tag)
  git(['tag', '-a', tag, '-m', `Zapretyd ${tag}`])
  git(['push'])
  git(['push', 'origin', tag])
  console.log(`pushed ${tag} — GitHub Actions will build the installer draft`)
  return tag
}

function printUsage() {
  console.log(`Usage:
  npm run version:sync
  npm run version:patch | version:minor | version:major
  npm run version:set -- X.Y.Z
  npm run release:patch | release:minor | release:major
  npm run release:set -- X.Y.Z
  npm run release:tag`)
}

function main() {
  const [command, arg] = process.argv.slice(2)

  if (!command || command === 'help' || command === '--help') {
    printUsage()
    return
  }

  if (command === 'sync') {
    syncVersion(currentVersion())
    return
  }

  if (command === 'bump') {
    if (!arg) fail('bump requires patch|minor|major|X.Y.Z')
    syncVersion(bumpVersion(currentVersion(), arg))
    return
  }

  if (command === 'tag') {
    assertCleanWorkingTree()
    createAndPushTag(currentVersion())
    return
  }

  if (command === 'release') {
    if (!arg) fail('release requires patch|minor|major|X.Y.Z')
    assertCleanWorkingTree()
    const next = bumpVersion(currentVersion(), arg)
    syncVersion(next)
    commitVersionBump(next)
    createAndPushTag(next)
    return
  }

  fail(`unknown command "${command}"`)
}

main()
