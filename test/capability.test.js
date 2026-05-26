'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { createTestHome, cleanupTestHome } = require('./helpers.js');

let testHome;

before(() => {
  testHome = createTestHome();
  const { ensureFanDir } = require('../src/config.js');
  ensureFanDir(testHome);
});

after(() => { cleanupTestHome(testHome); });

function setupSkill(home, skillId, info, yamlContent) {
  const { fanDir, saveInstalled } = require('../src/config.js');
  const { addInstalledSkill } = require('../src/config.js');

  // Create skill directory with skill.yaml
  const skillDir = path.join(fanDir(home), 'skills', skillId);
  fs.mkdirSync(skillDir, { recursive: true });

  if (yamlContent) {
    fs.writeFileSync(path.join(skillDir, 'skill.yaml'), yamlContent);
  }

  // Create SKILL.md
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `# ${skillId} — AI agent context`);

  // Register in installed.json
  addInstalledSkill(home, skillId, info);
}

describe('findCapabilityProvider', () => {
  it('returns skill info for an installed capability', () => {
    setupSkill(testHome, 'test-skill',
      { version: '1.0.0', provides: ['echo-msg', 'download-data'] },
      'name: test-skill\nversion: 1.0.0\n');

    const { findCapabilityProvider } = require('../src/capability.js');
    const result = findCapabilityProvider(testHome, 'download-data');
    assert.ok(result);
    assert.strictEqual(result.skillId, 'test-skill');
    assert.strictEqual(result.version, '1.0.0');
    assert.ok(result.skillDir.endsWith('test-skill'));
  });

  it('returns null for unknown capability', () => {
    setupSkill(testHome, 'other-skill',
      { version: '2.0.0', provides: ['only-this'] },
      'name: other-skill\nversion: 2.0.0\n');

    const { findCapabilityProvider } = require('../src/capability.js');
    const result = findCapabilityProvider(testHome, 'nonexistent');
    assert.strictEqual(result, null);
  });

  it('returns null when no skills installed', () => {
    const { findCapabilityProvider } = require('../src/capability.js');
    const emptyHome = require('./helpers.js').createTestHome();
    const { ensureFanDir } = require('../src/config.js');
    ensureFanDir(emptyHome);

    const result = findCapabilityProvider(emptyHome, 'anything');
    assert.strictEqual(result, null);

    require('./helpers.js').cleanupTestHome(emptyHome);
  });
});

describe('listAllCapabilities', () => {
  let listHome;

  before(() => {
    listHome = require('./helpers.js').createTestHome();
    const { ensureFanDir } = require('../src/config.js');
    ensureFanDir(listHome);
  });

  after(() => { require('./helpers.js').cleanupTestHome(listHome); });

  it('returns all capabilities from multiple skills', () => {
    setupSkill(listHome, 'skill-a',
      { version: '1.0.0', provides: ['cap-a1', 'cap-a2'] },
      'name: skill-a\nversion: 1.0.0\n');
    setupSkill(listHome, 'skill-b',
      { version: '2.0.0', provides: ['cap-b1'] },
      'name: skill-b\nversion: 2.0.0\n');

    const { listAllCapabilities } = require('../src/capability.js');
    const result = listAllCapabilities(listHome);

    const ids = result.map(c => c.capabilityId);
    assert.ok(ids.includes('cap-a1'));
    assert.ok(ids.includes('cap-a2'));
    assert.ok(ids.includes('cap-b1'));
  });

  it('returns empty array when no skills installed', () => {
    const { listAllCapabilities } = require('../src/capability.js');
    const emptyHome = require('./helpers.js').createTestHome();
    const { ensureFanDir } = require('../src/config.js');
    ensureFanDir(emptyHome);

    const result = listAllCapabilities(emptyHome);
    assert.deepStrictEqual(result, []);

    require('./helpers.js').cleanupTestHome(emptyHome);
  });

  it('skips skills with empty provides', () => {
    setupSkill(listHome, 'empty-skill',
      { version: '1.0.0', provides: [] },
      'name: empty-skill\nversion: 1.0.0\n');

    const { listAllCapabilities } = require('../src/capability.js');
    const result = listAllCapabilities(listHome);
    const fromEmptySkill = result.filter(c => c.skillId === 'empty-skill');
    assert.strictEqual(fromEmptySkill.length, 0);
  });
});

describe('invokeCapability', () => {
  it('executes a run command and passes extra args', () => {
    setupSkill(testHome, 'echo-skill',
      { version: '1.0.0', provides: ['greet'] },
      `name: echo-skill
version: 1.0.0
provides:
  - id: greet
    description: Say hello
    run: echo hello
`);

    const { invokeCapability } = require('../src/capability.js');
    // should not throw
    invokeCapability(testHome, 'echo-skill', 'greet');
  });

  it('outputs SKILL.md when no run field', () => {
    setupSkill(testHome, 'ai-skill',
      { version: '1.0.0', provides: ['think'] },
      `name: ai-skill
version: 1.0.0
provides:
  - id: think
    description: Think deeply
`);

    const { invokeCapability } = require('../src/capability.js');
    // should not throw — outputs SKILL.md to stdout
    invokeCapability(testHome, 'ai-skill', 'think');
  });

  it('throws on non-installed skill', () => {
    const { invokeCapability } = require('../src/capability.js');
    assert.throws(
      () => invokeCapability(testHome, 'not-installed', 'anything'),
      /not installed/
    );
  });

  it('throws on missing capability in skill.yaml', () => {
    setupSkill(testHome, 'limited-skill',
      { version: '1.0.0', provides: ['only-this'] },
      `name: limited-skill
version: 1.0.0
provides:
  - id: only-this
    description: Only this
`);

    const { invokeCapability } = require('../src/capability.js');
    assert.throws(
      () => invokeCapability(testHome, 'limited-skill', 'not-found'),
      /not found/
    );
  });

  it('throws on missing skill.yaml', () => {
    // Setup skill dir without skill.yaml
    setupSkill(testHome, 'no-yaml-skill',
      { version: '1.0.0', provides: ['ghost'] },
      null  // no skill.yaml
    );

    const { invokeCapability } = require('../src/capability.js');
    assert.throws(
      () => invokeCapability(testHome, 'no-yaml-skill', 'ghost'),
      /No skill.yaml/
    );
  });
});
