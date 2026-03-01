import fs from 'fs'
import path from 'path'

const outFile = path.join(process.cwd(), 'dist', 'index.js')

if (!fs.existsSync(outFile)) {
  throw new Error(`Missing build output: ${outFile}`)
}

const shebang = '#!/usr/bin/env node\n'
const current = fs.readFileSync(outFile, 'utf8')

if (!current.startsWith(shebang)) {
  fs.writeFileSync(outFile, shebang + current, 'utf8')
}

const stat = fs.statSync(outFile)
// Ensure executable bit (preserve other mode bits).
fs.chmodSync(outFile, stat.mode | 0o111)
