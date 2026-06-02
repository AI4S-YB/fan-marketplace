'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { execSync } = require('node:child_process');
const { fanDir, addInstalledSkill, removeInstalledSkill } = require('./config.js');

function installSkill(home, skillInfo) {
  return new Promise((resolve) => {
    const skillDir = path.join(fanDir(home), 'skills', skillInfo.id);

    const dist = skillInfo.distribution;
    if (!dist || dist.type !== 'git') {
      resolve({ success: false, error: `Unsupported distribution type: ${dist ? dist.type : 'unknown'}` });
      return;
    }

    // Pre-flight: check git is available
    try {
      execSync('git --version', { stdio: 'pipe', timeout: 5000 });
    } catch (e) {
      resolve({ success: false, error: 'Git is not available. Please install git and try again.' });
      return;
    }

    // If a directory already exists from a previous (possibly broken) install,
    // remove it now. The caller should have already verified this is a fresh install.
    if (fs.existsSync(skillDir)) {
      try {
        fs.rmSync(skillDir, { recursive: true, force: true });
      } catch (e) {
        resolve({ success: false, error: `Cannot remove existing directory at ${skillDir}: ${e.message}` });
        return;
      }
    }

    // Remove any stale metadata record (best-effort)
    try {
      removeInstalledSkill(home, skillInfo.id);
    } catch (e) {
      // Ignore — metadata may not exist
    }

    try {
      const args = ['clone', '--depth', '1'];
      if (dist.tag) {
        args.push('--branch', dist.tag);
      }
      args.push(dist.url, skillDir);

      execSync('git ' + args.join(' '), {
        stdio: 'pipe',
        timeout: 60000,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '' }
      });

      // Verify the clone produced something usable
      if (!fs.existsSync(skillDir) || fs.readdirSync(skillDir).length === 0) {
        resolve({ success: false, error: `Clone completed but directory is empty: ${skillDir}` });
        return;
      }

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

      // Sync to Claude Code (best-effort, after install succeeds)
      const syncResult = syncToClaudeCode(home, skillInfo.id);
      if (!syncResult.synced && syncResult.reason) {
        console.log(`Note: Skill installed but not synced to Claude Code: ${syncResult.reason}`);
      }
    } catch (e) {
      // Clean up failed clone
      if (fs.existsSync(skillDir)) {
        try { fs.rmSync(skillDir, { recursive: true, force: true }); } catch (_) {}
      }
      try { removeInstalledSkill(home, skillInfo.id); } catch (_) {}

      // Provide actionable error messages based on failure type
      const stderr = e.stderr ? e.stderr.toString().trim() : '';
      let errorMsg;
      if (e.code === 'ETIMEDOUT' || stderr.includes('timeout') || stderr.includes('timed out')) {
        errorMsg = `Git clone timed out after 60s. Check your network connection to ${dist.url}.`;
      } else if (stderr.includes('Could not resolve host') || stderr.includes('unable to access') || stderr.includes('Failed to connect')) {
        errorMsg = `Network error: cannot reach ${dist.url}. Check your internet connection.`;
      } else if (stderr.includes('Permission denied') || stderr.includes('could not read')) {
        errorMsg = `Permission denied cloning from ${dist.url}. The repository may be private or require authentication.`;
      } else if (stderr.includes('not found') || stderr.includes('does not exist') || stderr.includes('repository not found')) {
        errorMsg = `Repository not found at ${dist.url}. The skill source may have moved or been deleted.`;
      } else if (stderr) {
        errorMsg = `Git clone failed: ${stderr}`;
      } else {
        errorMsg = `Installation failed: ${e.message || 'unknown error'}`;
      }
      resolve({ success: false, error: errorMsg });
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
    return { success: false, error: `Skill '${skillId}' is not installed. Run \`fan install ${skillId}\` first.` };
  }
  try {
    execSync('git pull --ff-only', {
      cwd: skillDir,
      stdio: 'pipe',
      timeout: 60000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '' }
    });

    // Refresh metadata from updated skill.yaml
    const versionInfo = refreshInstalledMetadata(home, skillId);

    // Re-sync to Claude Code (best-effort)
    const syncResult = syncToClaudeCode(home, skillId);
    if (!syncResult.synced && syncResult.reason) {
      console.log(`Note: Skill updated but not synced to Claude Code: ${syncResult.reason}`);
    }

    return {
      success: true,
      previousVersion: versionInfo.previousVersion,
      version: versionInfo.newVersion
    };
  } catch (e) {
    const stderr = e.stderr ? e.stderr.toString().trim() : '';
    let errorMsg;
    if (e.code === 'ETIMEDOUT' || stderr.includes('timed out')) {
      errorMsg = `Git pull timed out. Check your network connection.`;
    } else if (stderr.includes('Could not resolve host') || stderr.includes('unable to access')) {
      errorMsg = `Network error: cannot reach remote. Check your internet connection.`;
    } else if (stderr) {
      errorMsg = `Git pull failed: ${stderr}`;
    } else {
      errorMsg = `Update failed: ${e.message || 'unknown error'}`;
    }
    return { success: false, error: errorMsg };
  }
}

function syncToClaudeCode(home, skillId) {
  const homeDir = require('node:os').homedir();
  const claudeSkillsDir = path.join(homeDir, '.claude', 'skills');
  const linkPath = path.join(claudeSkillsDir, skillId);
  const fanSkillDir = path.join(fanDir(home), 'skills', skillId);

  // If Claude Code is not installed, skip silently
  if (!fs.existsSync(path.join(homeDir, '.claude'))) {
    return { synced: false, reason: 'Claude Code not detected' };
  }

  try {
    fs.mkdirSync(claudeSkillsDir, { recursive: true });

    // If a non-symlink already exists, leave it alone
    if (fs.existsSync(linkPath)) {
      const stat = fs.lstatSync(linkPath);
      if (!stat.isSymbolicLink()) {
        return { synced: false, reason: `~/.claude/skills/${skillId} already exists as a directory (not a symlink)` };
      }
      fs.rmSync(linkPath);
    }

    fs.symlinkSync(fanSkillDir, linkPath);
    return { synced: true };
  } catch (e) {
    return { synced: false, reason: e.message };
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
