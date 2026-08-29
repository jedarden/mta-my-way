# System Prompt Files Inventory - MTA My Way docs/

**Date:** 2026-08-28
**Task:** Search docs/ for system prompt references
**Status:** ✅ Complete

## Search Summary

Searched the entire `docs/` directory for keywords: `system prompt`, `CLAUDE.md`, `.claude/`, and `prompt file`.

## Files Found with System Prompt References

### Primary Documentation (5 files)

| File | Keywords Found | Content Summary | Relevance |
|------|---------------|-----------------|-----------|
| `docs/system-prompt-search-summary.md` | `system prompt`, `CLAUDE.md`, `.claude/` | Meta-summary of search results documenting 5 files that reference system prompts | High |
| `docs/notes/system-prompt-file-locations.md` | `system prompt`, `CLAUDE.md`, `.claude/`, `prompt file` | Comprehensive search results showing system prompt is dynamically injected, not a static file | High |
| `docs/system-prompt-tool-mechanism.md` | `system prompt` | Explains tool listing, organization, categories, and security layers in system prompt | High |
| `docs/system-prompt-tool-listing.md` | `system prompt` | Details XML-based tool structure, JSON Schema format, parameter patterns | High |
| `docs/tool-listing-analysis.md` | `system prompt` | Analyzes tool listing structure, WebSearch tool details, usage constraints | Medium |

### Research Analysis (1 file)

| File | Keywords Found | Content Summary | Relevance |
|------|---------------|-----------------|-----------|
| `docs/research/tool-listing-mechanism.md` | `system prompt` | Technical structure analysis of tool listing container format and parameter schema | Medium |

## Key Finding: No Static System Prompt File

**Important:** The search confirmed that the system prompt is **NOT stored as a traditional file** in the MTA My Way project. It is:

- Dynamically injected by the Claude Code harness during conversation initialization
- Accessible only through conversation context (`<system-reminder>` blocks)
- Composed of multiple sources:
  - Base Claude instructions
  - Tool definitions (~30 tools with JSON Schema)
  - Project instructions (CLAUDE.md at repo root)
  - Session-specific context (git status, environment, etc.)

## Search Methodology

```bash
# Searched for each keyword across all markdown and text files
grep -r -i "system prompt" /home/coding/mta-my-way/docs --include="*.md" --include="*.txt" -l
grep -r "CLAUDE\.md" /home/coding/mta-my-way/docs --include="*.md" --include="*.txt" -l
grep -r "\.claude/" /home/coding/mta-my-way/docs --include="*.md" --include="*.txt" -l
grep -r -i "prompt file" /home/coding/mta-my-way/docs --include="*.md" --include="*.txt" -l
```

## Complete File List

All 6 files that reference system prompt topics in the docs/ directory:

1. `/home/coding/mta-my-way/docs/system-prompt-search-summary.md`
2. `/home/coding/mta-my-way/docs/notes/system-prompt-file-locations.md`
3. `/home/coding/mta-my-way/docs/system-prompt-tool-mechanism.md`
4. `/home/coding/mta-my-way/docs/system-prompt-tool-listing.md`
5. `/home/coding/mta-my-way/docs/tool-listing-analysis.md`
6. `/home/coding/mta-my-way/docs/research/tool-listing-mechanism.md`

## Documentation Coverage

The docs/ directory contains **extensive documentation** describing system prompt structure, despite the system prompt itself not being a static file:

- **Tool listing format:** XML-based structure with JSON Schema parameter validation
- **Tool categories:** File operations, development tools, agent management, task management, scheduling, web operations, Git worktrees, MCP tools
- **Parameter patterns:** Common validation rules, naming conventions, security layers
- **Organization principles:** Alphabetical ordering, functional grouping, consistent schema

## Additional Resources

For complete system prompt understanding, also refer to:
- `/home/coding/mta-my-way/SYSTEM_PROMPT_LOCATION_REPORT.md` (project root)
- `/home/coding/mta-my-way/CLAUDE.md` (project instructions loaded into system prompt)
- Conversation `<system-reminder>` blocks (live system prompt content)
