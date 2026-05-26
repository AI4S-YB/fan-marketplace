'use strict';
const path = require('node:path');
const fs = require('node:fs');

function parseSkillYaml(content) {
  const parsed = parseSimpleYaml(content);

  if (!parsed.name) {
    throw new Error('skill.yaml must have a "name" field');
  }
  if (!/^[a-z][a-z0-9-]*$/.test(parsed.name)) {
    throw new Error(
      'skill.yaml "name" must start with a lowercase letter and contain only lowercase letters, digits, and hyphens'
    );
  }
  if (!parsed.version) {
    throw new Error('skill.yaml must have a "version" field');
  }
  if (!/^\d+\.\d+\.\d+$/.test(parsed.version)) {
    throw new Error(
      'skill.yaml "version" must be semver format (e.g., 1.0.0)'
    );
  }

  parsed.provides = parsed.provides || [];
  parsed.requires = parsed.requires || [];
  parsed.external_deps = parsed.external_deps || [];

  return parsed;
}

function parseSimpleYaml(content) {
  // Minimal YAML parser for skill.yaml subset: top-level scalars, nested objects,
  // arrays of objects with scalars, and arrays of bare values.
  // Does NOT support: nested objects deeper than 1 level, multi-line strings, anchors, tags
  const lines = content.split('\n');
  const result = {};
  let currentKey = null;
  let currentArray = null;
  let currentArrayItem = null;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.replace(/\r$/, '');
    if (line.trim() === '' || line.trim().startsWith('#')) continue;

    // Top-level scalar or key with empty value: key: value
    const scalarMatch = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (scalarMatch && !line.startsWith(' ') && !line.startsWith('\t')) {
      currentKey = scalarMatch[1];
      const val = scalarMatch[2].trim();
      if (val === '') {
        // Peek at the next non-blank line to determine if this is an array or a nested object
        let peekIdx = i + 1;
        while (peekIdx < lines.length && lines[peekIdx].replace(/\r$/, '').trim() === '') {
          peekIdx++;
        }
        const nextLine = peekIdx < lines.length ? lines[peekIdx].replace(/\r$/, '') : '';
        if (/^\s+- /.test(nextLine)) {
          // Array of items (e.g., provides, requires, external_deps)
          result[currentKey] = [];
          currentArray = result[currentKey];
          currentArrayItem = null;
        } else if (/^\s+\w[\w-]*:/.test(nextLine)) {
          // Nested object (e.g., runtime)
          result[currentKey] = {};
          currentArray = null;
          currentArrayItem = null;
        } else {
          // Default to empty array for backward compatibility
          result[currentKey] = [];
          currentArray = result[currentKey];
          currentArrayItem = null;
        }
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

    // Continuation of array item:     key: value (4+ spaces)
    const arrayFieldMatch = line.match(/^\s{4,}(\w[\w-]*):\s*(.*)$/);
    if (arrayFieldMatch && currentArrayItem !== null) {
      const k = arrayFieldMatch[1];
      const v = arrayFieldMatch[2].trim().replace(/^["'](.+)["']$/, '$1');
      currentArrayItem[k] = v;
      continue;
    }

    // Nested object field:   key: value (2 spaces, no dash)
    const nestedFieldMatch = line.match(/^  (\w[\w-]*):\s*(.*)$/);
    if (
      nestedFieldMatch &&
      currentKey &&
      result[currentKey] &&
      typeof result[currentKey] === 'object' &&
      !Array.isArray(result[currentKey])
    ) {
      const k = nestedFieldMatch[1];
      const v = nestedFieldMatch[2].trim().replace(/^["'](.+)["']$/, '$1');
      result[currentKey][k] = v;
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
  try {
    return parseSkillYaml(fs.readFileSync(yamlPath, 'utf-8'));
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

module.exports = { parseSkillYaml, readSkillYaml };
