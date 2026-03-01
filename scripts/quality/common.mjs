import { execFileSync } from 'node:child_process'

export function toPosix(value) {
  return value.replace(/\\/g, '/')
}

export function runGit(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

export function unique(values) {
  return [...new Set(values)]
}

export function getRepoRoot() {
  return toPosix(runGit(['rev-parse', '--show-toplevel']) || process.cwd())
}

export function collectChangedFiles() {
  const unstaged = runGit(['diff', '--name-only', '--relative'])
  const staged = runGit(['diff', '--cached', '--name-only', '--relative'])
  const untracked = runGit(['ls-files', '--others', '--exclude-standard'])

  return unique(
    [unstaged, staged, untracked]
      .filter(Boolean)
      .flatMap((chunk) => chunk.split('\n'))
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map(toPosix),
  )
}

export function collectFullFiles() {
  const tracked = runGit(['ls-files'])
  const untracked = runGit(['ls-files', '--others', '--exclude-standard'])

  return unique(
    [tracked, untracked]
      .filter(Boolean)
      .flatMap((chunk) => chunk.split('\n'))
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map(toPosix),
  )
}
