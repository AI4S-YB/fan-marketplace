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
