# FAN Marketplace

AI Skill registry and CLI for agricultural bioinformatics. Discover, install, and share modular AI coding agent skills.

## Quick Start

```bash
# Install fan-cli
npm install -g https://github.com/AI4S-YB/fan-marketplace.git

# Search and install skills
fan search "plant"
fan install fan-skill

# See what's installed
fan list
fan capabilities
```

## Documentation

Full installation guide, configuration examples (DeepSeek, GLM), and skill authoring tutorial:

**[ai4s-yb.github.io/fan-marketplace](https://ai4s-yb.github.io/fan-marketplace/)**

## Create a Skill

Write a `skill.yaml` and `SKILL.md`, push to GitHub, then add your repo URL to `registry-list.json`. The index auto-builds from your `skill.yaml` — no JSON to maintain.

See the **[Contribute tab](https://ai4s-yb.github.io/fan-marketplace/)** for templates and the vibe-coding prompt.

## Repository Structure

```
fan-marketplace/
├── index.html              # GitHub Pages (Marketplace web UI)
├── index.json              # Auto-generated skill registry
├── registry-list.json      # Source of truth — one URL per skill
├── scripts/build-index.js  # Builds index.json from skill.yaml files
├── src/                    # fan-cli source
│   ├── cli.js              # CLI commands
│   ├── config.js           # ~/.fan/ state management
│   ├── registry.js         # Registry fetch & search
│   ├── installer.js        # Git clone & Claude Code sync
│   ├── skill-yaml.js       # skill.yaml parser
│   └── capability.js       # Cross-skill invoke
├── test/                   # Test suite (41 tests)
└── schema/                 # skill.yaml JSON Schema
```

## Commands

```
fan search [query]             Search skills
fan info <skill-id>            Show skill details
fan install <skill-id>         Install a skill
fan list                       List installed skills
fan remove <skill-id>          Uninstall a skill
fan update [skill-id]          Update skills
fan capabilities               List all available capabilities
fan which <capability>         Find which skill provides a capability
fan invoke <skill> <cap>       Invoke a capability
fan registry add|list          Manage registries
```

## License

MIT
