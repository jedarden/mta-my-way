# System Prompt File Location Search Results

**Date:** 2026-08-28
**Task:** Search system prompt file locations in MTA My Way codebase
**Status:** ✅ Complete

## Summary

The Claude system prompt is **not stored as a traditional file** in the MTA My Way project. It is injected dynamically by the Claude Code harness during conversation initialization.

## Search Results by Location

### 1. `.claude/` Directory
**Status:** ❌ Not found at project level

The `.claude/` directory does not exist in the project root (`/home/coding/mta-my-way/`).
- No project-specific Claude configuration found
- No local system prompt override files

### 2. `docs/` Directory
**Status:** ✅ Extensive documentation found

Multiple files documenting system prompt structure and mechanisms:

| File | Purpose |
|------|---------|
| `docs/system-prompt-tool-listing.md` | XML-based tool listing format with JSON Schema details |
| `docs/system-prompt-tool-mechanism.md` | Tool organization, categories, and security layers |
| `docs/tool-listing-analysis.md` | Tool signature format and parameter analysis |
| `docs/research/tool-listing-mechanism.md` | Technical structure analysis (2026-08-28) |

### 3. Configuration Files
**Status:** ⚠️ Only standard project config

Files found:
- `.needle.yaml` - NEEDLE fleet configuration (not system prompt related)
- `node_modules/es-abstract/.claude/settings.local.json` - Third-party dependency config
- No `.claude/settings.json` or `.claude/settings.local.json` at project root

### 4. Project Root Markdown Files
**Status:** ✅ Comprehensive report found

- `SYSTEM_PROMPT_LOCATION_REPORT.md` - Full investigation report dated 2026-08-28
  - Documents that system prompt is dynamically injected
  - Lists all tool definitions (~30 tools)
  - Confirms read access through conversation context

## System Prompt Structure (from documentation)

### Tool Listing Format
```xml
<tools>
<function>
{
  "type": "function",
  "function": {
    "description": "...",
    "name": "tool_name",
    "parameters": {
      "$schema": "https://json-schema.org/draft-2020-12/schema",
      "type": "object",
      "properties": { ... },
      "required": [ ... ],
      "additionalProperties": false
    }
  }
}
</function>
...
</tools>
```

### Tool Categories (~30 total tools)
- **File Operations:** Read, Write, Edit, NotebookEdit
- **Development Tools:** Bash, LSP, Skill
- **Agent Management:** Agent, ListAgents, SendMessage
- **Task Management:** TaskCreate, TaskGet, TaskList, TaskUpdate, TaskOutput, TaskStop
- **Web Operations:** WebSearch, WebFetch
- **Scheduling:** CronCreate, CronDelete, CronList, ScheduleWakeup
- **Git Worktrees:** EnterWorktree, ExitWorktree
- **MCP Tools:** mcp__4_5v_mcp__analyze_image, mcp__web_reader__webReader

### Additional System Prompt Contents
1. **Agent Instructions**
   - Coding environment rules (from CLAUDE.md)
   - Hard prohibitions (GitHub Actions, Jobs, force-push, etc.)
   - Workflow guidelines
   - Security and permission boundaries

2. **Session-Specific Context**
   - Project instructions (CLAUDE.md, AGENTS.md)
   - Memory system details
   - Environment configuration
   - Git status and repository info

## Key Finding

**The system prompt is NOT a file you can locate and read directly.** It is:

1. **Generated dynamically** by the Claude Code harness
2. **Injected into conversations** during initialization
3. **Accessible only through conversation context** (as seen in `<system-reminder>` blocks)
4. **Composed of multiple sources:**
   - Base Claude instructions
   - Tool definitions (with JSON Schema)
   - Project instructions (CLAUDE.md)
   - Session-specific context (git status, environment, etc.)

## Deliverable

### Potential System Prompt File Locations
**Result:** No traditional file-based system prompt found

### Alternative Access Points
1. **Conversation Context:** `<system-reminder>` blocks in transcript
2. **Documentation Files:**
   - `/home/coding/mta-my-way/SYSTEM_PROMPT_LOCATION_REPORT.md`
   - `/home/coding/mta-my-way/docs/system-prompt-tool-listing.md`
   - `/home/coding/mta-my-way/docs/system-prompt-tool-mechanism.md`
   - `/home/coding/mta-my-way/docs/tool-listing-analysis.md`
   - `/home/coding/mta-my-way/docs/research/tool-listing-mechanism.md`

### Configuration Files Checked
- Project root `.claude/` - ❌ Does not exist
- `docs/` directory - ✅ Contains descriptive documentation
- Configuration files (`.needle.yaml`, etc.) - ⚠️ Not system prompt related

## Conclusion

The system prompt cannot be located as a traditional file because it is dynamically constructed by the Claude Code harness at runtime. The project contains extensive documentation describing its structure, but the actual system prompt content exists only in memory during conversation execution.

To understand the system prompt structure, refer to the documentation files listed above or inspect the `<system-reminder>` blocks in conversation transcripts.
