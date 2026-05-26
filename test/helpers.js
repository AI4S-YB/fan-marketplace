'use strict';
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

function createTestHome() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fan-test-'));
  return dir;
}

function cleanupTestHome(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

module.exports = { createTestHome, cleanupTestHome };
