import * as core from '@actions/core'
import * as io from '@actions/io'
import * as exec from '@actions/exec'
import {spawn} from 'child_process'

export interface CopilotResult {
  stdout: string
  exitCode: number
}

const COPILOT_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

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
    {silent: true, env: buildCopilotEnv()}
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
 * Build the minimal environment for the Copilot CLI subprocess.
 * Only pass what's needed — never spread process.env which leaks secrets.
 */
function buildCopilotEnv(): Record<string, string> {
  const env: Record<string, string> = {}

  // Essentials for the process to run
  if (process.env.PATH) env.PATH = process.env.PATH
  if (process.env.HOME) env.HOME = process.env.HOME
  if (process.env.RUNNER_TEMP) env.RUNNER_TEMP = process.env.RUNNER_TEMP

  // Node.js needs these
  if (process.env.NODE_PATH) env.NODE_PATH = process.env.NODE_PATH
  if (process.env.NODE_OPTIONS) env.NODE_OPTIONS = process.env.NODE_OPTIONS

  // Auth token — prefer COPILOT_GITHUB_TOKEN, fall back to GITHUB_TOKEN
  const token =
    process.env.COPILOT_GITHUB_TOKEN || process.env.GITHUB_TOKEN || ''
  if (!token) {
    core.warning(
      'No COPILOT_GITHUB_TOKEN or GITHUB_TOKEN found — Copilot CLI may fail to authenticate'
    )
  }
  env.GITHUB_TOKEN = token

  return env
}

/**
 * Run the Copilot CLI with the given prompt and return the result.
 * Uses child_process.spawn directly so we can enforce a real timeout
 * by killing the process if it exceeds the limit.
 */
export async function runCopilot(
  copilotPath: string,
  prompt: string,
  model?: string
): Promise<CopilotResult> {
  core.info(`Prompt size: ${prompt.length} chars`)

  const args: string[] = [
    '--prompt',
    prompt,
    '--allow-tool',
    'shell(git)'
  ]

  if (model) {
    args.push('--model', model)
  }

  return new Promise<CopilotResult>((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    let killed = false
    let killTimerId: ReturnType<typeof setTimeout> | undefined

    const cp = spawn(copilotPath, args, {
      env: buildCopilotEnv(),
      stdio: ['ignore', 'pipe', 'pipe']
    })

    const timeoutId = setTimeout(() => {
      killed = true
      cp.kill('SIGTERM')
      // Always send SIGKILL after grace period — no-op if already dead
      killTimerId = setTimeout(() => {
        try {
          cp.kill('SIGKILL')
        } catch {
          // Process already exited
        }
      }, 10_000)
    }, COPILOT_TIMEOUT_MS)

    // Sanitize complete output to prevent workflow command injection (lines starting with ::)
    // We sanitize the full accumulated string rather than per-chunk to avoid
    // chunk boundaries splitting a '::' sequence across two chunks.
    const sanitize = (text: string): string =>
      text.replace(/^::/gm, '  ::')

    cp.stdout.on('data', (data: Buffer) => {
      stdout += data.toString()
    })

    cp.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    cp.on('close', (code: number | null) => {
      clearTimeout(timeoutId)

      // Write sanitized output now that we have complete strings
      if (stdout) process.stdout.write(sanitize(stdout))
      if (stderr) process.stderr.write(sanitize(stderr))
      if (killTimerId) clearTimeout(killTimerId)

      if (killed) {
        reject(
          new Error(
            `Copilot CLI timed out after ${COPILOT_TIMEOUT_MS / 1000} seconds and was killed`
          )
        )
        return
      }

      const exitCode = code ?? 1
      if (exitCode !== 0) {
        core.error(`Copilot CLI exited with code ${exitCode}`)
        core.error(`stderr: ${stderr}`)
        reject(new Error(`Copilot CLI failed with exit code ${exitCode}`))
        return
      }

      resolve({stdout, exitCode})
    })

    cp.on('error', (err: Error) => {
      clearTimeout(timeoutId)
      if (killTimerId) clearTimeout(killTimerId)
      reject(new Error(`Failed to spawn Copilot CLI: ${err.message}`))
    })
  })
}
