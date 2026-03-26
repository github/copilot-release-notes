import * as core from '@actions/core'

export interface ReleaseNoteEntry {
  description: string
  pr: number
  author: string
  tag?: string
}

export interface UncertainEntry {
  description: string
  pr: number
  author: string
  reason: string
  tag?: string
}

export interface SkippedPR {
  pr: number
  title: string
  reason: string
}

export interface ParsedOutput {
  entries: ReleaseNoteEntry[]
  uncertainEntries: UncertainEntry[]
  skippedPRs: SkippedPR[]
}

/**
 * Parse the Copilot CLI output to extract the structured JSON.
 */
export function parseOutput(stdout: string): ParsedOutput {
  // Try to find JSON in the output — the CLI may include other text around it
  const jsonMatch = stdout.match(/\{[\s\S]*"entries"[\s\S]*\}/)
  if (!jsonMatch) {
    core.warning('Could not find JSON output from Copilot CLI')
    core.debug(`Full output: ${stdout}`)
    return {entries: [], uncertainEntries: [], skippedPRs: []}
  }

  // Find the balanced JSON object
  const jsonStr = extractBalancedJSON(jsonMatch[0])
  if (!jsonStr) {
    core.warning('Could not extract valid JSON from Copilot CLI output')
    return {entries: [], uncertainEntries: [], skippedPRs: []}
  }

  try {
    const parsed = JSON.parse(jsonStr)
    return {
      entries: parsed.entries || [],
      uncertainEntries: parsed.uncertainEntries || [],
      skippedPRs: parsed.skippedPRs || []
    }
  } catch (err) {
    core.warning(`Failed to parse JSON output: ${err}`)
    core.debug(`Attempted to parse: ${jsonStr}`)
    return {entries: [], uncertainEntries: [], skippedPRs: []}
  }
}

/**
 * Extract a balanced JSON object from a string that starts with '{'.
 */
function extractBalancedJSON(str: string): string | null {
  let depth = 0
  let inString = false
  let escape = false

  for (let i = 0; i < str.length; i++) {
    const ch = str[i]

    if (escape) {
      escape = false
      continue
    }

    if (ch === '\\' && inString) {
      escape = true
      continue
    }

    if (ch === '"') {
      inString = !inString
      continue
    }

    if (inString) continue

    if (ch === '{') depth++
    if (ch === '}') {
      depth--
      if (depth === 0) {
        return str.substring(0, i + 1)
      }
    }
  }

  return null
}

/**
 * Format release notes as markdown text.
 * Groups entries by tag when tags are present.
 */
export function formatAsMarkdown(output: ParsedOutput): string {
  const lines: string[] = []

  const hasAnyTags = output.entries.some(e => e.tag)

  if (hasAnyTags) {
    // Group entries by tag, preserving insertion order
    const groups = new Map<string, ReleaseNoteEntry[]>()
    const untagged: ReleaseNoteEntry[] = []

    for (const entry of output.entries) {
      if (entry.tag) {
        const existing = groups.get(entry.tag) || []
        existing.push(entry)
        groups.set(entry.tag, existing)
      } else {
        untagged.push(entry)
      }
    }

    for (const [tag, entries] of groups) {
      lines.push(`### ${tag}`)
      lines.push('')
      for (const entry of entries) {
        lines.push(`- ${entry.description} (#${entry.pr})`)
      }
      lines.push('')
    }

    if (untagged.length > 0) {
      lines.push('### Other')
      lines.push('')
      for (const entry of untagged) {
        lines.push(`- ${entry.description} (#${entry.pr})`)
      }
      lines.push('')
    }
  } else {
    // Flat list when no tags
    for (const entry of output.entries) {
      lines.push(`- ${entry.description} (#${entry.pr})`)
    }
  }

  if (output.uncertainEntries.length > 0) {
    lines.push('')
    lines.push('### Needs Review')
    for (const entry of output.uncertainEntries) {
      const prefix = entry.tag ? `${entry.tag} ` : ''
      lines.push(
        `- ${prefix}${entry.description} (#${entry.pr}) — _${entry.reason}_`
      )
    }
  }

  return lines.join('\n').trim()
}

/**
 * Set the GitHub Action outputs.
 */
export function setOutputs(output: ParsedOutput): void {
  const markdown = formatAsMarkdown(output)
  core.setOutput('release-notes', markdown)
  core.setOutput('release-notes-json', JSON.stringify(output.entries))
  core.setOutput('skipped-prs', JSON.stringify(output.skippedPRs))
  core.setOutput(
    'uncertain-entries',
    JSON.stringify(output.uncertainEntries)
  )

  core.info(`\n📝 Generated ${output.entries.length} release note entries`)
  core.info(`⚠️  ${output.uncertainEntries.length} entries need review`)
  core.info(`⏭️  ${output.skippedPRs.length} PRs skipped`)

  if (markdown) {
    core.info('\n--- Release Notes ---')
    core.info(markdown)
    core.info('--- End Release Notes ---')
  }
}
