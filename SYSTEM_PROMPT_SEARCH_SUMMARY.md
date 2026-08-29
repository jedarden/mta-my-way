# System Prompt File Location Search - Summary

**Date:** 2026-08-28
**Bead:** mtamyway-120aa4a3
**Status:** ✅ Complete

## Task

Search through the codebase and configuration to locate where the Claude system prompt is stored.

## Key Finding

**The Claude system prompt is NOT stored as a traditional file.**

It is injected dynamically by the Claude Code harness during conversation initialization.

## Search Results by Location

### 1. `.claude/` Directory
**Status:** ❌ Not found at project level

- No `.claude/` directory exists in `/home/coding/mta-my-way/`
- No project-specific Claude configuration
- No local system prompt override files

### 2. `docs/` Directory
**Status:** ✅ Extensive documentation found

Comprehensive documentation already exists (created 2026-08-28):

| File | Purpose |
|------|---------|
| `docs/notes/system-prompt-file-locations.md` | Complete search results and analysis |
| `docs/system-prompt-tool-listing.md` | XML-based tool listing format with JSON Schema |
| `docs/system-prompt-tool-mechanism.md` | Tool organization, categories, and security |
| `docs/tool-listing-analysis.md` | Tool signature format analysis |
| `docs/research/tool-listing-mechanism.md` | Technical structure analysis |
| `SYSTEM_PROMPT_LOCATION_REPORT.md` | Main investigation report |

### 3. Configuration Files
**Status:** ⚠️ No system prompt related configs

- `.needle.yaml` - NEEDLE fleet configuration (not system prompt related)
- No `.claude/settings.json` or `.claude/settings.local.json` at project root
- No configuration files contain system prompt content

### 4. Project Root Files
**Status:** ✅ Report found

- `SYSTEM_PROMPT_LOCATION_REPORT.md` - Full investigation report

## What the System Prompt Contains

Based on the documentation analysis, the system prompt includes:

1. **Tool Definitions (~30 tools)**
   - File Operations: Read, Write, Edit, NotebookEdit
   - Development Tools: Bash, LSP, Skill
   - Agent Management: Agent, ListAgents, SendMessage
   - Task Management: TaskCreate, TaskGet, TaskList, TaskUpdate, TaskOutput, TaskStop
   - Web Operations: WebSearch, WebFetch
   - Scheduling: CronCreate, CronDelete, CronList, ScheduleWakeup
   - Git Worktrees: EnterWorktree, ExitWorktree
   - MCP Tools: mcp__4_5v_mcp__analyze_image, mcp__web_reader__webReader

2. **Agent Instructions**
   - Coding environment rules (from CLAUDE.md)
   - Hard prohibitions (GitHub Actions, Jobs, force-push, etc.)
   - Workflow guidelines
   - Security and permission boundaries

3. **Session-Specific Context**
   - Project instructions (CLAUDE.md, AGENTS.md)
   - Memory system details
   - Environment configuration
   - Git status and repository info

## How to Access the System Prompt

Since the system prompt is dynamically injected, it is accessible only through:

1. **Conversation Context** - `<system-reminder>` blocks in the conversation transcript
2. **Documentation Files** - The comprehensive docs listed above describe its structure

## Deliverable

**Potential System Prompt File Locations:** None found (not file-based)

**Alternative Access Points:**
- `/home/coding/mta-my-way/SYSTEM_PROMPT_LOCATION_REPORT.md`
- `/home/coding/mta-my-way/docs/notes/system-prompt-file-locations.md`
- `/home/coding/mta-my-way/docs/system-prompt-tool-listing.md`
- `/home/coding/mta-my-way/docs/system-prompt-tool-mechanism.md`

## Conclusion

The system prompt cannot be located as a traditional file because it is dynamically constructed by the Claude Code harness at runtime. The project contains extensive documentation describing its structure and mechanism, but the actual system prompt content exists only in memory during conversation execution.
