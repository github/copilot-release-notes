import * as exec from '@actions/exec'
import * as core from '@actions/core'
import * as io from '@actions/io'
import * as fs from 'fs'
import * as path from 'path'

export interface CopilotResult {
  stdout: string
  exitCode: number
}

/**
 * Ensure the Copilot CLI is installed and available.
 */
export async function ensureCopilotCLI(): Promise<string> {
  // Check if copilot is already available
  try {
    const copilotPath = await io.which('copilot', false)
    if (copilotPath) {
      core.info(`Copilot CLI found at: ${copilotPath}`)
      return copilotPath
    }
  } catch {
    // Not found, install it
  }

  core.info('Installing Copilot CLI via npm...')
  const exitCode = await exec.exec(
    'npm',
    ['install', '-g', '@github/copilot'],
    {silent: true}
  )

  if (exitCode !== 0) {
    throw new Error(
      'Failed to install Copilot CLI. Please ensure Node.js v22+ is available ' +
        'or install it manually before running this action.'
    )
  }

  const copilotPath = await io.which('copilot', true)
  core.info(`Copilot CLI installed at: ${copilotPath}`)
  return copilotPath
}

/**
 * Run the Copilot CLI with the given prompt and return the result.
 */
export async function runCopilot(
  copilotPath: string,
  prompt: string,
  model?: string
): Promise<CopilotResult> {
  // Write prompt to a temp file to avoid shell escaping issues
  const promptDir = path.join(
    process.env.RUNNER_TEMP || '/tmp',
    'copilot-release-notes'
  )
  fs.mkdirSync(promptDir, {recursive: true})
  const promptFile = path.join(promptDir, 'prompt.txt')
  fs.writeFileSync(promptFile, prompt, 'utf-8')

  core.info(`Prompt written to ${promptFile} (${prompt.length} chars)`)

  const args: string[] = [
    '--prompt',
    prompt,
    '--allow-tool',
    'shell(git)',
    '--allow-tool',
    'shell(cat)',
    '--allow-tool',
    'shell(head)',
    '--allow-tool',
    'shell(tail)',
    '--allow-tool',
    'shell(grep)',
    '--allow-tool',
    'shell(wc)',
    '--allow-tool',
    'shell(jq)',
    '--allow-all-paths'
  ]

  if (model) {
    args.push('--model', model)
  }

  let stdout = ''
  let stderr = ''

  const exitCode = await exec.exec(copilotPath, args, {
    listeners: {
      stdout: (data: Buffer) => {
        stdout += data.toString()
      },
      stderr: (data: Buffer) => {
        stderr += data.toString()
      }
    },
    env: {
      ...process.env,
      GITHUB_TOKEN: process.env.COPILOT_GITHUB_TOKEN || ''
    }
  })

  if (exitCode !== 0) {
    core.error(`Copilot CLI exited with code ${exitCode}`)
    core.error(`stderr: ${stderr}`)
    throw new Error(`Copilot CLI failed with exit code ${exitCode}`)
  }

  // Clean up temp file
  try {
    fs.unlinkSync(promptFile)
  } catch {
    // Ignore cleanup errors
  }

  return {stdout, exitCode}
}
