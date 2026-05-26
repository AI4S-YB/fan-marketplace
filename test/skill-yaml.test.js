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

  it('parses nested objects like runtime', async () => {
    const { parseSkillYaml } = require('../src/skill-yaml.js');
    const content = `
name: test-skill
version: 1.0.0
runtime:
  type: skill
  min_fan_version: "1.0.0"
`;
    const parsed = parseSkillYaml(content);
    assert.deepStrictEqual(parsed.runtime, {
      type: 'skill',
      min_fan_version: '1.0.0',
    });
  });

  it('rejects name that does not start with lowercase letter', async () => {
    const { parseSkillYaml } = require('../src/skill-yaml.js');
    assert.throws(
      () => parseSkillYaml('name: 123bad\nversion: 1.0.0'),
      /name/
    );
  });

  it('rejects name with invalid characters', async () => {
    const { parseSkillYaml } = require('../src/skill-yaml.js');
    assert.throws(
      () => parseSkillYaml('name: Bad_Skill!\nversion: 1.0.0'),
      /name/
    );
  });

  it('rejects version that is not semver', async () => {
    const { parseSkillYaml } = require('../src/skill-yaml.js');
    assert.throws(
      () => parseSkillYaml('name: test\nversion: v1.0'),
      /version/
    );
  });

  it('rejects version with only two components', async () => {
    const { parseSkillYaml } = require('../src/skill-yaml.js');
    assert.throws(
      () => parseSkillYaml('name: test\nversion: 1.0'),
      /version/
    );
  });

  it('parses a full canonical skill.yaml', async () => {
    const { parseSkillYaml } = require('../src/skill-yaml.js');
    const content = `
name: ncbi-downloader
version: 1.2.0
display_name: "NCBI Data Downloader"
description: "Search and download sequences from NCBI"
author: community-user
license: MIT
homepage: https://github.com/xxx/ncbi-downloader
runtime:
  type: skill
  min_fan_version: "1.0.0"
provides:
  - id: search-ncbi
    description: Search NCBI databases
  - id: download-sequences
    description: Download FASTA sequences
requires:
  - format-converter
external_deps:
  - name: sra-toolkit
    install_hint: conda install -c bioconda sra-toolkit
layout: standard
`;
    const parsed = parseSkillYaml(content);
    assert.strictEqual(parsed.name, 'ncbi-downloader');
    assert.strictEqual(parsed.version, '1.2.0');
    assert.strictEqual(parsed.display_name, 'NCBI Data Downloader');
    assert.strictEqual(
      parsed.description,
      'Search and download sequences from NCBI'
    );
    assert.strictEqual(parsed.author, 'community-user');
    assert.strictEqual(parsed.license, 'MIT');
    assert.strictEqual(parsed.homepage, 'https://github.com/xxx/ncbi-downloader');
    assert.deepStrictEqual(parsed.runtime, {
      type: 'skill',
      min_fan_version: '1.0.0',
    });
    assert.strictEqual(parsed.provides.length, 2);
    assert.strictEqual(parsed.provides[0].id, 'search-ncbi');
    assert.strictEqual(
      parsed.provides[0].description,
      'Search NCBI databases'
    );
    assert.strictEqual(parsed.provides[1].id, 'download-sequences');
    assert.deepStrictEqual(parsed.requires, ['format-converter']);
    assert.strictEqual(parsed.external_deps.length, 1);
    assert.strictEqual(parsed.external_deps[0].name, 'sra-toolkit');
    assert.strictEqual(
      parsed.external_deps[0].install_hint,
      'conda install -c bioconda sra-toolkit'
    );
    assert.strictEqual(parsed.layout, 'standard');
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
