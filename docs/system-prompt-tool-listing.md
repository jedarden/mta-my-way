# System Prompt Tool Listing Mechanism

## Location

The tool listing is located in the **system prompt** section, immediately following the instruction:

```
For each function call, output the function name and arguments within the following XML format:
```

## Structure and Format

### Overall Structure

Tools are listed within `<tools>` XML tags:

```xml
<tools>
{"type": "function", "function": {...}}
{"type": "function", "function": {...}}
...
</tools>
```

Each tool is represented as a **JSON object** with two top-level fields:

1. **`type`** (always `"function"`) - Indicates this is a function definition
2. **`function`** (object) - Contains the tool specification

### Tool Specification Format

Each `function` object contains three fields:

```json
{
  "description": "Human-readable description of what the tool does",
  "name": "tool_name",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "properties": { ... },
    "required": [ ... ],
    "additionalProperties": false
  }
}
```

### Components

1. **`description`**: Detailed explanation of tool purpose, usage patterns, and important notes
   - Often includes when to use the tool
   - May contain warnings or constraints
   - Includes examples in some cases

2. **`name`**: The identifier used when invoking the tool (e.g., `"Bash"`, `"Read"`, `"WebSearch"`)

3. **`parameters`**: JSON Schema definition
   - `$schema`: JSON Schema version (draft 2020-12)
   - `type`: Always `"object"` for tool parameters
   - `properties`: Object defining each parameter with:
     - `description`: Parameter purpose
     - `type`: Data type (string, boolean, integer, array, object)
     - Constraints: `minLength`, `maxLength`, `minimum`, `maximum`, `pattern`, `enum`, etc.
   - `required`: Array of parameter names that must be provided
   - `additionalProperties`: Always `false` (prevents extra parameters)

## Categorization and Grouping

Tools appear to be organized in **alphabetical order** by name. Major categories include:

### File Operations
- `Read` - Read files from filesystem
- `Write` - Write files to filesystem
- `Edit` - String replacement in files
- `NotebookEdit` - Jupyter notebook cell editing

### Development Tools
- `Bash` - Execute bash commands
- `LSP` - Language Server Protocol operations
- `Skill` - Invoke project-specific skills

### Agent and Task Management
- `Agent` - Launch specialized subagents
- `TaskCreate`, `TaskGet`, `TaskList`, `TaskUpdate`, `TaskOutput`, `TaskStop` - Task management
- `SendMessage` - Cross-agent messaging
- `ListAgents` - List available agents

### External Integrations
- `WebSearch` - Web search (US-only)
- `WebFetch` - Fetch and convert URL to markdown
- `DesignSync` - Design system synchronization

### Scheduling
- `CronCreate`, `CronDelete`, `CronList` - Scheduled task management
- `ScheduleWakeup` - Loop wakeup scheduling

### Git Worktrees
- `EnterWorktree`, `ExitWorktree` - Git worktree isolation

### MCP Tools
- `mcp__4_5v_mcp__analyze_image` - Image analysis
- `mcp__web_reader__webReader` - Web content fetching

### Reporting
- `ReportFindings` - Code review findings

## Tool Naming Conventions

- **Core tools**: PascalCase (e.g., `Bash`, `Read`, `Write`)
- **MCP tools**: Prefixed with `mcp__` followed by provider and tool name (e.g., `mcp__web_reader__webReader`)
- **Compound names**: Use underscores (e.g., `CronCreate`, `TaskGet`)

## Parameter Patterns

### Common Parameter Types

- **Paths**: `file_path` (absolute path), `notebook_path` (absolute path for .ipynb files)
- **Identifiers**: `id`, `taskId`, `agentId`, `projectId`
- **Content**: `data`, `content`, `message`, `prompt`
- **Options**: Booleans and enums (e.g., `recurring`, `replace_all`, `edit_mode`)

### Validation

All parameter definitions include:
- Type constraints (string, integer, boolean, array, object)
- Range constraints (minLength, maxLength, minimum, maximum)
- Pattern constraints (regex patterns for strings)
- Enum constraints (specific allowed values)

## Key Observations

1. **No explicit categories in the listing** - Tools are listed alphabetically without group headers
2. **Function categories are emergent** - Grouping is inferred from tool names and descriptions
3. **Comprehensive documentation** - Each tool has detailed usage guidance in its description
4. **Strict validation** - JSON Schema enforces parameter types and constraints
5. **No extra properties allowed** - All tools set `additionalProperties: false`
6. **MCP namespace separation** - External tools are clearly namespaced with `mcp__` prefix

## Tool Count

Total tools listed: ~30 (varies based on session configuration)
- Core tools: ~25
- MCP tools: ~2-5 (depending on configured integrations)
