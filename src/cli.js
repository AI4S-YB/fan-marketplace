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
                console.log(`Dependency '${dep.capabilityId}' -> installing ${dep.skillId}...`);
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

  // fan registry add|list
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

  // fan which <capability-id>
  program.command('which')
    .description('Find which installed skill provides a capability')
    .argument('<capability-id>', 'Capability identifier')
    .action((capabilityId) => {
      const { findCapabilityProvider } = require('./capability.js');
      const result = findCapabilityProvider(HOME, capabilityId);
      if (!result) {
        console.log(`No installed skill provides '${capabilityId}'.`);
        console.log('Run `fan capabilities` to see available capabilities.');
        return;
      }
      console.log(`${capabilityId} is provided by ${result.skillId}@${result.version}`);
      console.log(`  directory: ${result.skillDir}`);
    });

  // fan capabilities
  program.command('capabilities')
    .description('List all capabilities provided by installed skills')
    .action(() => {
      const { listAllCapabilities } = require('./capability.js');
      const capabilities = listAllCapabilities(HOME);

      if (capabilities.length === 0) {
        console.log('No capabilities available. No skills are installed.');
        console.log("Run 'fan search' to discover skills, 'fan install <id>' to install.");
        return;
      }

      console.log(`\nAvailable capabilities (${capabilities.length}):\n`);
      for (const c of capabilities) {
        console.log(`  ${c.capabilityId.padEnd(24)} ${c.skillId}@${c.version}`);
      }
      console.log('');
    });

  // fan invoke <skill-id> <capability-id> [args...]
  program.command('invoke')
    .description('Invoke a capability from an installed skill')
    .argument('<skill-id>', 'Skill identifier')
    .argument('<capability-id>', 'Capability identifier')
    .argument('[args...]', 'Additional arguments passed to the capability')
    .action((skillId, capabilityId, args) => {
      ensureFanDir(HOME);
      const { invokeCapability } = require('./capability.js');
      try {
        invokeCapability(HOME, skillId, capabilityId, args || []);
      } catch (e) {
        console.error(`Error: ${e.message}`);
        process.exit(1);
      }
    });

  program.parse(argv);
}

module.exports = { run };
