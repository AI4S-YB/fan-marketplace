'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { execSync } = require('node:child_process');
const { createTestHome, cleanupTestHome } = require('./helpers.js');

let testHome;
let localRepoPath;

before(() => {
  testHome = createTestHome();
  const { ensureFanDir } = require('../src/config.js');
  ensureFanDir(testHome);

  // Create a local git repo to use as a test skill source
  localRepoPath = path.join(testHome, 'test-skill-repo');
  fs.mkdirSync(localRepoPath, { recursive: true });
  execSync('git init', { cwd: localRepoPath, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: localRepoPath, stdio: 'pipe' });
  execSync('git config user.name "Test"', { cwd: localRepoPath, stdio: 'pipe' });
  fs.writeFileSync(path.join(localRepoPath, 'SKILL.md'), '# Test Skill\n');
  execSync('git add SKILL.md', { cwd: localRepoPath, stdio: 'pipe' });
  execSync('git commit -m "initial commit"', { cwd: localRepoPath, stdio: 'pipe' });
});

after(() => { cleanupTestHome(testHome); });

describe('installSkill', () => {
  it('clones a git repo into ~/.fan/skills/', { timeout: 30000 }, async () => {
    const { installSkill } = require('../src/installer.js');
    const result = await installSkill(testHome, {
      id: 'fan-skill',
      distribution: {
        type: 'git',
        url: 'file://' + localRepoPath
      },
      version: '2.2.0'
    });
    assert.ok(result.success, `install failed: ${result.error}`);
    assert.ok(fs.existsSync(path.join(testHome, '.fan', 'skills', 'fan-skill', 'SKILL.md')));
  });

  it('returns failure for nonexistent repo', { timeout: 30000 }, async () => {
    const { installSkill } = require('../src/installer.js');
    const result = await installSkill(testHome, {
      id: 'nonexistent-fake',
      distribution: {
        type: 'git',
        url: 'file:///nonexistent/path/to/fake-repo'
      },
      version: '1.0.0'
    });
    assert.ok(!result.success);
    assert.ok(result.error);
  });
});

describe('removeSkill', () => {
  it('removes an installed skill directory', { timeout: 30000 }, async () => {
    const { installSkill, removeSkill } = require('../src/installer.js');
    const { addInstalledSkill, isInstalled } = require('../src/config.js');

    // Install first
    await installSkill(testHome, {
      id: 'fan-skill-2',
      distribution: {
        type: 'git',
        url: 'file://' + localRepoPath
      },
      version: '2.2.0'
    });

    addInstalledSkill(testHome, 'fan-skill-2', { version: '2.2.0', provides: [], installed_at: new Date().toISOString(), source: 'test' });

    // Remove
    removeSkill(testHome, 'fan-skill-2');
    assert.ok(!fs.existsSync(path.join(testHome, '.fan', 'skills', 'fan-skill-2')));
    assert.strictEqual(isInstalled(testHome, 'fan-skill-2'), false);
  });
});
