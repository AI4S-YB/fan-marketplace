# Fan-Marketplace Design Spec

## Overview

一个通用的 AI Skill 分发平台。用户通过 CLI 搜索、安装、管理 Skill，Skill 之间可以声明依赖和自动发现调用。fan-skill 是平台的核心锚点 Skill。

## Architecture

```
                         ┌──────────────────────────────────────┐
                         │           用户界面层                  │
                         │                                      │
                         │  ┌──────────┐  ┌──────────────┐     │
                         │  │ fan CLI  │  │  Web (可选)   │     │
                         │  │ search/  │  │  浏览/搜索    │     │
                         │  │ install/ │  │              │     │
                         │  │ run      │  │              │     │
                         │  └────┬─────┘  └──────┬───────┘     │
                         │       │                │             │
                         └───────┼────────────────┼─────────────┘
                                 │                │
                         ┌───────▼────────────────▼─────────────┐
                         │       Skill Registry (GitHub)         │
                         │                                      │
                         │  ┌─────────────────────────────────┐ │
                         │  │ index.json  — 所有 Skill 索引    │ │
                         │  │ packages/   — Skill tarball     │ │
                         │  └─────────────────────────────────┘ │
                         └──────────────────────────────────────┘
                                 │
                         ┌───────▼──────────────────────────────┐
                         │         Skill Runtime                 │
                         │                                      │
                         │  ┌────────────┐  ┌─────────────────┐ │
                         │  │ Dependency │  │ Skill Invoker   │ │
                         │  │ Resolver   │  │ 跨 Skill 调用    │ │
                         │  └────────────┘  └─────────────────┘ │
                         └──────────────────────────────────────┘
                                 │
                         ┌───────▼──────────────────────────────┐
                         │      ~/.fan/ 本地安装目录             │
                         │                                      │
                         │  registry.json    — registry 列表    │
                         │  installed.json   — 已安装 Skill     │
                         │  skills/          — Skill 包         │
                         │  bin/             — 暴露的 CLI       │
                         └──────────────────────────────────────┘
```

## Repository Structure

两个独立仓库：

- `fan-skill` — Skill 本身，专注植物生信分析
- `fan-marketplace` — Registry + index + Web，管理 Skill 发现和分发

每个第三方 Skill 作者维护自己的仓库。向 marketplace 注册只需在 index.json 加一条 entry。

## Skill Packaging Spec (`skill.yaml`)

每个 Skill 仓库根目录放一个 `skill.yaml`：

```yaml
name: ncbi-downloader          # 唯一标识符
version: 1.2.0
display_name: "NCBI Data Downloader"
description: "从 NCBI 搜索并下载序列、基因组注释、SRA 数据"
author: community-user
license: MIT
homepage: https://github.com/xxx/ncbi-downloader

runtime:
  type: skill                  # skill | tool | data
  min_fan_version: "1.0.0"

provides:                      # 暴露给其他 Skill 的能力
  - id: search-ncbi
    description: 搜索 NCBI 数据库
    input:
      database: string
      query: string
      max_results: int
    output:
      id_list: [string]

  - id: download-sequences
    description: 下载 FASTA 序列
    input:
      accessions: [string]
      format: string
    output:
      files: [path]

requires: []                   # 依赖的其他 Skill 能力

external_deps:                 # 外部工具依赖
  - name: sra-toolkit
    install_hint: "conda install -c bioconda sra-toolkit"
    required: false

layout: standard
```

### 关键字段

| 字段 | 说明 |
|---|---|
| `name` | 唯一标识符，全平台不可重复 |
| `provides` | 声明能力接口，是跨 Skill 协作的契约 |
| `requires` | 声明依赖的能力 ID，安装时自动解析 |
| `external_deps` | 非 Skill 依赖（系统工具），安装时提示 |

## Registry (`index.json`)

托管在 `fan-marketplace` 仓库：

```json
{
  "registry": {
    "name": "fan-marketplace",
    "version": "1.0.0",
    "updated": "2026-05-26T12:00:00Z"
  },
  "skills": [
    {
      "id": "fan-skill",
      "display_name": "Fan-Skill: Plant Bioinformatics Engine",
      "description": "AI-powered plant bioinformatics and breeding analysis...",
      "author": "AI4S-YB",
      "version": "2.3.0",
      "homepage": "https://github.com/AI4S-YB/fan-skill",
      "distribution": {
        "type": "git",
        "url": "https://github.com/AI4S-YB/fan-skill.git",
        "tag": "v2.3.0"
      },
      "provides": ["consult-analysis", "design-experiment", "visualize-data"],
      "requires": [],
      "keywords": ["bioinformatics", "plant", "breeding"],
      "category": "core"
    }
  ]
}
```

### 发布流程

1. 作者在自己的仓库创建 `skill.yaml`，打 git tag
2. 向 `fan-marketplace` 提 PR：在 `index.json` 加一条 entry
3. 维护者审核、合并
4. 用户即可 `fan search` 和 `fan install`

## fan CLI

```bash
# 搜索
fan search "ncbi"           # 模糊搜索
fan search                  # 列出所有

# 查看
fan info ncbi-downloader    # 详情：描述、provides/requires、版本

# 安装
fan install ncbi-downloader         # 最新版
fan install ncbi-downloader@1.2.0   # 指定版本

# 管理
fan list                    # 已安装列表
fan update                  # 更新全部
fan update ncbi-downloader  # 更新指定
fan remove ncbi-downloader  # 卸载

# Registry
fan registry add <url>      # 添加第三方 registry
fan registry list           # 查看已注册
```

## Cross-Skill Collaboration

### 安装时依赖解析

```
fan install fan-skill
  → 读取 skill.yaml requires: ["search-ncbi"]
  → 查询 index.json: search-ncbi → ncbi-downloader
  → "fan-skill 需要 ncbi-downloader，正在自动安装..."
  → 安装 ncbi-downloader
  → 写入 ~/.fan/installed.json
```

### 运行时能力发现

fan-skill 需要 NCBI 数据时：

```
查询 ~/.fan/installed.json
  → search-ncbi 由 ncbi-downloader@1.2.0 提供
  → fan invoke ncbi-downloader search-ncbi --database protein --query "..."
  → ncbi-downloader 执行并返回结果
```

如果未安装，提示用户：`该分析需要 ncbi-downloader，运行 fan install ncbi-downloader`

## Claude Code Plugin Adapter

同一条 Skill 包同时兼容 Claude Code plugin 安装方式：

- `fan install` 时自动同步到 `~/.claude/skills/`（软链接 + frontmatter 映射）
- `/plugin install` 时 fan CLI 检测新安装并处理依赖
- `~/.fan/installed.json` 作为统一的安装状态

元数据映射：

| skill.yaml | Claude Code plugin frontmatter |
|---|---|
| `name` | `name` |
| `display_name` | title |
| `description` | description |
| `provides/requires` | 由 fan CLI 处理，不映射 |

## Web Interface (Optional)

作为 AI4S-YB 组织页面的子页面，读取 registry `index.json` 渲染 Skill 列表。提供浏览、搜索、复制安装命令的功能。
