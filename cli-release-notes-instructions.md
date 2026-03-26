# GitHub CLI Release Notes Instructions

## Format & Structure

Organize entries into exactly these category sections (use these exact headings as tags):

- **✨ Features** — New features, new commands, new flags, or significant new capabilities
- **🐛 Fixes** — Bug fixes (describe what works now, not what was broken)
- **📚 Docs & Chores** — Documentation updates, README changes, internal maintenance, refactors, test fixes, script cleanup, CI config, and other non-feature/non-fix work
- **:dependabot: Dependencies** — Dependency version bumps (summarize briefly)

Every entry must be placed in one of these categories.

## Entry Format

Each entry must follow this exact format:

```
<description> by @<author> in #<pr_number>
```

Examples:
- `gh pr create`, `gh issue create`, `gh issue edit`: search-based assignee selection and login-based mutation on github.com by @BagToad in #13009
- Fix typo: remove extra space in README.md link by @realMelTuc in #12725
- chore(deps): bump google.golang.org/grpc from 1.79.2 to 1.79.3 by @dependabot[bot] in #12963

## Writing Style

1. **Be concise** — focus on user-visible impact
2. **Use imperative/present tense** — "Add", "Fix", "Update", "Ensure", "Remove"
3. **Use backticks** for command names (`gh pr merge`), flags (`--squash`),
   environment variables (`GH_TOKEN`), file paths, and package names
4. **For dependency bumps** — use the conventional commit format:
   `chore(deps): bump <package> from <old> to <new>`
5. **For fixes** — use the conventional commit prefix when natural:
   `fix(<scope>): description`
6. **Include the author** — always include `by @username` at the end before `in #PR`
7. **Include the PR link** — always end with `in #<number>`

## What to Include

Include **all PRs**. Nothing should be silently skipped. Categorize everything
into the sections above. Even test fixes, CI changes, and typo corrections
belong under "📚 Docs & Chores".

