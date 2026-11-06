#!/usr/bin/env node
'use strict';
const { run } = require('./_lib.cjs');

console.log('[1/4] Typecheck (tsc --noEmit)...');
if (run('npx', ['tsc', '--noEmit']) !== 0) {
  console.log('FAIL: typecheck');
  process.exit(1);
}

console.log('[2/4] Lint...');
if (run('npm', ['run', 'lint']) !== 0) {
  console.log('FAIL: lint');
  process.exit(1);
}

console.log('[3/4] Build...');
if (run('npm', ['run', 'build']) !== 0) {
  console.log('FAIL: build');
  process.exit(1);
}

console.log('[4/5] Unit tests (vitest)...');
if (run('npm', ['run', 'test:unit']) !== 0) {
  console.log('FAIL: unit tests');
  process.exit(1);
}

console.log('[5/5] Playwright E2E tests...');
if (run('npx', ['playwright', 'test']) !== 0) {
  console.log('FAIL: Playwright E2E tests');
  process.exit(1);
}

console.log('PASS');
process.exit(0);
