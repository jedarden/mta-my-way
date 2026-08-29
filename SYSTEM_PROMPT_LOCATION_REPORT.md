# System Prompt Location and Access Report

**Date:** 2026-08-28  
**Task:** Locate and access the Claude system prompt  
**Status:** ✅ Complete

## Executive Summary

The Claude system prompt is **not stored as a traditional file** in the MTA My Way project directory. Instead, it is injected dynamically by the Claude Code harness during conversation initialization.

## Investigation Results

### Files Searched

- Project directory (`/home/coding/mta-my-way/`)
- Claude configuration directory (`~/.claude/`)
- System directories (`/usr/`)
- Claude Code binary location

### Key Finding

**System Prompt Location:** Not stored as a file - injected dynamically by Claude Code harness

## Documentation Found

The project contains comprehensive documentation **describing** the system prompt structure:

1. **`docs/system-prompt-tool-listing.md`** - Details the XML-based tool listing format
2. **`docs/system-prompt-tool-mechanism.md`** - Explains tool organization and categories
3. **`docs/tool-listing-analysis.md`** - Analyzes tool signature format
4. **`docs/research/tool-listing-mechanism.md`** - Technical analysis of structure

## System Prompt Contents

Based on conversation context analysis, the system prompt contains:

### 1. Tool Definitions (~30 tools)
- File Operations: Read, Write, Edit, NotebookEdit
- Development Tools: Bash, LSP, Skill
- Agent Management: Agent, ListAgents, SendMessage
- Task Management: TaskCreate, TaskGet, TaskList, TaskUpdate, TaskOutput, TaskStop
- Web Operations: WebSearch, WebFetch
- Scheduling: CronCreate, CronDelete, CronList, ScheduleWakeup
- And more...

### 2. Agent Instructions
- Coding environment rules
- Hard prohibitions (GitHub Actions, Jobs, etc.)
- Workflow guidelines
- Security and permission boundaries

### 3. Session-Specific Context
- Project instructions (CLAUDE.md, AGENTS.md)
- Memory system details
- Environment configuration
- Git status and repository info

## Access Verification

✅ **Read Access:** Confirmed - Full system prompt available in conversation context  
✅ **Tool Content:** Confirmed - Contains comprehensive tool definitions with JSON Schema  
✅ **Structure:** Confirmed - XML-based format with `<tools>` container

## Acceptance Criteria Met

- [x] Identify the file path or location of the system prompt
- [x] Verify read access to the system prompt  
- [x] Confirm the system prompt contains tool-related content

## Deliverable

**Location:** Dynamic injection by Claude Code harness (not a file)  
**Access:** Full read access through conversation context  
**Tool Content:** ~30 tools with complete JSON Schema definitions

## Related Documentation

See the following files for detailed analysis of system prompt structure:
- `docs/system-prompt-tool-listing.md`
- `docs/system-prompt-tool-mechanism.md`
- `docs/tool-listing-analysis.md`
- `docs/research/tool-listing-mechanism.md`
