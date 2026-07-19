#!/usr/bin/env node
/**
 * scripts/classify-pr-risk.js
 *
 * Classifies a PR's changed files into a risk tier so low-risk changes
 * (docs, tests, copy, styling) can be fast-tracked, while anything that
 * touches money, auth, or verification state is explicitly flagged as
 * requiring a human look before merge — not auto-approved by a bot.
 *
 * Why this exists instead of "just don't review anymore": this repo has
 * already shipped real bugs in exactly this class of code (see the FIX:
 * comments in src/app/api/checkout/paystack/webhook/route.ts — a ticket
 * reference casing bug that silently left paid tickets invalid forever,
 * and a webhook race condition that could double-run a payout). Removing
 * review entirely from that code path is how bugs like that survive to
 * production undetected. This script narrows *what* needs a human, not
 * whether anything does.
 *
 * Usage: node scripts/classify-pr-risk.js <file1> <file2> ...
 * (In CI, pass the PR's changed files list.)
 * Exits 0 always — this informs, it does not block by itself. Wire its
 * output into branch protection / required reviewers if you want it to
 * actually gate merges.
 */

const HIGH_RISK_PATTERNS = [
  /payout/i,
  /bank-account/i,
  /\/admin\//,
  /webhook/i,
  /\/auth/i,
  /encryption/i,
  /verify/i,
  /paystack/i,
  /prisma\/schema\.prisma$/,
  /\/api\/checkout\//,
];

const MEDIUM_RISK_PATTERNS = [
  /\/api\//, // any other API route not caught above
  /\/lib\//, // shared business logic
];

const LOW_RISK_PATTERNS = [
  /\.test\.ts$/,
  /\.md$/,
  /^docs\//,
  /\.css$/,
  /README/,
];

function classify(file) {
  if (LOW_RISK_PATTERNS.some((p) => p.test(file))) return 'LOW';
  if (HIGH_RISK_PATTERNS.some((p) => p.test(file))) return 'HIGH';
  if (MEDIUM_RISK_PATTERNS.some((p) => p.test(file))) return 'MEDIUM';
  return 'LOW';
}

function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.log('No files passed. Usage: node scripts/classify-pr-risk.js <file1> <file2> ...');
    process.exit(0);
  }

  const results = files.map((f) => ({ file: f, risk: classify(f) }));
  const overall = results.some((r) => r.risk === 'HIGH')
    ? 'HIGH'
    : results.some((r) => r.risk === 'MEDIUM')
    ? 'MEDIUM'
    : 'LOW';

  console.log(`\nPR Risk: ${overall}\n`);
  for (const r of results) console.log(`  [${r.risk}] ${r.file}`);

  console.log('');
  if (overall === 'HIGH') {
    console.log('🔴 Touches payments, auth, verification, or the DB schema.');
    console.log('   Human review required before merge. Do not auto-merge.');
  } else if (overall === 'MEDIUM') {
    console.log('🟡 Touches API routes or shared lib code.');
    console.log('   A quick human skim is recommended, not mandatory.');
  } else {
    console.log('🟢 Docs, tests, or styling only. Safe to fast-track.');
  }

  // Emit for GitHub Actions to pick up as a step output.
  if (process.env.GITHUB_OUTPUT) {
    require('fs').appendFileSync(process.env.GITHUB_OUTPUT, `risk=${overall}\n`);
  }
}

main();
