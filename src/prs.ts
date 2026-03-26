import * as exec from '@actions/exec'
import * as core from '@actions/core'
import * as github from '@actions/github'

export interface PRInfo {
  number: number
  title: string
  body: string
  author: string
  labels: string[]
  htmlUrl: string
}

/**
 * Detect the owner and repo from the git remote origin URL.
 * This is needed when the checked-out repo differs from the workflow repo.
 */
async function detectRepo(): Promise<{owner: string; repo: string}> {
  let remoteUrl = ''
  await exec.exec('git', ['remote', 'get-url', 'origin'], {
    listeners: {
      stdout: (data: Buffer) => {
        remoteUrl += data.toString()
      }
    },
    silent: true
  })
  remoteUrl = remoteUrl.trim()

  // Handle HTTPS: https://github.com/owner/repo.git
  const httpsMatch = remoteUrl.match(
    /github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/
  )
  if (httpsMatch) {
    return {owner: httpsMatch[1], repo: httpsMatch[2]}
  }

  // Handle SSH: git@github.com:owner/repo.git
  const sshMatch = remoteUrl.match(
    /github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/
  )
  if (sshMatch) {
    return {owner: sshMatch[1], repo: sshMatch[2]}
  }

  // Fallback to github.context
  core.warning(
    `Could not parse remote URL "${remoteUrl}", falling back to workflow context`
  )
  return github.context.repo
}

/**
 * Find PRs between two refs using the configured strategy.
 */
export async function findPRs(
  baseRef: string,
  headRef: string,
  strategy: 'merge-commits' | 'github-api'
): Promise<PRInfo[]> {
  const prNumbers =
    strategy === 'merge-commits'
      ? await findPRsViaMergeCommits(baseRef, headRef)
      : await findPRsViaGitHubAPI(baseRef, headRef)

  if (prNumbers.length === 0) {
    core.warning('No PRs found between the specified refs')
    return []
  }

  core.info(`Found ${prNumbers.length} PR(s) to analyze`)
  const prs = await fetchPRDetails(prNumbers)

  const failedCount = prNumbers.length - prs.length
  if (failedCount > 0) {
    core.warning(
      `Failed to fetch details for ${failedCount} of ${prNumbers.length} PRs. ` +
        `Release notes will be incomplete.`
    )
  }

  if (prs.length === 0 && prNumbers.length > 0) {
    throw new Error(
      `Discovered ${prNumbers.length} PR(s) but failed to fetch details for any of them. ` +
        `Check your token permissions and API access.`
    )
  }

  return prs
}

/**
 * Extract PR numbers from merge commit messages between two refs.
 */
async function findPRsViaMergeCommits(
  baseRef: string,
  headRef: string
): Promise<number[]> {
  let stdout = ''
  await exec.exec(
    'git',
    ['log', '--merges', '--oneline', `${baseRef}..${headRef}`],
    {
      listeners: {
        stdout: (data: Buffer) => {
          stdout += data.toString()
        }
      },
      silent: true
    }
  )

  const prNumbers: number[] = []
  const mergePattern = /Merge pull request #(\d+) from/
  for (const line of stdout.trim().split('\n')) {
    const match = line.match(mergePattern)
    if (match) {
      prNumbers.push(parseInt(match[1], 10))
    }
  }

  // Also check for squash-merge PRs (GitHub adds "(#NNN)" to the title)
  let squashStdout = ''
  await exec.exec(
    'git',
    ['log', '--no-merges', '--oneline', `${baseRef}..${headRef}`],
    {
      listeners: {
        stdout: (data: Buffer) => {
          squashStdout += data.toString()
        }
      },
      silent: true
    }
  )

  const squashPattern = /\(#(\d+)\)$/
  const mergeSet = new Set(prNumbers)
  for (const line of squashStdout.trim().split('\n')) {
    const match = line.match(squashPattern)
    if (match) {
      const num = parseInt(match[1], 10)
      if (!mergeSet.has(num)) {
        prNumbers.push(num)
        mergeSet.add(num)
      }
    }
  }

  return prNumbers
}

/**
 * Get the best available token for GitHub API calls.
 * Prefers COPILOT_GITHUB_TOKEN (PAT with broader access) over GITHUB_TOKEN.
 */
function getApiToken(): string {
  const token =
    process.env.COPILOT_GITHUB_TOKEN || process.env.GITHUB_TOKEN
  if (!token) {
    throw new Error(
      'Either COPILOT_GITHUB_TOKEN or GITHUB_TOKEN must be set for API calls'
    )
  }
  return token
}

/**
 * Find PRs using the GitHub compare API.
 */
async function findPRsViaGitHubAPI(
  baseRef: string,
  headRef: string
): Promise<number[]> {
  const octokit = github.getOctokit(getApiToken())
  const {owner, repo} = await detectRepo()

  const comparison = await octokit.rest.repos.compareCommitsWithBasehead({
    owner,
    repo,
    basehead: `${baseRef}...${headRef}`
  })

  const prNumbers: number[] = []
  const seen = new Set<number>()

  for (const commit of comparison.data.commits) {
    // Check merge commits
    const mergeMatch = commit.commit.message.match(
      /Merge pull request #(\d+) from/
    )
    if (mergeMatch) {
      const num = parseInt(mergeMatch[1], 10)
      if (!seen.has(num)) {
        seen.add(num)
        prNumbers.push(num)
      }
    }

    // Check squash merges — only match at end of subject line
    const subject = commit.commit.message.split('\n')[0]
    const squashMatch = subject.match(/\(#(\d+)\)$/)
    if (squashMatch) {
      const num = parseInt(squashMatch[1], 10)
      if (!seen.has(num)) {
        seen.add(num)
        prNumbers.push(num)
      }
    }
  }

  // Warn if results may be truncated (GitHub compare API caps at 250 commits)
  if (
    comparison.data.commits.length >= 250 ||
    (comparison.data.total_commits !== undefined &&
      comparison.data.total_commits > comparison.data.commits.length)
  ) {
    core.warning(
      `GitHub compare API returned ${comparison.data.commits.length} commits but the range may contain more. ` +
        `Results could be incomplete. Consider using the 'merge-commits' strategy for large ranges.`
    )
  }

  return prNumbers
}

/**
 * Fetch full PR details from the GitHub API.
 */
async function fetchPRDetails(prNumbers: number[]): Promise<PRInfo[]> {
  const octokit = github.getOctokit(getApiToken())
  const {owner, repo} = await detectRepo()

  const prs: PRInfo[] = []
  for (const num of prNumbers) {
    try {
      const {data} = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: num
      })
      prs.push({
        number: data.number,
        title: data.title,
        body: data.body || '',
        author: data.user?.login || 'unknown',
        labels: data.labels.map(l =>
          typeof l === 'string' ? l : l.name || ''
        ),
        htmlUrl: data.html_url
      })
    } catch (err) {
      core.warning(`Failed to fetch PR #${num}: ${err}`)
    }
  }

  return prs
}
