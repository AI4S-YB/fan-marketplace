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

      // Verify skill.yaml exists (optional, for info)
      const yamlPath = path.join(skillDir, 'skill.yaml');
      const hasSkillYaml = fs.existsSync(yamlPath);

      // Record in installed.json
      addInstalledSkill(home, skillInfo.id, {
        version: skillInfo.version || 'unknown',
        provides: skillInfo.provides || [],
        requires: skillInfo.requires || [],
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
