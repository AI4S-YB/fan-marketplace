'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { execSync } = require('node:child_process');
const { fanDir, addInstalledSkill, removeInstalledSkill } = require('./config.js');

function installSkill(home, skillInfo) {
  return new Promise((resolve) => {
    const skillDir = path.join(fanDir(home), 'skills', skillInfo.id);

    // Clean up any previous partial install (both directory and metadata)
    removeInstalledSkill(home, skillInfo.id);
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

      // Sync to Claude Code
      syncToClaudeCode(home, skillInfo.id);
    } catch (e) {
      // Clean up failed clone (both directory and metadata)
      if (fs.existsSync(skillDir)) {
        fs.rmSync(skillDir, { recursive: true, force: true });
      }
      removeInstalledSkill(home, skillInfo.id);
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

  // Remove from Claude Code
  unsyncFromClaudeCode(skillId);
}

function refreshInstalledMetadata(home, skillId) {
  const { loadInstalled, addInstalledSkill } = require('./config.js');
  const { readSkillYaml } = require('./skill-yaml.js');

  const installed = loadInstalled(home);
  const prev = installed.skills[skillId];
  const previousVersion = prev ? prev.version : 'unknown';

  const skillDir = path.join(fanDir(home), 'skills', skillId);
  const yaml = readSkillYaml(skillDir);

  if (yaml) {
    addInstalledSkill(home, skillId, {
      version: yaml.version || previousVersion,
      provides: (yaml.provides || []).map(p => typeof p === 'string' ? p : p.id).filter(Boolean),
      requires: yaml.requires || [],
      installed_at: new Date().toISOString(),
      source: prev ? prev.source : 'unknown',
      has_skill_yaml: true
    });
  }

  return { previousVersion, newVersion: yaml ? yaml.version : previousVersion };
}

function updateSkill(home, skillId) {
  const skillDir = path.join(fanDir(home), 'skills', skillId);
  if (!fs.existsSync(skillDir)) {
    return { success: false, error: `Skill '${skillId}' is not installed` };
  }
  try {
    execSync('git pull --ff-only', { cwd: skillDir, stdio: 'pipe', timeout: 30000 });

    // Refresh metadata from updated skill.yaml
    const versionInfo = refreshInstalledMetadata(home, skillId);

    // Re-sync to Claude Code
    syncToClaudeCode(home, skillId);

    return {
      success: true,
      previousVersion: versionInfo.previousVersion,
      version: versionInfo.newVersion
    };
  } catch (e) {
    return { success: false, error: e.stderr ? e.stderr.toString() : e.message };
  }
}

function syncToClaudeCode(home, skillId) {
  const homeDir = require('node:os').homedir();
  const claudeSkillsDir = path.join(homeDir, '.claude', 'skills');
  const linkPath = path.join(claudeSkillsDir, skillId);
  const fanSkillDir = path.join(fanDir(home), 'skills', skillId);

  // If Claude Code is not installed, skip silently
  if (!fs.existsSync(path.join(homeDir, '.claude'))) {
    return;
  }

  try {
    fs.mkdirSync(claudeSkillsDir, { recursive: true });

    // If a non-symlink already exists, leave it alone
    if (fs.existsSync(linkPath)) {
      const stat = fs.lstatSync(linkPath);
      if (!stat.isSymbolicLink()) {
        console.log(`Warning: ~/.claude/skills/${skillId} already exists (not a symlink), skipping sync.`);
        return;
      }
      fs.rmSync(linkPath);
    }

    fs.symlinkSync(fanSkillDir, linkPath);
  } catch (e) {
    // Sync is best-effort; don't fail install if it doesn't work
    console.log(`Note: Could not sync to Claude Code: ${e.message}`);
  }
}

function unsyncFromClaudeCode(skillId) {
  const homeDir = require('node:os').homedir();
  const linkPath = path.join(homeDir, '.claude', 'skills', skillId);

  try {
    if (fs.existsSync(linkPath)) {
      const stat = fs.lstatSync(linkPath);
      if (stat.isSymbolicLink()) {
        fs.rmSync(linkPath);
      }
    }
  } catch (e) {
    // Best-effort cleanup
  }
}

module.exports = { installSkill, removeSkill, updateSkill, refreshInstalledMetadata, syncToClaudeCode, unsyncFromClaudeCode };
