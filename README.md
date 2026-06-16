# Copilot Release Notes

AI-powered release notes generation from pull requests between two git refs, using GitHub Copilot CLI.

Give it two tags (or branches, or SHAs), and it analyzes every PR merged between them — reading titles, bodies, labels, and diffs — to produce structured, human-readable release notes.

## Features

- **Zero configuration** — works out of the box with sensible defaults
- **Team-customizable** — drop a style guide at `.github/release-notes-instructions.md` and the action follows your conventions (categories, tone, skip rules, attribution format)
- **Structured output** — get markdown *and* JSON so you can feed notes into releases, changelogs, Slack, or dashboards
- **Uncertainty flagging** — entries the AI isn't confident about are separated for human review
- **Security hardened** — 4 rounds of adversarial review; prompt injection, workflow command injection, and secret exfiltration mitigations built in

## Background

This project is under **active development** and maintained by the GitHub CLI & Desktop team. Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) to get started.

## Requirements

- A **GitHub Actions** runner (Ubuntu, macOS, or Windows)
- An active **GitHub Copilot license**
- A **fine-grained PAT** with the `Copilot Requests: Read` permission (see [Authentication](#authentication))

## Quick Start

```yaml
- name: Generate release notes
  uses: github/copilot-release-notes@main
  with:
    base-ref: v1.0.0
    head-ref: v1.1.0
  env:
    COPILOT_GITHUB_TOKEN: ${{ secrets.COPILOT_GITHUB_TOKEN }}
```

## Authentication

This action requires a `COPILOT_GITHUB_TOKEN` — a GitHub fine-grained personal access token with the **"Copilot Requests: Read"** permission. The token owner must have an active GitHub Copilot license.

1. Create a [fine-grained PAT](https://github.com/settings/personal-access-tokens/new) with:
   - **Permissions:** `Copilot Requests: Read`
2. Add it as a repository or organization secret named `COPILOT_GITHUB_TOKEN`
3. Pass it via `env` in your workflow (see examples below)

> **Note:** This is separate from `GITHUB_TOKEN`. The action uses `GITHUB_TOKEN` (automatically provided) for PR API calls, and `COPILOT_GITHUB_TOKEN` for AI generation.

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `base-ref` | **Yes** | — | Tag, branch, or SHA to compare from (e.g., `v1.0.0`) |
| `head-ref` | No | `HEAD` | Tag, branch, or SHA to compare to |
| `instructions` | No | Auto-discovered | Path to a markdown style guide (see [Custom Instructions](#custom-instructions)) |
| `model` | No | Copilot default | Model override (e.g., `gpt-4o`, `claude-sonnet-4`) |
| `pr-strategy` | No | `merge-commits` | How to find PRs: `merge-commits` or `github-api` |

## Outputs

| Output | Description |
|---|---|
| `release-notes` | Formatted markdown text |
| `release-notes-json` | JSON array of entries with `description`, `pr`, `author`, and optional `tag` |
| `skipped-prs` | JSON array of PRs excluded with reasons |
| `uncertain-entries` | JSON array of entries flagged for human review |

## Examples

### Basic — generate notes between two tags

```yaml
name: Release Notes
on:
  workflow_dispatch:
    inputs:
      base-ref:
        description: 'Previous release tag'
        required: true
      head-ref:
        description: 'New release tag'
        required: true

jobs:
  release-notes:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Generate release notes
        id: notes
        uses: github/copilot-release-notes@main
        with:
          base-ref: ${{ inputs.base-ref }}
          head-ref: ${{ inputs.head-ref }}
        env:
          COPILOT_GITHUB_TOKEN: ${{ secrets.COPILOT_GITHUB_TOKEN }}

      - name: Print notes
        run: echo "${{ steps.notes.outputs.release-notes }}"
```

### Create a GitHub Release

```yaml
      - name: Generate release notes
        id: notes
        uses: github/copilot-release-notes@main
        with:
          base-ref: v1.0.0
          head-ref: v1.1.0
        env:
          COPILOT_GITHUB_TOKEN: ${{ secrets.COPILOT_GITHUB_TOKEN }}

      - name: Create release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: v1.1.0
          body: ${{ steps.notes.outputs.release-notes }}
```

### Cross-repo — generate notes for a different repository

```yaml
      - uses: actions/checkout@v4
        with:
          repository: cli/cli
          fetch-depth: 0

      - name: Generate release notes
        uses: github/copilot-release-notes@main
        with:
          base-ref: v2.74.0
          head-ref: v2.75.0
        env:
          COPILOT_GITHUB_TOKEN: ${{ secrets.COPILOT_GITHUB_TOKEN }}
```

### With custom instructions

```yaml
      - name: Generate release notes
        uses: github/copilot-release-notes@main
        with:
          base-ref: v3.5.6
          head-ref: v3.5.7
          instructions: .github/release-notes-instructions.md
        env:
          COPILOT_GITHUB_TOKEN: ${{ secrets.COPILOT_GITHUB_TOKEN }}
```

## Custom Instructions

The action automatically discovers a style guide at `.github/release-notes-instructions.md` in the checked-out repository. You can also pass an explicit path via the `instructions` input.

Your instructions file is a markdown document that tells the AI how your team writes release notes. You can control:

- **Categories/tags** — define your own groupings (e.g., `[New]`, `[Fixed]`, `✨ Features`, `🐛 Fixes`)
- **What to skip** — tell it to ignore CI changes, dependency bumps, refactors, etc.
- **Writing style** — tone, tense, length, attribution format
- **Entry format** — how each bullet should look (e.g., `description by @author in #PR`)

### Example: simple category-based guide

```markdown
# Release Notes Style Guide

## Categories
Prefix each entry with one of these tags:
- `[New]` — Significant new features (use sparingly)
- `[Added]` — Smaller features and additions
- `[Fixed]` — Bug fixes (describe what works now)
- `[Improved]` — Enhancements to existing features

## What to Skip
Do NOT generate entries for:
- CI/CD changes, test-only changes, internal refactoring
- Dependency bumps (unless fixing a security vulnerability)

## Style
- Write for users, not developers
- Use present tense: "Add", "Fix", "Update"
- Be specific but concise (10-100 characters)
```

### Example: include-everything guide (like cli/cli)

```markdown
# Release Notes Instructions

## Categories
- **✨ Features** — New features, commands, flags
- **🐛 Fixes** — Bug fixes
- **📚 Docs & Chores** — Docs, refactors, CI, tests
- **:dependabot: Dependencies** — Dependency bumps

## Entry Format
Each entry must follow: `<description> by @<author> in #<pr_number>`

## Rules
Include ALL PRs. Nothing should be silently skipped.
```

Without any instructions file, the action generates a flat list of bullet points summarizing every PR — no categories, no skipping.

## PR Discovery Strategies

### `merge-commits` (default)
Scans git log for merge commits (`Merge pull request #N`) and squash commits (`(#N)` in title). Fast, no API calls, works offline. Misses rebase-merged PRs.

### `github-api`
Uses the GitHub API to find PRs associated with commits. Catches more PR types but requires API access and is slower for large ranges.

## How It Works

1. **Discover PRs** — finds all PRs merged between `base-ref` and `head-ref`
2. **Fetch metadata** — retrieves title, body, labels, and author for each PR via GitHub API
3. **Build prompt** — assembles PR data + your instructions into a structured prompt with security guardrails
4. **Run Copilot CLI** — sends the prompt to GitHub Copilot, which can also run `git diff` to inspect actual code changes
5. **Parse output** — extracts structured JSON from the AI response
6. **Format** — produces markdown (grouped by tag if instructions define categories) and sets all outputs

## Known Limitations

- **Rebase-merged PRs** are not detected by either strategy (a known GitHub API limitation for commit-based lookups)
- **AI output is non-deterministic** — the same inputs may produce slightly different notes across runs. Human review is recommended for important releases.
- **Large releases** (100+ PRs) may hit prompt size limits. Consider splitting into smaller ranges.

## Security

This action has been through 4 rounds of adversarial security review. Key protections:

- **Restricted tools** — Copilot CLI is only granted `shell(git)` (no `cat`, `grep`, filesystem access)
- **Minimal environment** — only `PATH`, `HOME`, and `GITHUB_TOKEN` are passed to the subprocess
- **Prompt armor** — PR content is sandboxed in delimited sections with injection-resistant formatting
- **Input sanitization** — PR titles, bodies, labels, and authors are sanitized for delimiter injection
- **Output sanitization** — all output is sanitized to prevent GitHub Actions workflow command injection (`::` commands)
- **Process isolation** — real timeout with SIGTERM + guaranteed SIGKILL fallback

## Development

```bash
npm install
npm test          # run 42 unit tests
npx ncc build src/index.ts -o dist   # rebuild dist/
```

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

This project is licensed under the terms of the MIT open source license. Please refer to the [LICENSE](./LICENSE) file for the full terms.

## Maintainers

This project is maintained by the [@github/gh-cli-and-desktop](https://github.com/orgs/github/teams/gh-cli-and-desktop) team.

## Support

For bug reports and feature requests, please [open an issue](https://github.com/github/copilot-release-notes/issues). See [SUPPORT.md](SUPPORT.md) for more details.

## Security

If you discover a security vulnerability, please see [SECURITY.md](SECURITY.md) for reporting instructions. **Do not open a public issue.**

## Code of Conduct

This project has adopted the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md).
