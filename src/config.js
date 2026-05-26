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
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (e) {
    console.warn(`Warning: corrupted ${file}, resetting to default`);
    return { skills: {} };
  }
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
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (e) {
    console.warn(`Warning: corrupted ${file}, resetting to default`);
    return [{ name: 'fan-marketplace', url: DEFAULT_REGISTRY_URL }];
  }
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
