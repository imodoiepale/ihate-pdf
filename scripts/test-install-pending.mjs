#!/usr/bin/env node
/** Flag defaults for scripts/install-pending.sh — vendor-only unless --full. */
import { spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sh = join(root, 'scripts/install-pending.sh')

function run(args) {
  const r = spawnSync('bash', [sh, ...args], { encoding: 'utf8' })
  return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` }
}

const help = run(['--help'])
if (help.code !== 0) throw new Error(`--help exited ${help.code}`)
if (!help.out.includes('--full')) throw new Error('help should mention --full')

const vendor = run(['--dry-run'])
if (!/mode:\s*vendor-only/.test(vendor.out)) throw new Error(`default should be vendor-only:\n${vendor.out}`)
if (/Package manager .* installing:/.test(vendor.out)) throw new Error('vendor-only dry-run should not apt/brew')

const full = run(['--full', '--dry-run'])
if (!/mode:\s*full/.test(full.out)) throw new Error(`--full should be full:\n${full.out}`)

const explicit = run(['--vendor-only', '--dry-run'])
if (!/mode:\s*vendor-only/.test(explicit.out)) throw new Error('--vendor-only should stay vendor-only')

console.log('install-pending flags: ok')
