# Fan-Marketplace Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the fan CLI — search, install, list, remove skills from a GitHub-based registry. Initialize the fan-marketplace registry with fan-skill as the first entry.

**Architecture:** Node.js CLI (Commander.js) that reads `index.json` from a GitHub registry, installs skills via git clone into `~/.fan/skills/`, and tracks state in `~/.fan/installed.json`. Each skill is described by `skill.yaml` in its own repo.

**Tech Stack:** Node.js, Commander.js, git (shell), standard library (fs, path, https)

**Scope Note:** This is Phase 1 (MVP). Cross-skill invoke (`fan invoke`) and Claude Code plugin adapter come in Phase 2. Web interface in Phase 3.

---

## File Structure

```
fan-marketplace/
├── DESIGN.md                    # Already exists — design spec
├── index.json                   # Registry index (the data, committed)
├── package.json                 # npm package: fan-cli
├── bin/
│   └── fan.js                   # CLI entry point (shebang, requires src/cli.js)
├── src/
│   ├── cli.js                   # Commander.js command definitions
│   ├── registry.js              # Fetch + cache + search registry index
│   ├── installer.js             # git clone skill into ~/.fan/skills/
│   ├── config.js                # Read/write ~/.fan/installed.json, registry.json
│   └── skill-yaml.js            # Parse and validate skill.yaml
├── test/
│   ├── registry.test.js
│   ├── installer.test.js
│   ├── config.test.js
│   ├── skill-yaml.test.js
│   └── helpers.js               # Test temp dirs, fake index, etc.
└── schema/
    └── skill-yaml.schema.json   # JSON Schema for skill.yaml validation
```

`~/.fan/` runtime structure:

