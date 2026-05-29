#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');

const REPO_ROOT = path.join(__dirname, '..');
const REGISTRY_LIST = path.join(REPO_ROOT, 'registry-list.json');
const OUTPUT = path.join(REPO_ROOT, 'index.json');

// Parse minimal YAML (same logic as src/skill-yaml.js)
function parseSimpleYaml(content) {
  const lines = content.split('\n');
  const result = {};
  let currentKey = null;
  let currentArray = null;
  let currentArrayItem = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '');
    if (line.trim() === '' || line.trim().startsWith('#')) continue;

    const scalarMatch = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (scalarMatch && !line.startsWith('  ') && !line.startsWith('\t')) {
      currentKey = scalarMatch[1];
      const val = scalarMatch[2].trim();
      if (val === '') {
        result[currentKey] = result[currentKey] || [];
        currentArray = result[currentKey];
        currentArrayItem = null;
      } else if (val === '>' || val === '|') {
        // YAML multi-line scalar — collect subsequent indented lines
        result[currentKey] = '';
        currentArray = null;
        currentArrayItem = null;
        // The value is in the collected continuation block below
      } else if (val === '>-' || val === '|-' || val === '>+' || val === '|+') {
        // YAML block chomping variants
        result[currentKey] = '';
        currentArray = null;
        currentArrayItem = null;
      } else {
        const unquoted = val.replace(/^["'](.+)["']$/, '$1');
        result[currentKey] = unquoted;
        currentArray = null;
        currentArrayItem = null;
      }
      continue;
    }

    // Continuation line for multi-line scalar (the value is being collected in currentKey)
    // Lines indented with 2+ spaces that follow a > or | scalar indicator
    if (currentKey && !currentArray && typeof result[currentKey] === 'string' && line.match(/^\s{2,}(\S.*)$/)) {
      const contMatch = line.match(/^\s{2,}(\S.*)$/);
      if (contMatch) {
        result[currentKey] += (result[currentKey] ? ' ' : '') + contMatch[1].trim();
        continue;
      }
    }

    const arrayItemMatch = line.match(/^\s+-\s+(\w[\w-]*):\s*(.*)$/);
    if (arrayItemMatch && currentArray !== null) {
      currentArrayItem = {};
      currentArray.push(currentArrayItem);
      const k = arrayItemMatch[1];
      const v = arrayItemMatch[2].trim().replace(/^["'](.+)["']$/, '$1');
      currentArrayItem[k] = v;
      continue;
    }

    const arrayFieldMatch = line.match(/^\s{4,}(\w[\w-]*):\s*(.*)$/);
    if (arrayFieldMatch && currentArrayItem !== null) {
      const k = arrayFieldMatch[1];
      const v = arrayFieldMatch[2].trim().replace(/^["'](.+)["']$/, '$1');
      currentArrayItem[k] = v;
      continue;
    }

    const bareItemMatch = line.match(/^\s+-\s+(.+)$/);
    if (bareItemMatch && currentArray !== null) {
      currentArray.push(bareItemMatch[1].trim().replace(/^["'](.+)["']$/, '$1'));
      currentArrayItem = null;
      continue;
    }
  }
  return result;
}

// Convert GitHub URL to jsDelivr skill.yaml URL
function toJsdelivrUrl(repoUrl) {
  // https://github.com/OWNER/REPO → https://cdn.jsdelivr.net/gh/OWNER/REPO@main/skill.yaml
  const u = new URL(repoUrl);
  const parts = u.pathname.replace(/\/+$/, '').split('/');
  const owner = parts[1];
  const repo = parts[2];
  return `https://cdn.jsdelivr.net/gh/${owner}/${repo}@main/skill.yaml`;
}

// Fetch skill.yaml
function fetchYaml(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : require('http');
    mod.get(u, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        fetchYaml(res.headers.location).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(body));
    }).on('error', reject);
  });
}

async function main() {
  const list = JSON.parse(fs.readFileSync(REGISTRY_LIST, 'utf-8'));
  const skills = [];

  for (const repoUrl of list) {
    const yamlUrl = toJsdelivrUrl(repoUrl);
    console.log(`Fetching: ${yamlUrl}`);
    try {
      const content = await fetchYaml(yamlUrl);
      const yaml = parseSimpleYaml(content);

      if (!yaml.name || !yaml.version) {
        console.warn(`  Warning: skipping ${repoUrl} — missing name or version in skill.yaml`);
        continue;
      }

      // Extract provide IDs (just the string IDs, not objects)
      let provides = [];
      if (yaml.provides && Array.isArray(yaml.provides)) {
        provides = yaml.provides.map(p => typeof p === 'string' ? p : p.id).filter(Boolean);
      }

      // Ensure requires is an array
      let requires = [];
      if (yaml.requires && Array.isArray(yaml.requires)) {
        requires = yaml.requires;
      }

      // Keywords: support both array and YAML multi-line string
      let keywords = [];
      if (yaml.keywords) {
        if (Array.isArray(yaml.keywords)) {
          keywords = yaml.keywords;
        } else if (typeof yaml.keywords === 'string') {
          keywords = yaml.keywords.replace(/[\[\]]/g, '').split(',').map(s => s.trim()).filter(Boolean);
        }
      }

      const skill = {
        id: yaml.name,
        display_name: yaml.display_name || yaml.name,
        description: yaml.description || '',
        author: yaml.author || '',
        version: yaml.version,
        license: yaml.license || 'MIT',
        homepage: yaml.homepage || repoUrl,
        distribution: {
          type: 'git',
          url: repoUrl + (repoUrl.endsWith('.git') ? '' : '.git')
        },
        provides,
        requires,
        keywords,
        category: yaml.category || 'community'
      };

      skills.push(skill);
      console.log(`  OK: ${skill.id} v${skill.version}`);
    } catch (e) {
      console.warn(`  Warning: failed to fetch ${repoUrl} — ${e.message}`);
    }
  }

  const index = {
    registry: {
      name: 'fan-marketplace',
      version: '1.0.0',
      updated: new Date().toISOString()
    },
    skills
  };

  fs.writeFileSync(OUTPUT, JSON.stringify(index, null, 2) + '\n');
  console.log(`\nGenerated index.json with ${skills.length} skill(s)`);
}

main().catch(e => { console.error(e); process.exit(1); });
