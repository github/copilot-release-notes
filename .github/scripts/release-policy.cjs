const {execFileSync} = require('node:child_process')
const fs = require('node:fs')

const RUNTIME_MANIFEST_KEYS = new Set([
  'dependencies',
  'optionalDependencies',
  'overrides',
  'peerDependencies'
])

function equal(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function withoutRuntimeDependencies(manifest) {
  return Object.fromEntries(
    Object.entries(manifest).filter(([key]) => !RUNTIME_MANIFEST_KEYS.has(key))
  )
}

function runtimeDependenciesChanged(baseManifest, headManifest) {
  return [...RUNTIME_MANIFEST_KEYS].some(
    key => !equal(baseManifest[key], headManifest[key])
  )
}

function isAccompanyingFile(path) {
  return (
    path.startsWith('.github/') ||
    path.startsWith('__tests__/') ||
    path.startsWith('test/') ||
    path.startsWith('tests/') ||
    path.startsWith('docs/') ||
    path.endsWith('.md')
  )
}

function classifyRelease(changedFiles, baseManifest, headManifest) {
  const files = [...new Set(changedFiles)]
  const hasSource = files.some(path => path.startsWith('src/'))
  const hasDist = files.some(path => path.startsWith('dist/'))
  const hasAction = files.includes('action.yml')
  const hasPackage = files.includes('package.json')
  const hasLock = files.includes('package-lock.json')
  const hasShippedChange = hasSource || hasDist || hasAction

  if (!hasShippedChange) {
    return {kind: 'none', reason: 'No shipped files changed'}
  }

  if (hasSource && !hasDist) {
    return {
      kind: 'stale-bundle',
      reason: 'src/** changed without a rebuilt dist/** bundle'
    }
  }

  const knownFiles = files.every(
    path =>
      path.startsWith('src/') ||
      path.startsWith('dist/') ||
      path === 'action.yml' ||
      path === 'package.json' ||
      path === 'package-lock.json' ||
      isAccompanyingFile(path)
  )
  const dependencyOnlyManifest =
    hasPackage &&
    hasLock &&
    runtimeDependenciesChanged(baseManifest, headManifest) &&
    equal(
      withoutRuntimeDependencies(baseManifest),
      withoutRuntimeDependencies(headManifest)
    )

  if (
    hasDist &&
    !hasSource &&
    !hasAction &&
    knownFiles &&
    dependencyOnlyManifest
  ) {
    return {
      kind: 'patch',
      reason: 'Only bundled runtime dependencies changed'
    }
  }

  return {
    kind: 'minor',
    reason: knownFiles
      ? 'Potentially behavioral shipped files changed'
      : 'Unknown files accompany shipped changes'
  }
}

function readManifest(ref) {
  return JSON.parse(
    execFileSync('git', ['show', `${ref}:package.json`], {encoding: 'utf8'})
  )
}

function changedFiles(base, head) {
  return execFileSync('git', ['diff', '--name-only', '-z', base, head])
    .toString()
    .split('\0')
    .filter(Boolean)
}

function writeOutput(result) {
  const output = process.env.GITHUB_OUTPUT
  if (!output) return

  fs.appendFileSync(
    output,
    `classification=${result.kind}\nreason=${result.reason}\n`
  )
}

if (require.main === module) {
  const [base, head = 'HEAD'] = process.argv.slice(2)
  if (!base) {
    throw new Error('Usage: release-policy.cjs <base-ref> [head-ref]')
  }

  const result = classifyRelease(
    changedFiles(base, head),
    readManifest(base),
    readManifest(head)
  )
  writeOutput(result)
  console.log(`${result.kind}: ${result.reason}`)
}

module.exports = {classifyRelease}