```
~/.fan/
├── registry.json          # [{name, url}] — configured registries
├── installed.json         # {skills: {id: {version, provides, installed_at, source}}}
├── skills/                # Git clones of installed skills
│   ├── fan-skill/
│   └── ncbi-downloader/
└── cache/
    └── index.json         # Cached registry index (refresh with --refresh)
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `fan-marketplace/package.json`
- Create: `fan-marketplace/bin/fan.js`

- [ ] **Step 1: Initialize package.json**

```bash
cd /Users/kentnf/Desktop/cctest/fan-marketplace
npm init -y
```

- [ ] **Step 2: Write package.json with correct fields**

Write `fan-marketplace/package.json`:

```json
{
  "name": "fan-cli",
  "version": "0.1.0",
  "description": "CLI for the fan skill marketplace — search, install, and manage AI coding agent skills",
  "bin": {
    "fan": "./bin/fan.js"
  },
  "main": "./src/cli.js",
  "files": [
    "bin/",
    "src/",
    "schema/"
  ],
  "scripts": {
    "test": "node --test test/*.test.js",
    "start": "node bin/fan.js"
  },
  "keywords": ["fan", "skill", "marketplace", "ai", "claude-code"],
  "license": "MIT",
  "dependencies": {
    "commander": "^12.0.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

- [ ] **Step 3: Write bin/fan.js entry point**

Write `fan-marketplace/bin/fan.js`:

```js
#!/usr/bin/env node
'use strict';

require('../src/cli.js').run(process.argv);
```

- [ ] **Step 4: Make it executable and install dependencies**

```bash
chmod +x /Users/kentnf/Desktop/cctest/fan-marketplace/bin/fan.js
cd /Users/kentnf/Desktop/cctest/fan-marketplace && npm install
```

- [ ] **Step 5: Verify it loads (will error without cli.js, expected at this point)**

```bash
cd /Users/kentnf/Desktop/cctest/fan-marketplace && node bin/fan.js --help 2>&1 || true
```

Expected: `Cannot find module '../src/cli.js'` — then we write cli.js next.

- [ ] **Step 6: Initialize git and commit (if not already a repo)**

```bash
cd /Users/kentnf/Desktop/cctest/fan-marketplace
git init
echo "node_modules/" > .gitignore
git add -A
git commit -m "chore: scaffold fan-cli project"
```

---

### Task 2: Config Module (`~/.fan/` state management)

**Files:**
- Create: `fan-marketplace/src/config.js`
- Create: `fan-marketplace/test/config.test.js`
- Create: `fan-marketplace/test/helpers.js`

- [ ] **Step 1: Write the failing test**

Write `fan-marketplace/test/config.test.js`:

```js
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
```

Write `fan-marketplace/test/helpers.js`:

```js
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
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
cd /Users/kentnf/Desktop/cctest/fan-marketplace && node --test test/config.test.js
```

Expected: all fail — module not found or functions not defined.

- [ ] **Step 3: Write src/config.js implementation**

Write `fan-marketplace/src/config.js`:

```js
'use strict';
const path = require('node:path');
const fs = require('node:fs');

const FAN_DIR = '.fan';
const DEFAULT_REGISTRY_URL = 'https://github.com/AI4S-YB/fan-marketplace';

function fanDir(home) {
  home = home || (process.env.FAN_HOME || path.join(require('node:os').homedir()));
  return path.join(home, FAN_DIR);
}

function ensureFanDir(home) {
  const base = fanDir(home);
  const dirs = [
    base,
    path.join(base, 'skills'),
    path.join(base, 'cache')
  ];
  for (const d of dirs) {
    fs.mkdirSync(d, { recursive: true });
  }
  return dirs;
}

function loadInstalled(home) {
  const file = path.join(fanDir(home), 'installed.json');
  if (!fs.existsSync(file)) {
    return { skills: {} };
  }
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function saveInstalled(home, data) {
  ensureFanDir(home);
  const file = path.join(fanDir(home), 'installed.json');
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

function addInstalledSkill(home, skillId, info) {
  const state = loadInstalled(home);
  state.skills[skillId] = info;
  saveInstalled(home, state);
}

function removeInstalledSkill(home, skillId) {
  const state = loadInstalled(home);
  delete state.skills[skillId];
  saveInstalled(home, state);
}

function isInstalled(home, skillId) {
  const state = loadInstalled(home);
  return skillId in state.skills;
}

function loadRegistries(home) {
  const file = path.join(fanDir(home), 'registry.json');
  if (!fs.existsSync(file)) {
    return [{ name: 'fan-marketplace', url: DEFAULT_REGISTRY_URL }];
  }
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function saveRegistries(home, registries) {
  ensureFanDir(home);
  const file = path.join(fanDir(home), 'registry.json');
  fs.writeFileSync(file, JSON.stringify(registries, null, 2), 'utf-8');
}

module.exports = {
  fanDir,
  ensureFanDir,
  loadInstalled,
  saveInstalled,
  addInstalledSkill,
  removeInstalledSkill,
  isInstalled,
  loadRegistries,
  saveRegistries
};
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
cd /Users/kentnf/Desktop/cctest/fan-marketplace && node --test test/config.test.js
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/kentnf/Desktop/cctest/fan-marketplace
git add src/config.js test/config.test.js test/helpers.js
git commit -m "feat: add config module for ~/.fan state management"
```

---

### Task 3: skill.yaml Parser & Validator

**Files:**
- Create: `fan-marketplace/src/skill-yaml.js`
- Create: `fan-marketplace/schema/skill-yaml.schema.json`
- Create: `fan-marketplace/test/skill-yaml.test.js`

- [ ] **Step 1: Write the JSON Schema**

Write `fan-marketplace/schema/skill-yaml.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["name", "version"],
  "properties": {
    "name": { "type": "string", "pattern": "^[a-z][a-z0-9-]*$" },
    "version": { "type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+$" },
    "display_name": { "type": "string" },
    "description": { "type": "string" },
    "author": { "type": "string" },
    "license": { "type": "string" },
    "homepage": { "type": "string", "format": "uri" },
    "runtime": {
      "type": "object",
      "properties": {
        "type": { "enum": ["skill", "tool", "data"] },
        "min_fan_version": { "type": "string" }
      }
    },
    "provides": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "description"],
        "properties": {
          "id": { "type": "string" },
          "description": { "type": "string" },
          "input": { "type": "object" },
          "output": { "type": "object" }
        }
      }
    },
    "requires": {
      "type": "array",
      "items": { "type": "string" }
    },
    "external_deps": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": { "type": "string" },
          "install_hint": { "type": "string" },
          "required": { "type": "boolean" }
        }
      }
    },
    "layout": { "type": "string" }
  }
}
```

- [ ] **Step 2: Write the failing test**

Write `fan-marketplace/test/skill-yaml.test.js`:

```js
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { createTestHome, cleanupTestHome } = require('./helpers.js');

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
```

- [ ] **Step 3: Run tests, verify they fail**

```bash
cd /Users/kentnf/Desktop/cctest/fan-marketplace && node --test test/skill-yaml.test.js
```

Expected: all fail.

- [ ] **Step 4: Write src/skill-yaml.js**

Write `fan-marketplace/src/skill-yaml.js`:

```js
'use strict';
const path = require('node:path');
const fs = require('node:fs');

function parseSkillYaml(content) {
  const parsed = parseSimpleYaml(content);

  if (!parsed.name) {
    throw new Error('skill.yaml must have a "name" field');
  }
  if (!parsed.version) {
    throw new Error('skill.yaml must have a "version" field');
  }

  parsed.provides = parsed.provides || [];
  parsed.requires = parsed.requires || [];
  parsed.external_deps = parsed.external_deps || [];

  return parsed;
}

function parseSimpleYaml(content) {
  // Minimal YAML parser for skill.yaml subset: top-level scalars, arrays of objects with scalars
  // Does NOT support: nested objects deeper than 1 level, multi-line strings, anchors, tags
  const lines = content.split('\n');
  const result = {};
  let currentKey = null;
  let currentArray = null;
  let currentArrayItem = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '');
    if (line.trim() === '' || line.trim().startsWith('#')) continue;

    // Top-level scalar: key: value
    const scalarMatch = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (scalarMatch && !line.startsWith('  ') && !line.startsWith('\t')) {
      currentKey = scalarMatch[1];
      const val = scalarMatch[2].trim();
      if (val === '') {
        // Could be start of an array or empty value
        result[currentKey] = result[currentKey] || [];
        currentArray = result[currentKey];
        currentArrayItem = null;
      } else {
        const unquoted = val.replace(/^["'](.+)["']$/, '$1');
        result[currentKey] = unquoted;
        currentArray = null;
        currentArrayItem = null;
      }
      continue;
    }

    // Array item marker:   - key: value
    const arrayItemMatch = line.match(/^\s+-\s+(\w[\w-]*):\s*(.*)$/);
    if (arrayItemMatch && currentArray !== null) {
      currentArrayItem = {};
      currentArray.push(currentArrayItem);
      const k = arrayItemMatch[1];
      const v = arrayItemMatch[2].trim().replace(/^["'](.+)["']$/, '$1');
      currentArrayItem[k] = v;
      continue;
    }

    // Continuation of array item:     key: value
    const arrayFieldMatch = line.match(/^\s{4,}(\w[\w-]*):\s*(.*)$/);
    if (arrayFieldMatch && currentArrayItem !== null) {
      const k = arrayFieldMatch[1];
      const v = arrayFieldMatch[2].trim().replace(/^["'](.+)["']$/, '$1');
      currentArrayItem[k] = v;
      continue;
    }

    // Bare array item:   - value
    const bareItemMatch = line.match(/^\s+-\s+(.+)$/);
    if (bareItemMatch && currentArray !== null) {
      currentArray.push(bareItemMatch[1].trim().replace(/^["'](.+)["']$/, '$1'));
      currentArrayItem = null;
      continue;
    }
  }

  return result;
}

function readSkillYaml(skillDir) {
  const yamlPath = path.join(skillDir, 'skill.yaml');
  if (!fs.existsSync(yamlPath)) {
    return null;
  }
  const content = fs.readFileSync(yamlPath, 'utf-8');
  return parseSkillYaml(content);
}

module.exports = { parseSkillYaml, readSkillYaml };
```

- [ ] **Step 5: Run tests, verify they pass**

```bash
cd /Users/kentnf/Desktop/cctest/fan-marketplace && node --test test/skill-yaml.test.js
```

Expected: all 5 tests PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/kentnf/Desktop/cctest/fan-marketplace
git add src/skill-yaml.js schema/skill-yaml.schema.json test/skill-yaml.test.js
git commit -m "feat: add skill.yaml parser and validator"
```

---

### Task 4: Registry Module (fetch + cache + search)

**Files:**
- Create: `fan-marketplace/src/registry.js`
- Create: `fan-marketplace/test/registry.test.js`

- [ ] **Step 1: Write the failing test**

Write `fan-marketplace/test/registry.test.js`:

```js
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const { createTestHome, cleanupTestHome } = require('./helpers.js');

let testHome, server, serverUrl;

before(() => {
  testHome = createTestHome();
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
    } else {
      res.writeHead(404);
      res.end('not found');
    }
  });
  server.listen(0);
  serverUrl = `http://localhost:${server.address().port}`;
});

