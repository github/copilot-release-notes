const {classifyRelease} = require('../.github/scripts/release-policy.cjs')

const baseManifest = {
  name: 'action',
  version: '1.0.0',
  dependencies: {runtime: '1.0.0'},
  devDependencies: {test: '1.0.0'}
}

function classify(
  files: string[],
  headManifest: Record<string, unknown> = baseManifest
) {
  return classifyRelease(files, baseManifest, headManifest)
}

describe('release policy', () => {
  it('does nothing when only accompanying files change', () => {
    expect(
      classify(['README.md', '__tests__/release-policy.test.ts', '.github/a.yml'])
    ).toEqual({kind: 'none', reason: 'No shipped files changed'})
  })

  it('publishes a patch for dependency-only bundle updates', () => {
    expect(
      classify(['package.json', 'package-lock.json', 'dist/index.js'], {
        ...baseManifest,
        dependencies: {runtime: '1.1.0'}
      })
    ).toEqual({
      kind: 'patch',
      reason: 'Only bundled runtime dependencies changed'
    })
  })

  it('allows tests, docs, and workflows alongside a dependency patch', () => {
    expect(
      classify(
        [
          'package.json',
          'package-lock.json',
          'dist/index.js',
          '__tests__/runtime.test.ts',
          'docs/dependencies.md',
          '.github/dependabot.yml'
        ],
        {...baseManifest, dependencies: {runtime: '1.1.0'}}
      ).kind
    ).toBe('patch')
  })

  it.each([
    [['src/index.ts', 'dist/index.js'], baseManifest],
    [['action.yml'], baseManifest],
    [['dist/index.js'], baseManifest],
    [
      ['package.json', 'package-lock.json', 'dist/index.js'],
      {...baseManifest, version: '1.0.1', dependencies: {runtime: '1.1.0'}}
    ],
    [
      ['package.json', 'package-lock.json', 'dist/index.js', 'CODEOWNERS'],
      {...baseManifest, dependencies: {runtime: '1.1.0'}}
    ]
  ])('creates a draft minor for behavioral changes: %j', (files, manifest) => {
    expect(classify(files as string[], manifest).kind).toBe('minor')
  })

  it('fails closed when source changes without a rebuilt bundle', () => {
    expect(classify(['src/index.ts']).kind).toBe('stale-bundle')
  })
})
