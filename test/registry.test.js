'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

let server, serverUrl;

before(() => {
  // Start a tiny HTTP server to serve a fake index.json
  server = http.createServer((req, res) => {
    if (req.url === '/index.json' || req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        registry: { name: 'test-registry', version: '1.0.0', updated: new Date().toISOString() },
        skills: [
          {
            id: 'test-skill',
            display_name: 'Test Skill',
            description: 'A test',
            author: 'tester',
            version: '1.0.0',
            homepage: 'https://github.com/test/test-skill',
            distribution: { type: 'git', url: 'https://github.com/test/test-skill.git', tag: 'v1.0.0' },
            provides: ['test-ability'],
            requires: [],
            keywords: ['test'],
            category: 'testing'
          }
        ]
      }));
    } else if (req.url === '/404') {
      res.writeHead(404);
      res.end('not found');
    } else {
      res.writeHead(404);
      res.end('not found');
    }
  });
  server.listen(0);
  serverUrl = `http://localhost:${server.address().port}`;
});

after(() => {
  server.close();
});

describe('fetchIndex', () => {
  it('fetches and parses index.json from a URL', async () => {
    const { fetchIndex } = require('../src/registry.js');
    const index = await fetchIndex(serverUrl);
    assert.strictEqual(index.registry.name, 'test-registry');
    assert.strictEqual(index.skills.length, 1);
    assert.strictEqual(index.skills[0].id, 'test-skill');
  });

  it('rejects on non-200 response', async () => {
    const { fetchIndex } = require('../src/registry.js');
    await assert.rejects(() => fetchIndex(serverUrl + '/404'));
  });
});

describe('searchSkills', () => {
  let index;

  before(async () => {
    const { fetchIndex } = require('../src/registry.js');
    index = await fetchIndex(serverUrl);
  });

  it('returns all skills when no query given', async () => {
    const { searchSkills } = require('../src/registry.js');
    const results = searchSkills(index, '');
    assert.strictEqual(results.length, 1);
  });

  it('matches by skill id', async () => {
    const { searchSkills } = require('../src/registry.js');
    const results = searchSkills(index, 'test-skill');
    assert.strictEqual(results.length, 1);
  });

  it('matches by keyword', async () => {
    const { searchSkills } = require('../src/registry.js');
    const results = searchSkills(index, 'test');
    assert.strictEqual(results.length, 1);
  });

  it('returns empty array for no match', async () => {
    const { searchSkills } = require('../src/registry.js');
    const results = searchSkills(index, 'zzz-no-match');
    assert.strictEqual(results.length, 0);
  });
});

describe('resolveDependencies', () => {
  let index;

  before(async () => {
    const { fetchIndex } = require('../src/registry.js');
    index = await fetchIndex(serverUrl);
  });

  it('finds provider for a required capability', async () => {
    const { resolveDependencies } = require('../src/registry.js');
    const resolved = resolveDependencies(index, ['test-ability']);
    assert.strictEqual(resolved.length, 1);
    assert.strictEqual(resolved[0].skillId, 'test-skill');
    assert.strictEqual(resolved[0].capabilityId, 'test-ability');
  });

  it('returns empty for unmet dependency', async () => {
    const { resolveDependencies } = require('../src/registry.js');
    const resolved = resolveDependencies(index, ['nonexistent-ability']);
    assert.strictEqual(resolved.length, 0);
  });
});
