'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { createTestHome, cleanupTestHome } = require('./helpers.js');

let testHome;

before(() => { testHome = createTestHome(); });
after(() => { cleanupTestHome(testHome); });

describe('ensureFanDir', () => {
  it('creates ~/.fan directory structure', async () => {
    const { ensureFanDir } = require('../src/config.js');
    const dirs = ensureFanDir(testHome);
    for (const d of dirs) {
      assert.ok(fs.existsSync(d), `${d} should exist`);
    }
  });

  it('is idempotent', async () => {
    const { ensureFanDir } = require('../src/config.js');
    ensureFanDir(testHome);
    ensureFanDir(testHome);
    assert.ok(fs.existsSync(path.join(testHome, '.fan', 'skills')));
  });
});

describe('loadInstalled', () => {
  it('returns empty skills object when no installed.json exists', async () => {
    const { ensureFanDir, loadInstalled } = require('../src/config.js');
    ensureFanDir(testHome);
    const state = loadInstalled(testHome);
    assert.deepStrictEqual(state, { skills: {} });
  });
});

describe('saveInstalled / loadInstalled', () => {
  it('round-trips installed skill data', async () => {
    const { ensureFanDir, saveInstalled, loadInstalled } = require('../src/config.js');
    ensureFanDir(testHome);
    const data = {
      skills: {
        'ncbi-downloader': { version: '1.2.0', provides: ['search-ncbi'], installed_at: new Date().toISOString(), source: 'https://github.com/xxx/ncbi-downloader.git' }
      }
    };
    saveInstalled(testHome, data);
    const loaded = loadInstalled(testHome);
    assert.deepStrictEqual(loaded, data);
  });
});

describe('loadRegistries / saveRegistries', () => {
  it('returns default registry when no registry.json exists', async () => {
    const { ensureFanDir, loadRegistries } = require('../src/config.js');
    ensureFanDir(testHome);
    const regs = loadRegistries(testHome);
    assert.strictEqual(regs.length, 1);
    assert.ok(regs[0].url.includes('fan-marketplace'));
  });

  it('round-trips custom registries', async () => {
    const { ensureFanDir, saveRegistries, loadRegistries } = require('../src/config.js');
    ensureFanDir(testHome);
    const regs = [
      { name: 'fan-marketplace', url: 'https://github.com/AI4S-YB/fan-marketplace' },
      { name: 'custom', url: 'https://example.com/registry' }
    ];
    saveRegistries(testHome, regs);
    const loaded = loadRegistries(testHome);
    assert.strictEqual(loaded.length, 2);
    assert.strictEqual(loaded[1].name, 'custom');
  });
});
