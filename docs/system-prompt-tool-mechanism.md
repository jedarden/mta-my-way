# Tool Listing Mechanism in System Prompt

## Overview

The Claude Code system prompt includes a comprehensive listing of available tools that agents can use during their operation. This document describes how tools are listed, organized, and structured.

## Location in System Prompt

Tools are listed in the `<tools>` section of the system prompt, appearing after the main instructions and before any task-specific context.

## Structure

### Container Format

Tools are wrapped in XML-like tags:

```xml
<tools>
<function>...</function>
<function>...</function>
...
</tools>
```

### Individual Tool Definition

Each tool follows this JSON Schema structure:

```json
{
  "type": "function",
  "function": {
    "description": "Human-readable description of what the tool does",
    "name": "tool_name",
    "parameters": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        // Parameter definitions
      },
      "required": ["required_param_names"],
      "additionalProperties": false
    }
  }
}
```

## Tool Categories

Tools are organized by functionality into several categories:

### File Operations
- **Read** - Read files from local filesystem
- **Write** - Write files, overwriting if exists
- **Edit** - Exact string replacement in files
- **NotebookEdit** - Edit Jupyter notebook cells

### Git & Version Control
- **Bash** - Execute bash commands (including git operations)
- **EnterWorktree** / **ExitWorktree** - Git worktree management

### Agent Management
- **Agent** - Launch specialized subagents
- **ListAgents** - List available agents
- **SendMessage** - Send messages to other agents

### Task Management
- **TaskCreate** - Create structured task lists
- **TaskGet** - Retrieve task details
- **TaskList** - List all tasks
- **TaskUpdate** - Update task status/metadata
- **TaskOutput** - Get background task output
- **TaskStop** - Stop running tasks

### Scheduling & Automation
- **CronCreate** - Schedule recurring tasks
- **CronDelete** - Cancel scheduled tasks
- **CronList** - List scheduled tasks
- **ScheduleWakeup** - Dynamic loop scheduling
- **Workflow** - Execute multi-agent workflows

### Language & IDE Services
- **LSP** - Language Server Protocol operations (goToDefinition, findReferences, hover, etc.)

### Web Operations
- **WebSearch** - Search the web (US-only)
- **WebFetch** - Fetch URL and analyze with AI

### Design System
- **DesignSync** - Sync design system projects with claude.ai

### Code Review & Quality
- **ReportFindings** - Report code review findings
- **Skill** - Invoke project-specific skills

### MCP (Model Context Protocol) Tools
- **mcp__4_5v_mcp__analyze_image** - Image analysis
- **mcp__web_reader__webReader** - Web content fetching

## Parameter Schema Standards

All tool parameters follow JSON Schema Draft 2020-12:

### Common Patterns

1. **String parameters**: `{"type": "string", "minLength": 1}`
2. **Enum parameters**: `{"type": "string", "enum": ["value1", "value2"]}`
3. **Optional parameters**: Not included in `required` array
4. **Boolean flags**: `{"type": "boolean", "default": false}`
5. **Integer constraints**: `{"type": "integer", "minimum": 0, "maximum": 9007199254740991}`

### Description Format

Tool descriptions include:
- Primary purpose
- Usage context
- Parameter requirements
- Behavioral notes
- Security/permission considerations

## Organization Principles

1. **Alphabetical ordering**: Tools are listed in alphabetical order by name
2. **Functional grouping**: Related tools appear near each other
3. **Consistent schema**: All tools use the same JSON Schema structure
4. **Clear constraints**: Parameter limits and requirements are explicit

## Tool Availability

### Always Available
- Core tools (Read, Write, Edit, Bash)
- File operations
- Git operations

### Conditional Availability
- **Agent tools**: Only when multi-agent orchestration is enabled
- **Workflow**: Requires explicit user opt-in or skill invocation
- **LSP**: Requires LSP server configuration for the file type

### Special Access
Some tools have additional requirements:
- **DesignSync**: Requires design-system access scope
- **WebSearch**: US-only, with domain filtering options
- **CronCreate**: Durable tasks write to `.claude/scheduled_tasks.json`

## Security & Permissions

Tools may be blocked by hooks:
- **PreToolUse hooks**: Can block calls based on content (e.g., org-rule-guard.py)
- **Permission mode**: User-selected permission mode affects tool execution
- **Hook output**: Treated as user feedback

## Usage Pattern

When an agent needs to use a tool:

1. **Identify the tool** by name and purpose
2. **Check parameters** using the schema
3. **Call the tool** with required parameters
4. **Handle the result** in subsequent actions

## Summary

The tool listing mechanism provides:
- **Comprehensive coverage**: 30+ tools for diverse operations
- **Clear structure**: Consistent JSON Schema format
- **Strong typing**: Explicit parameter constraints
- **Good organization**: Logical grouping and alphabetical ordering
- **Security layers**: Hooks and permission modes

This structure enables agents to perform complex multi-step tasks while maintaining safety and predictability.
