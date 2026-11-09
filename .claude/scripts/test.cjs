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

// E2E lives in the sibling repo home-control-frontend-testing (feature 148). Mock mode only:
// BASE_URL is stripped so the gate never runs against PRO. FRONTEND_DIR points the suite at this repo.
console.log('[5/5] Playwright E2E tests (home-control-frontend-testing, mock mode)...');
const path = require('path');
const fs = require('fs');
const { REPO_ROOT } = require('./_lib.cjs');
const suiteDir = path.resolve(REPO_ROOT, '..', 'home-control-frontend-testing');
if (!fs.existsSync(path.join(suiteDir, 'package.json'))) {
  console.log(`FAIL: E2E suite not found at ${suiteDir} (clone home-control-frontend-testing next to this repo)`);
  process.exit(1);
}
const e2eEnv = { ...process.env, FRONTEND_DIR: REPO_ROOT };
delete e2eEnv.BASE_URL;
if (run('npm', ['--prefix', suiteDir, 'test'], { env: e2eEnv }) !== 0) {
  console.log('FAIL: Playwright E2E tests');
  process.exit(1);
}

console.log('PASS');
process.exit(0);
