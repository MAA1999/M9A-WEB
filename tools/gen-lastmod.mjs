#!/usr/bin/env node
//
// Generate a per-page "last modified" manifest for the sitemap.
//
// The docs are copied into this repository from MAA1999/M9A at deploy time, so
// the markdown files here have no git history of their own and
// `@vuepress/plugin-git` cannot date them. This script reads the history from
// the M9A checkout instead and writes `docs/.vuepress/lastmod.json`, which
// `config.ts` feeds to the sitemap plugin's `modifyTimeGetter`.
//
// Requires a checkout with full history (`fetch-depth: 0`); with a shallow
// clone every page dates to the same commit.
//
// Usage: node tools/gen-lastmod.mjs <m9a-checkout> [output]

import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const [repoDir, output = 'docs/.vuepress/lastmod.json'] = process.argv.slice(2)

if (!repoDir) {
  console.error('Usage: node tools/gen-lastmod.mjs <m9a-checkout> [output]')
  process.exit(1)
}

/**
 * `git log` lists commits newest first, so the first time a path shows up is
 * its most recent change.
 */
function readLastModified(repo) {
  const log = execFileSync(
    'git',
    ['-C', repo, 'log', '--format=%cI', '--name-only', '--', 'docs'],
    { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 },
  )

  const manifest = {}
  let committedAt = ''

  for (const line of log.split('\n')) {
    const entry = line.trim()
    if (!entry) continue
    if (/^\d{4}-\d{2}-\d{2}T/.test(entry)) {
      committedAt = entry
      continue
    }
    if (!committedAt) continue

    // Keys are relative to the docs directory, matching page.filePathRelative.
    // The log is newest first, so the first write for a key is its last change.
    const key = entry.replace(/^docs\//, '')
    manifest[key] ??= committedAt
  }

  return manifest
}

const manifest = readLastModified(repoDir)
const count = Object.keys(manifest).length

if (count === 0) {
  console.error(`No docs history found in ${repoDir}. Is it a full clone?`)
  process.exit(1)
}

writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`Wrote ${count} entries to ${path.relative(process.cwd(), output)}`)
