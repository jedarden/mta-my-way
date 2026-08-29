# Tool Listing Structure Analysis

## Tool Listing Mechanism in System Prompt

The system prompt uses an XML-based structure for listing available tools:

```xml
<tools>
<function>
<function>...</function>
<function>...</function>
...
</tools>
```

Each tool is wrapped in a `<function>` tag with an explicit closing tag.

## Tool Signature Format

Every tool follows this structure:

1. **`name`** (string): The function name used in tool calls
2. **`description`** (string): Detailed description of what the tool does
3. **`parameters`** (JSON Schema object):
   - `$schema`: JSON Schema version URL
   - `type`: Always `"object"`
   - `properties`: Object containing parameter definitions
   - `required`: Array of required parameter names
   - `additionalProperties`: Always `false` (no extra properties allowed)

Each parameter within `properties` has:
- `description`: Parameter purpose
- `type`: Data type (string, boolean, integer, array, object)
- Constraints: `minLength`, `maxLength`, `minimum`, `maximum`, `enum`, etc.

## WebSearch Tool Information

**Tool Name:** `WebSearch`

**Description:** "Search the web. Returns result blocks with titles and URLs. US-only."

**Parameters:**
- `query` (required, string, minLength: 2): The search query
- `allowed_domains` (optional, array of strings): Filter to only include results from these domains
- `blocked_domains` (optional, array of strings): Never include search results from these domains

**Constraints:**
- All parameters use the strict type validation
- Domain filtering is optional but must be array of strings if provided

**Notes:**
- US-only availability (geographic restriction)
- Returns structured result blocks with titles and URLs
- Current date context: August 2026

## Tool Usage Constraints

From the system prompt analysis:

1. **Required parameters must be provided** - Tool calls fail without required params
2. **No extra properties allowed** - `additionalProperties: false` enforced
3. **Type validation is strict** - String lengths, number ranges, enum values enforced
4. **Permission boundaries** - Some tools have permission prompts (file writes, cluster operations)
5. **Tool-specific rules** - Some tools have usage conditions (e.g., EnterWorktree requires explicit mention)

## Key Observations

- The tool listing uses XML rather than JSON for the overall structure
- Individual tool parameters use JSON Schema for validation
- The system includes detailed descriptions and usage examples in the system prompt
- Some tools have special authorization requirements (notably for cluster operations, OpenBao access)
- Error handling includes specific guidance for common failure modes