after(() => {
  cleanupTestHome(testHome);
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
    await assert.rejects(() => fetchIndex(serverUrl + '/nonexistent'));
  });
});

describe('searchSkills', () => {
  it('returns all skills when no query given', async () => {
    const { searchSkills } = require('../src/registry.js');
    const results = searchSkills(await (await import('../src/registry.js')).fetchIndex(serverUrl), '');
    assert.strictEqual(results.length, 1);
  });

  it('matches by skill id', async () => {
    const { searchSkills, fetchIndex } = require('../src/registry.js');
    const index = await fetchIndex(serverUrl);
    const results = searchSkills(index, 'test-skill');
    assert.strictEqual(results.length, 1);
  });

  it('matches by keyword', async () => {
    const { searchSkills, fetchIndex } = require('../src/registry.js');
    const index = await fetchIndex(serverUrl);
    const results = searchSkills(index, 'test');
    assert.strictEqual(results.length, 1);
  });

  it('returns empty array for no match', async () => {
    const { searchSkills, fetchIndex } = require('../src/registry.js');
    const index = await fetchIndex(serverUrl);
    const results = searchSkills(index, 'zzz-no-match');
    assert.strictEqual(results.length, 0);
  });
});

describe('resolveDependencies', () => {
  it('finds provider for a required capability', async () => {
    const { resolveDependencies, fetchIndex } = require('../src/registry.js');
    const index = await fetchIndex(serverUrl);
    const resolved = resolveDependencies(index, ['test-ability']);
    assert.strictEqual(resolved.length, 1);
    assert.strictEqual(resolved[0].skillId, 'test-skill');
    assert.strictEqual(resolved[0].capabilityId, 'test-ability');
  });

  it('returns empty for unmet dependency', async () => {
    const { resolveDependencies, fetchIndex } = require('../src/registry.js');
    const index = await fetchIndex(serverUrl);
    const resolved = resolveDependencies(index, ['nonexistent-ability']);
    assert.strictEqual(resolved.length, 0);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
cd /Users/kentnf/Desktop/cctest/fan-marketplace && node --test test/registry.test.js
```

Expected: all fail — module not found.

- [ ] **Step 3: Write src/registry.js**

Write `fan-marketplace/src/registry.js`:

```js
'use strict';
const https = require('node:https');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');

function fetchIndex(registryUrl) {
  return new Promise((resolve, reject) => {
    const url = new URL(registryUrl.endsWith('/index.json') ? registryUrl : registryUrl + '/index.json');
    // For file:// or local paths, read directly
    if (url.protocol === 'file:') {
      const content = fs.readFileSync(url.pathname, 'utf-8');
      resolve(JSON.parse(content));
      return;
    }
    const mod = url.protocol === 'https:' ? https : http;
    const fullUrl = url.pathname + url.search;
    mod.get(fullUrl, { hostname: url.hostname, port: url.port, headers: { 'Accept': 'application/json', 'User-Agent': 'fan-cli/0.1.0' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        fetchIndex(res.headers.location).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to fetch registry index: HTTP ${res.statusCode} from ${registryUrl}`));
        return;
      }
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`Failed to parse registry index JSON: ${e.message}`));
        }
      });
    }).on('error', (e) => {
      reject(new Error(`Failed to connect to registry at ${registryUrl}: ${e.message}`));
    });
  });
}

function searchSkills(index, query) {
  if (!query || query.trim() === '') {
    return index.skills;
  }
  const q = query.toLowerCase().trim();
  return index.skills.filter(s => {
    return s.id.toLowerCase().includes(q) ||
      (s.display_name && s.display_name.toLowerCase().includes(q)) ||
      (s.description && s.description.toLowerCase().includes(q)) ||
      (s.keywords && s.keywords.some(k => k.toLowerCase().includes(q)));
  });
}

function resolveDependencies(index, requiredCapabilities) {
  const resolved = [];
  for (const capId of requiredCapabilities) {
    const provider = index.skills.find(s =>
      s.provides && s.provides.includes(capId)
    );
    if (provider) {
      resolved.push({ skillId: provider.id, capabilityId: capId });
    }
  }
  return resolved;
}

function getSkillInfo(index, skillId) {
  return index.skills.find(s => s.id === skillId) || null;
}

module.exports = { fetchIndex, searchSkills, resolveDependencies, getSkillInfo };
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
cd /Users/kentnf/Desktop/cctest/fan-marketplace && node --test test/registry.test.js
```

Expected: all 6 tests PASS (note: the last test will fail the reject assertion because localhost returns ECONNREFUSED for nonexistent path if using http.get — adjust the test to use a server that returns 404 if needed, or just accept the error type).

Actual: the `rejects` test expects rejection, server returns 404 which triggers the `statusCode !== 200` path. Should pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/kentnf/Desktop/cctest/fan-marketplace
git add src/registry.js test/registry.test.js
git commit -m "feat: add registry module with fetch, search, and dependency resolution"
```

---

### Task 5: Installer Module

**Files:**
- Create: `fan-marketplace/src/installer.js`
- Create: `fan-marketplace/test/installer.test.js`

- [ ] **Step 1: Write the failing test**

Write `fan-marketplace/test/installer.test.js`:

```js
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { execSync } = require('node:child_process');
const { createTestHome, cleanupTestHome } = require('./helpers.js');

let testHome;

before(() => {
  testHome = createTestHome();
  const { ensureFanDir } = require('../src/config.js');
  ensureFanDir(testHome);
});

after(() => { cleanupTestHome(testHome); });

describe('installSkill', () => {
  it('clones a git repo into ~/.fan/skills/', async () => {
    const { installSkill } = require('../src/installer.js');
    // Use fan-skill repo as a real test (public, exists)
    const result = await installSkill(testHome, {
      id: 'fan-skill',
      distribution: {
        type: 'git',
        url: 'https://github.com/AI4S-YB/fan-skill.git',
        tag: 'v2.2.0'
      },
      version: '2.2.0'
    });
    assert.ok(result.success);
    assert.ok(fs.existsSync(path.join(testHome, '.fan', 'skills', 'fan-skill', 'SKILL.md')));
  }).timeout(60000);

  it('returns failure for nonexistent repo', async () => {
    const { installSkill } = require('../src/installer.js');
    const result = await installSkill(testHome, {
      id: 'nonexistent-fake',
      distribution: {
        type: 'git',
        url: 'https://github.com/nonexistent/fake-repo-12345.git'
      },
      version: '1.0.0'
    });
    assert.ok(!result.success);
    assert.ok(result.error);
  }).timeout(30000);
});

describe('removeSkill', () => {
  it('removes an installed skill directory', async () => {
    const { installSkill, removeSkill } = require('../src/installer.js');
    const { addInstalledSkill } = require('../src/config.js');

    // Install first
    await installSkill(testHome, {
      id: 'fan-skill',
      distribution: {
        type: 'git',
        url: 'https://github.com/AI4S-YB/fan-skill.git',
        tag: 'v2.2.0'
      },
      version: '2.2.0'
    });

    addInstalledSkill(testHome, 'fan-skill', { version: '2.2.0', provides: [], installed_at: new Date().toISOString(), source: 'test' });

    // Remove
    removeSkill(testHome, 'fan-skill');
    assert.ok(!fs.existsSync(path.join(testHome, '.fan', 'skills', 'fan-skill')));
  }).timeout(60000);
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
cd /Users/kentnf/Desktop/cctest/fan-marketplace && node --test test/installer.test.js
```

Expected: all fail.

- [ ] **Step 3: Write src/installer.js**

Write `fan-marketplace/src/installer.js`:

```js
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { execSync } = require('node:child_process');
const { fanDir, addInstalledSkill, removeInstalledSkill } = require('./config.js');

function installSkill(home, skillInfo) {
  return new Promise((resolve) => {
    const skillDir = path.join(fanDir(home), 'skills', skillInfo.id);

    // Clean up any previous partial install
    if (fs.existsSync(skillDir)) {
      fs.rmSync(skillDir, { recursive: true, force: true });
    }

    const dist = skillInfo.distribution;
    if (dist.type !== 'git') {
      resolve({ success: false, error: `Unsupported distribution type: ${dist.type}` });
      return;
    }

    try {
      const args = ['clone', '--depth', '1'];
      if (dist.tag) {
        args.push('--branch', dist.tag);
      }
      args.push(dist.url, skillDir);

      execSync('git ' + args.join(' '), {
        stdio: 'pipe',
        timeout: 30000
      });

      // Verify skill.yaml exists
      const yamlPath = path.join(skillDir, 'skill.yaml');
      const hasSkillYaml = fs.existsSync(yamlPath);

      // Record in installed.json
      addInstalledSkill(home, skillInfo.id, {
        version: skillInfo.version || 'unknown',
        provides: skillInfo.provides || [],
        installed_at: new Date().toISOString(),
        source: dist.url,
        has_skill_yaml: hasSkillYaml
      });

      resolve({ success: true, dir: skillDir });
    } catch (e) {
      // Clean up failed clone
      if (fs.existsSync(skillDir)) {
        fs.rmSync(skillDir, { recursive: true, force: true });
      }
      resolve({ success: false, error: e.stderr ? e.stderr.toString() : e.message });
    }
  });
}

function removeSkill(home, skillId) {
  const skillDir = path.join(fanDir(home), 'skills', skillId);
  if (fs.existsSync(skillDir)) {
    fs.rmSync(skillDir, { recursive: true, force: true });
  }
  removeInstalledSkill(home, skillId);
}

function updateSkill(home, skillId) {
  const skillDir = path.join(fanDir(home), 'skills', skillId);
  if (!fs.existsSync(skillDir)) {
    return { success: false, error: `Skill '${skillId}' is not installed` };
  }
  try {
    execSync('git pull --ff-only', { cwd: skillDir, stdio: 'pipe', timeout: 30000 });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.stderr ? e.stderr.toString() : e.message };
  }
}

module.exports = { installSkill, removeSkill, updateSkill };
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
cd /Users/kentnf/Desktop/cctest/fan-marketplace && node --test test/installer.test.js
```

Expected: 2 tests PASS. (install of fan-skill from git + remove)

- [ ] **Step 5: Commit**

```bash
cd /Users/kentnf/Desktop/cctest/fan-marketplace
git add src/installer.js test/installer.test.js
git commit -m "feat: add installer module (git clone + remove + update)"
```

---

### Task 6: CLI Commands

**Files:**
- Create: `fan-marketplace/src/cli.js`

- [ ] **Step 1: Write the CLI with all commands**

Write `fan-marketplace/src/cli.js`:

```js
'use strict';
const { Command } = require('commander');
const path = require('node:path');
const os = require('node:os');
const { loadInstalled, saveInstalled, loadRegistries, saveRegistries, ensureFanDir } = require('./config.js');
const { fetchIndex, searchSkills, resolveDependencies, getSkillInfo } = require('./registry.js');
const { installSkill, removeSkill, updateSkill } = require('./installer.js');

const HOME = process.env.FAN_HOME ? path.resolve(process.env.FAN_HOME) : os.homedir();

function run(argv) {
  const program = new Command();

  program
    .name('fan')
    .description('Fan Marketplace CLI — search, install, and manage AI coding agent skills')
    .version('0.1.0');

  // fan search [query]
  program.command('search')
    .description('Search available skills')
    .argument('[query]', 'Search query (fuzzy match on id, name, description, keywords)')
    .option('--refresh', 'Force refresh registry cache')
    .action(async (query, opts) => {
      ensureFanDir(HOME);
      const registries = loadRegistries(HOME);
      let allSkills = [];

      for (const reg of registries) {
        try {
          const index = await fetchIndex(reg.url);
          allSkills = allSkills.concat(index.skills);
        } catch (e) {
          console.error(`Warning: failed to fetch registry '${reg.name}': ${e.message}`);
        }
      }

      const results = searchSkills({ skills: allSkills }, query || '');

      if (results.length === 0) {
        console.log('No skills found.');
        if (!query) console.log('The registry appears to be empty.');
        return;
      }

      console.log(`\nFound ${results.length} skill(s):\n`);
      for (const s of results) {
        console.log(`  ${s.id}  (${s.version || '?'})`);
        console.log(`    ${s.description || s.display_name || ''}`);
        if (s.author) console.log(`    author: ${s.author}`);
        console.log('');
      }
    });

  // fan info <skill-id>
  program.command('info')
    .description('Show detailed information about a skill')
    .argument('<skill-id>', 'Skill identifier')
    .action(async (skillId) => {
      ensureFanDir(HOME);
      const registries = loadRegistries(HOME);
      let skill = null;

      for (const reg of registries) {
        try {
          const index = await fetchIndex(reg.url);
          skill = getSkillInfo(index, skillId);
          if (skill) break;
        } catch (e) {
          // continue to next registry
        }
      }

      if (!skill) {
        console.log(`Skill '${skillId}' not found in any registry.`);
        return;
      }

      console.log(`\n  ${skill.id}  (v${skill.version})`);
      console.log(`  ${skill.description || ''}`);
      console.log(`  Author:     ${skill.author || 'unknown'}`);
      console.log(`  License:    ${skill.license || 'unknown'}`);
      console.log(`  Homepage:   ${skill.homepage || 'N/A'}`);
      console.log(`  Category:   ${skill.category || 'N/A'}`);
      console.log(`  Provides:   ${(skill.provides || []).join(', ') || 'none'}`);
      console.log(`  Requires:   ${(skill.requires || []).join(', ') || 'none'}`);
      console.log(`  Install:    ${skill.distribution ? skill.distribution.url : 'N/A'}`);
      console.log('');

      // Show installed status
      const installed = loadInstalled(HOME);
      if (installed.skills[skillId]) {
        console.log(`  Status: INSTALLED (v${installed.skills[skillId].version})`);
      } else {
        console.log('  Status: not installed');
      }
      console.log('');
    });

  // fan install <skill-id>[@version]
  program.command('install')
    .description('Install a skill from the registry')
    .argument('<skill-spec>', 'Skill identifier, optionally with @version (e.g. ncbi-downloader@1.2.0)')
    .option('--no-deps', 'Skip automatic dependency installation')
    .action(async (skillSpec, opts) => {
      ensureFanDir(HOME);

      const [skillId, requestedVersion] = skillSpec.split('@');
      const registries = loadRegistries(HOME);
      let skill = null;

      for (const reg of registries) {
        try {
          const index = await fetchIndex(reg.url);
          skill = getSkillInfo(index, skillId);
          if (skill) break;
        } catch (e) {
          // continue
        }
      }

      if (!skill) {
        console.error(`Error: Skill '${skillId}' not found in any registry.`);
        console.error('Run `fan search` to see available skills.');
        process.exit(1);
      }

      if (requestedVersion && skill.version !== requestedVersion) {
        console.error(`Warning: requested version ${requestedVersion}, registry has ${skill.version}. Installing ${skill.version}.`);
      }

      // Check dependencies
      const installed = loadInstalled(HOME);
      if (!opts.noDeps && skill.requires && skill.requires.length > 0) {
        for (const reg of registries) {
          try {
            const index = await fetchIndex(reg.url);
            const depsNeeded = resolveDependencies(index, skill.requires);
            for (const dep of depsNeeded) {
              if (!installed.skills[dep.skillId]) {
                console.log(`Dependency '${dep.capabilityId}' → installing ${dep.skillId}...`);
                const depSkill = getSkillInfo(index, dep.skillId);
                if (depSkill) {
                  const result = await installSkill(HOME, depSkill);
                  if (result.success) {
                    console.log(`  Installed: ${dep.skillId} v${depSkill.version}`);
                  } else {
                    console.error(`  Failed to install dependency ${dep.skillId}: ${result.error}`);
                  }
                }
              }
            }
          } catch (e) { /* skip registry on dep check failure */ }
        }
      }

      // Install the skill itself
      console.log(`Installing ${skillId} v${skill.version}...`);
      const result = await installSkill(HOME, skill);

      if (result.success) {
        console.log(`Successfully installed ${skillId} v${skill.version}`);
        console.log(`Location: ${result.dir}`);
      } else {
        console.error(`Installation failed: ${result.error}`);
        process.exit(1);
      }
    });

  // fan list
  program.command('list')
    .description('List installed skills')
    .action(() => {
      ensureFanDir(HOME);
      const installed = loadInstalled(HOME);
      const ids = Object.keys(installed.skills);

      if (ids.length === 0) {
        console.log('No skills installed.');
        console.log('Run `fan search` to discover skills, then `fan install <id>` to install.');
        return;
      }

      console.log(`\nInstalled skills (${ids.length}):\n`);
      for (const id of ids) {
        const info = installed.skills[id];
        console.log(`  ${id}  v${info.version}`);
        console.log(`    installed: ${info.installed_at}`);
        if (info.provides && info.provides.length > 0) {
          console.log(`    provides: ${info.provides.join(', ')}`);
        }
        console.log('');
      }
    });

  // fan remove <skill-id>
  program.command('remove')
    .description('Uninstall a skill')
    .argument('<skill-id>', 'Skill identifier')
    .action((skillId) => {
      const installed = loadInstalled(HOME);
      if (!installed.skills[skillId]) {
        console.error(`Error: '${skillId}' is not installed.`);
        process.exit(1);
      }

      removeSkill(HOME, skillId);
      console.log(`Removed: ${skillId}`);
    });

  // fan update [skill-id]
  program.command('update')
    .description('Update installed skills')
    .argument('[skill-id]', 'Skill identifier (omit to update all)')
    .action((skillId) => {
      ensureFanDir(HOME);
      const installed = loadInstalled(HOME);

      if (skillId) {
        if (!installed.skills[skillId]) {
          console.error(`Error: '${skillId}' is not installed.`);
          process.exit(1);
        }
        const result = updateSkill(HOME, skillId);
        if (result.success) {
          console.log(`Updated: ${skillId}`);
        } else {
          console.error(`Update failed: ${result.error}`);
          process.exit(1);
        }
      } else {
        const ids = Object.keys(installed.skills);
        if (ids.length === 0) {
          console.log('No skills installed.');
          return;
        }
        for (const id of ids) {
          const result = updateSkill(HOME, id);
          console.log(result.success ? `Updated: ${id}` : `Failed: ${id} — ${result.error}`);
        }
      }
    });

  // fan registry add <url>
  program.command('registry')
    .description('Manage skill registries')
    .argument('<action>', 'add | list')
    .argument('[url]', 'Registry URL (for add)')
    .action((action, url) => {
      ensureFanDir(HOME);

      if (action === 'list') {
        const registries = loadRegistries(HOME);
        console.log(`\nConfigured registries (${registries.length}):\n`);
        for (const reg of registries) {
          console.log(`  ${reg.name}: ${reg.url}`);
        }
        console.log('');
        return;
      }

      if (action === 'add') {
        if (!url) {
          console.error('Usage: fan registry add <url>');
          process.exit(1);
        }
        const registries = loadRegistries(HOME);
        const name = url.replace(/^https?:\/\//, '').replace(/\/+$/, '').split('/').pop() || 'custom';
        registries.push({ name, url });
        saveRegistries(HOME, registries);
        console.log(`Registry added: ${name} (${url})`);
        return;
      }

      console.error(`Unknown registry action: ${action}. Use 'add' or 'list'.`);
      process.exit(1);
    });

  program.parse(argv);
}

module.exports = { run };
```

- [ ] **Step 2: Test CLI search (dry run locally — will need network)**

Since we don't have a registry deployed yet, test by pointing at the local index.json:

```bash
cd /Users/kentnf/Desktop/cctest/fan-marketplace
FAN_HOME=/tmp/fan-test node bin/fan.js search
```

Expected: "No skills found." or fetches from GitHub if index.json is published.

- [ ] **Step 3: Test with a local file-based registry**

```bash
cd /Users/kentnf/Desktop/cctest/fan-marketplace
# First, add a local registry pointing to the index.json file
FAN_HOME=/tmp/fan-test node bin/fan.js registry add "file://$(pwd)/index.json" 2>&1 || true
# Try search (file:// protocol may need adjustment — if not supported yet, skip)
FAN_HOME=/tmp/fan-test node bin/fan.js registry list
```

- [ ] **Step 4: Test help output**

```bash
cd /Users/kentnf/Desktop/cctest/fan-marketplace && node bin/fan.js --help
```

Expected: All commands listed with descriptions.

- [ ] **Step 5: Link locally for `fan` command**

```bash
cd /Users/kentnf/Desktop/cctest/fan-marketplace && npm link
fan --help
```

Expected: Works as a global command.

- [ ] **Step 6: Commit**

```bash
cd /Users/kentnf/Desktop/cctest/fan-marketplace
git add src/cli.js
git commit -m "feat: add CLI commands (search, info, install, list, remove, update, registry)"
```

---

### Task 7: Initialize index.json with fan-skill

**Files:**
- Create: `fan-marketplace/index.json`

- [ ] **Step 1: Write index.json**

Write `fan-marketplace/index.json`:

```json
{
  "registry": {
    "name": "fan-marketplace",
    "version": "1.0.0",
    "updated": "2026-05-26T00:00:00Z"
  },
  "skills": [
    {
      "id": "fan-skill",
      "display_name": "Fan-Skill: Plant Bioinformatics Engine",
      "description": "AI-powered plant bioinformatics and breeding analysis engine. From biological question to publication-ready results — consultation, analysis, interpretation, and visualization. Knowledge-base driven with B+C dual-mode decision architecture.",
      "author": "AI4S-YB",
      "version": "2.3.0",
      "license": "MIT",
      "homepage": "https://github.com/AI4S-YB/fan-skill",
      "distribution": {
        "type": "git",
        "url": "https://github.com/AI4S-YB/fan-skill.git",
        "tag": "v2.2.0"
      },
      "provides": ["consult-analysis", "design-experiment", "knowledge-matching", "visualize-data"],
      "requires": [],
      "keywords": ["bioinformatics", "plant", "breeding", "genomics", "transcriptomics", "phylogeny", "gwas", "genomic-selection"],
      "category": "core"
    }
  ]
}
```

- [ ] **Step 2: Validate JSON**

```bash
cd /Users/kentnf/Desktop/cctest/fan-marketplace && node -e "JSON.parse(require('fs').readFileSync('index.json','utf-8')); console.log('Valid JSON')"
```

- [ ] **Step 3: Commit**

```bash
cd /Users/kentnf/Desktop/cctest/fan-marketplace
git add index.json
git commit -m "feat: initialize registry index with fan-skill entry"
```

---

### Task 8: Add skill.yaml to fan-skill repo

> **Note:** This task modifies the fan-skill repo, not fan-marketplace.

**Files:**
- Create: `plant-bioinfo-skills/skill.yaml`

- [ ] **Step 1: Write skill.yaml in fan-skill repo**

Write `/Users/kentnf/Desktop/cctest/plant-bioinfo-skills/skill.yaml`:

```yaml
name: fan-skill
version: 2.3.0
display_name: "Fan-Skill: Plant Bioinformatics Engine"
description: >
  AI-powered plant bioinformatics and breeding analysis engine.
  From biological question to publication-ready results —
  consultation, analysis, interpretation, and visualization.
  Knowledge-base driven with B+C dual-mode decision architecture.
author: AI4S-YB
license: MIT
homepage: https://github.com/AI4S-YB/fan-skill
runtime:
  type: skill
  min_fan_version: "0.1.0"
provides:
  - id: consult-analysis
    description: Guide users from biological question to analysis plan through structured consultation
  - id: design-experiment
    description: Design bioinformatics experiments using 29 knowledge-base entries
  - id: knowledge-matching
    description: Match user goals to knowledge-base entries with deviation detection
  - id: visualize-data
    description: Generate publication-quality visualizations from analysis results
requires: []
layout: standard
```

- [ ] **Step 2: Commit in fan-skill repo**

```bash
cd /Users/kentnf/Desktop/cctest/plant-bioinfo-skills
git add skill.yaml
git commit -m "feat: add skill.yaml for fan-marketplace registration"
```

---

## Phase 1 Completion Checklist

After all tasks are complete, verify the full flow:

```bash
# Link the CLI
cd /Users/kentnf/Desktop/cctest/fan-marketplace && npm link

# Search
fan search "plant"

# Info
fan info fan-skill

# Install
fan install fan-skill

# List installed
fan list

# Remove
fan remove fan-skill
```

---

## What's NOT in Phase 1

- `fan invoke` command (Phase 2)
- Automatic Claude Code plugin sync (Phase 3)
- Web interface (Phase 4)
- `skill.yaml` → Claude Code frontmatter generation (Phase 3)
- Version conflict detection for shared dependencies (Phase 2)
- Checksum/signature verification of skill packages (later)
