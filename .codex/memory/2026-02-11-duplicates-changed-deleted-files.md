# Duplicates Gate Bug: `--changed` Crashes On Deleted Files

## Symptom

Running `pnpm check:duplicates --changed` could crash with `ENOENT` when a deleted file path was present in the git diff.

This happened because `collectChangedFiles()` includes deleted paths from `git diff --name-only`, and `jscpd` tries to `lstat()` every path passed on the CLI.

## Fix

In `scripts/quality/check-duplicates.mjs`, filter the `--changed` file list to only include paths that still exist on disk:

- `collectChangedFiles() ... .filter((p) => fs.existsSync(path.join(repoRoot, p)))`

This preserves the intended behavior (scan changed files only) while allowing legitimate deletions without breaking the gate.

