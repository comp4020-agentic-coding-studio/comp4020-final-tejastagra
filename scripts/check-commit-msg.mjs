#!/usr/bin/env node
// Rejects commit messages that do not follow the format in CLAUDE.md.
import { readFileSync } from 'node:fs';

const text = readFileSync(process.argv[2], 'utf8')
  .split('\n')
  .filter((l) => !l.startsWith('#'))
  .join('\n')
  .trim();

if (/^(Merge|Revert|fixup!|squash!)/.test(text)) process.exit(0);

const subject = text.split('\n')[0] ?? '';
const errors = [];
if (!subject) errors.push('The subject line is empty.');
if (subject.length > 72) errors.push(`The subject is ${subject.length} characters; keep it to 72.`);
for (const key of ['Why', 'What', 'Harness', 'Prompt']) {
  if (!new RegExp(`^${key}:\\s*\\S`, 'm').test(text)) errors.push(`Missing a "${key}:" line.`);
}
// CLAUDE.md "Commit messages": no co-author trailer and no AI or Claude attribution.
if (/^co-authored-by:/im.test(text)) errors.push('Remove the Co-Authored-By trailer (CLAUDE.md "Commit messages").');
if (/generated with \[?claude|noreply@anthropic\.com/i.test(text)) errors.push('Remove the AI attribution (CLAUDE.md "Commit messages").');
if (text.includes('\u2014')) errors.push('Remove em dashes (house style).');

if (errors.length) {
  console.error('Commit message rejected:\n- ' + errors.join('\n- ') + '\n\nSee "Commit messages" in CLAUDE.md.');
  process.exit(1);
}
