// Compares the high-severity advisories npm audit reports against the accepted list in
// .github/audit-allowlist, and fails only on one that is not accepted yet.
//
// Why a set of advisory ids and not a count: a count has a stale window. Drop from 21 to 10
// without lowering the number, and five new advisories can arrive unnoticed under the old
// ceiling. A set has no such window, needs no lowering when things improve, and its diff says
// which advisory was accepted rather than how many.
//
// Only `high` is compared. Criticals are gated unconditionally by their own step, so
// allowlisting one has to be impossible rather than merely discouraged.
//
// Usage: node .github/scripts/audit-gate.mjs <audit.json> <allowlist> [detail-out.md]
// Exit 0 when nothing is new, 1 when something is.

import { readFileSync, writeFileSync } from 'node:fs'

const [auditPath, allowlistPath, detailPath] = process.argv.slice(2)
if (!auditPath || !allowlistPath) {
  console.error('usage: audit-gate.mjs <audit.json> <allowlist> [detail-out.md]')
  process.exit(2)
}

// npm audit reports a package once, but the advisories behind it live in `via`. A `via` entry
// that is a string is a transitive consequence (next is flagged "via postcss"), not an
// advisory of its own, so only the objects carry an id worth tracking.
const audit = JSON.parse(readFileSync(auditPath, 'utf8'))
const current = new Map()
for (const vuln of Object.values(audit.vulnerabilities ?? {})) {
  for (const via of vuln.via ?? []) {
    if (typeof via !== 'object' || via.severity !== 'high') continue
    const id = /GHSA-[a-z0-9-]+/.exec(via.url ?? '')?.[0]
    if (id && !current.has(id)) current.set(id, { pkg: via.name, title: via.title, url: via.url })
  }
}

const accepted = new Set(
  readFileSync(allowlistPath, 'utf8')
    .split('\n')
    .map((line) => /^\s*(GHSA-[a-z0-9-]+)/.exec(line)?.[1])
    .filter(Boolean),
)

const fresh = [...current.keys()].filter((id) => !accepted.has(id)).sort()
const stale = [...accepted].filter((id) => !current.has(id)).sort()

console.log(`${current.size} high advisories reported, ${accepted.size} accepted.`)

// Stale entries are good news and must never fail the build, or improving the tree turns the
// check red. They are worth saying out loud, because an entry nobody prunes is an acceptance
// that outlives its reason.
if (stale.length) {
  const entries = stale.length === 1 ? 'entry' : 'entries'
  const verb = stale.length === 1 ? 'is' : 'are'
  console.log()
  console.log(`${stale.length} allowlist ${entries} no longer apply and can be pruned:`)
  stale.forEach((id) => console.log(`  ${id}`))
  console.log(`::warning::${stale.length} ${entries} in .github/audit-allowlist ${verb} now stale`)
}

if (!fresh.length) {
  console.log('\nNo new high-severity advisories.')
  process.exit(0)
}

const detail = [
  `\`npm audit\` reports ${fresh.length} high-severity ${fresh.length === 1 ? 'advisory' : 'advisories'} that \`.github/audit-allowlist\` does not accept:`,
  '',
  ...fresh.map((id) => {
    const { pkg, title, url } = current.get(id)
    return `- **${pkg}** ${id}: ${title}\n  ${url}`
  }),
  '',
  'Either fix it, or accept it by adding the id to `.github/audit-allowlist` with a reason in the commit message.',
].join('\n')

console.log(`\n${detail}`)
if (detailPath) writeFileSync(detailPath, detail)
process.exit(1)
