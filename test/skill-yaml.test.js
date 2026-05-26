'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

describe('parseSkillYaml', () => {
  it('parses a valid skill.yaml', async () => {
    const { parseSkillYaml } = require('../src/skill-yaml.js');
    const content = `
name: test-skill
version: 1.0.0
display_name: "Test Skill"
description: "A test skill"
author: tester
`;
    const parsed = parseSkillYaml(content);
    assert.strictEqual(parsed.name, 'test-skill');
    assert.strictEqual(parsed.version, '1.0.0');
  });

  it('throws on missing name', async () => {
    const { parseSkillYaml } = require('../src/skill-yaml.js');
    assert.throws(() => parseSkillYaml('version: 1.0.0'), /name/);
  });

  it('throws on missing version', async () => {
    const { parseSkillYaml } = require('../src/skill-yaml.js');
    assert.throws(() => parseSkillYaml('name: foo'), /version/);
  });

  it('parses provides and requires arrays', async () => {
    const { parseSkillYaml } = require('../src/skill-yaml.js');
    const content = `
name: rich-skill
version: 2.0.0
provides:
  - id: search-x
    description: Search X
  - id: download-x
    description: Download X
requires:
  - search-ncbi
  - format-converter
`;
    const parsed = parseSkillYaml(content);
    assert.strictEqual(parsed.provides.length, 2);
    assert.strictEqual(parsed.provides[0].id, 'search-x');
    assert.deepStrictEqual(parsed.requires, ['search-ncbi', 'format-converter']);
  });
});

describe('readSkillYaml', () => {
  it('reads and parses skill.yaml from a directory', async () => {
    const { readSkillYaml } = require('../src/skill-yaml.js');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fan-skill-dir-'));
    fs.writeFileSync(path.join(dir, 'skill.yaml'), 'name: dir-skill\nversion: 3.0.0\n');
    const parsed = readSkillYaml(dir);
    assert.strictEqual(parsed.name, 'dir-skill');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns null when skill.yaml does not exist', async () => {
    const { readSkillYaml } = require('../src/skill-yaml.js');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fan-empty-'));
    const result = readSkillYaml(dir);
    assert.strictEqual(result, null);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
