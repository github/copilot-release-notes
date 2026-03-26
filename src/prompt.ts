import * as fs from 'fs'
import * as core from '@actions/core'
import {PRInfo} from './prs'

/**
 * Build the prompt for the Copilot CLI.
 *
 * The prompt includes:
 * 1. Base instructions for analyzing PRs and generating release notes
 * 2. User-provided custom instructions (team style guide)
 * 3. PR metadata (titles, bodies, labels, authors)
 * 4. Instructions for using git to explore diffs
 */
export function buildPrompt(
  prs: PRInfo[],
  baseRef: string,
  headRef: string,
  instructionsPath?: string
): string {
  const parts: string[] = []

  parts.push(buildBaseInstructions(baseRef, headRef))

  if (instructionsPath) {
    const customInstructions = loadInstructions(instructionsPath)
    if (customInstructions) {
      parts.push(buildCustomInstructionsSection(customInstructions))
    }
  }

  parts.push(buildPRSection(prs))
  parts.push(buildOutputInstructions())

  return parts.join('\n\n')
}

function buildBaseInstructions(baseRef: string, headRef: string): string {
  return `# Release Notes Generation

You are a release notes writer. Your job is to analyze the pull requests merged
between \`${baseRef}\` and \`${headRef}\` and write a clear, concise summary of
each one.

## How to Analyze PRs

For each PR listed below, you have the PR title, body, labels, and author.
You also have access to the git repository. Use \`git diff\` and \`git show\`
to examine the actual code changes when the PR title and body are insufficient
to understand what changed.

For example:
- \`git diff ${baseRef}..${headRef} -- path/to/file\` to see changes in a specific file
- \`git log --oneline ${baseRef}..${headRef}\` to see the commit history
- \`git show <commit-sha>\` to examine a specific commit

## Writing Guidelines

1. **One sentence per PR** — write a single, clear sentence summarizing the change
2. **Write for a broad audience** — assume the reader is familiar with the product
   but not the codebase. Focus on what changed, not how it was implemented.
3. **Be specific** — include feature names, command names, or specific behaviors.
   Avoid vague descriptions like "various improvements" or "minor fixes".
4. **Use present tense** — "Add support for..." not "Added support for..."
5. **For fixes, describe what works now** — not what was broken.
   Say "Resolve issue where X now works correctly" rather than "Fix bug in X"
6. **Include every PR** — generate a summary for every PR unless custom
   instructions explicitly say to exclude certain types of changes.
   Every PR represents work someone did and should be captured.
7. **Flag uncertainty** — if you cannot confidently summarize a PR, include your
   best attempt and mark it as uncertain so a human can review it`
}

function loadInstructions(filePath: string): string | undefined {
  try {
    if (!fs.existsSync(filePath)) {
      core.warning(`Instructions file not found: ${filePath}`)
      return undefined
    }
    return fs.readFileSync(filePath, 'utf-8').trim()
  } catch (err) {
    core.warning(`Failed to read instructions file: ${err}`)
    return undefined
  }
}

function buildCustomInstructionsSection(instructions: string): string {
  return `## Team-Specific Instructions

The following instructions describe the team's preferred format, tone,
categories, and conventions for release notes. Follow these instructions
when generating entries.

${instructions}`
}

function buildPRSection(prs: PRInfo[]): string {
  const lines = ['## Pull Requests to Analyze', '']

  for (const pr of prs) {
    lines.push(`### PR #${pr.number}: ${pr.title}`)
    lines.push(`- **Author**: @${pr.author}`)
    if (pr.labels.length > 0) {
      lines.push(`- **Labels**: ${pr.labels.join(', ')}`)
    }
    if (pr.body) {
      lines.push(`- **Body**:`)
      // Truncate very long bodies to keep prompt manageable
      const truncatedBody =
        pr.body.length > 2000
          ? pr.body.substring(0, 2000) + '\n... (truncated)'
          : pr.body
      lines.push(truncatedBody)
    }
    lines.push('')
  }

  return lines.join('\n')
}

function buildOutputInstructions(): string {
  return `## Required Output Format

You MUST output a valid JSON object and nothing else after the final analysis.
The JSON must follow this exact structure:

\`\`\`json
{
  "entries": [
    {
      "description": "One-sentence summary of what this PR changes",
      "pr": 1234,
      "author": "username",
      "tag": "Optional category/tag from custom instructions"
    }
  ],
  "uncertainEntries": [
    {
      "description": "Best-attempt summary needing human review",
      "pr": 5678,
      "author": "username",
      "reason": "Why this entry is uncertain",
      "tag": "Optional category/tag"
    }
  ]
}
\`\`\`

### Field Details

- **description**: A concise summary of the change. Follow the writing style from
  custom instructions if provided. Include author attribution in the description
  itself if the custom instructions call for it (e.g. "by @author").
- **pr**: The PR number (integer).
- **author**: The GitHub username of the PR author (without the @ prefix).
- **tag**: (Optional) A category or tag for grouping this entry. Only include if
  custom instructions define categories or sections. Use the exact section heading
  text from the instructions (e.g. "✨ Features", "🐛 Fixes").

### Important

- Every PR must appear in either entries or uncertainEntries — do not skip any
  unless custom instructions explicitly tell you to exclude certain types
- If custom instructions say to skip certain PRs, still include them in a
  separate "skippedPRs" array: \`[{"pr": 9999, "title": "PR title", "reason": "Why skipped"}]\`
- Output ONLY the JSON object — no other text before or after it
- The JSON must be valid and parseable`
}
