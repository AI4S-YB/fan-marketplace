function findCapabilityProvider(home, capabilityId) {
  const { loadInstalled, fanDir } = require('./config.js');
  const path = require('node:path');
  const installed = loadInstalled(home);
  for (const [skillId, info] of Object.entries(installed.skills)) {
    if (info.provides && info.provides.includes(capabilityId)) {
      return {
        skillId,
        version: info.version,
        skillDir: path.join(fanDir(home), 'skills', skillId)
      };
    }
  }
  return null;
}

function listAllCapabilities(home) {
  const { loadInstalled } = require('./config.js');
  const installed = loadInstalled(home);
  const result = [];
  for (const [skillId, info] of Object.entries(installed.skills)) {
    for (const capId of (info.provides || [])) {
      result.push({ capabilityId: capId, skillId, version: info.version });
    }
  }
  return result;
}

function invokeCapability(home, skillId, capabilityId, args = []) {
  const path = require('node:path');
  const fs = require('node:fs');
  const { execSync } = require('node:child_process');
  const { loadInstalled, fanDir } = require('./config.js');
  const { readSkillYaml } = require('./skill-yaml.js');

  const installed = loadInstalled(home);
  if (!installed.skills[skillId]) {
    throw new Error(`Skill '${skillId}' is not installed. Run: fan install ${skillId}`);
  }

  const skillDir = path.join(fanDir(home), 'skills', skillId);
  const yaml = readSkillYaml(skillDir);
  if (!yaml) {
    throw new Error(`No skill.yaml found in ${skillDir}`);
  }

  const cap = (yaml.provides || []).find(p => p.id === capabilityId);
  if (!cap) {
    const available = (yaml.provides || []).map(p => p.id).join(', ') || 'none';
    throw new Error(`Capability '${capabilityId}' not found. ${skillId} provides: ${available}`);
  }

  if (!cap.run) {
    // No run command — output SKILL.md for AI agent context
    const skillMd = path.join(skillDir, 'SKILL.md');
    if (fs.existsSync(skillMd)) {
      process.stdout.write(fs.readFileSync(skillMd, 'utf-8'));
    } else {
      console.log(`Capability '${capabilityId}' provides no executable command.`);
      console.log(`It is meant to be used as AI agent context from ${skillDir}.`);
    }
    return;
  }

  // Execute the run command
  const cmd = cap.run + (args.length > 0 ? ' ' + args.join(' ') : '');
  try {
    execSync(cmd, { stdio: 'inherit', timeout: 300000 });
  } catch (e) {
    const stderr = e.stderr ? e.stderr.toString() : e.message;
    throw new Error(`Command failed: ${cmd}\n${stderr}`);
  }
}

module.exports = { findCapabilityProvider, listAllCapabilities, invokeCapability };
