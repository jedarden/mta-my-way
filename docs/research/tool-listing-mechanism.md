# Tool Listing Mechanism in System Prompt

## Date
2026-08-28

## Location
The tool listing section is located in the system prompt within `<tools>...</tools>` tags.

## Structure

### Container Format
- **XML-like tags**: Tools are wrapped in `<tools>` opening and closing tags
- **Flat list**: All tools are listed sequentially without hierarchical grouping

### Individual Tool Schema
Each tool is defined as a JSON object with the following structure:

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
        "param_name": {
          "description": "Parameter description",
          "type": "string|number|boolean|array|object",
          "enum": ["possible", "values"],
          "minLength": 1,
          "maxLength": 256
        }
      },
      "required": ["param1", "param2"],
      "additionalProperties": false
    }
  }
}
```

## Key Characteristics

1. **Type Field**: Every tool has `"type": "function"`

2. **Function Object**: Contains three mandatory fields:
   - `description`: Free-form text explaining tool purpose
   - `name`: Tool identifier (kebab-case)
   - `parameters`: JSON Schema v2020-12 compliant

3. **Parameter Schema**:
   - Uses standard JSON Schema draft 2020-12
   - Defines `type`, `properties`, `required`, `additionalProperties`
   - Supports validation: `minLength`, `maxLength`, `enum`, `minimum`, `maximum`

4. **No Explicit Categorization**: Tools are not grouped by category in the listing itself. Organization appears to be implicit based on naming conventions or handled elsewhere in the system.

## Tool Name Patterns
- Tools use kebab-case naming (e.g., `web-fetch`, `web-search`, `read-file`)
- Names are descriptive of their function
- No visible namespace or prefix system for grouping

## Parameter Patterns
- Common fields: `description` (required for all params)
- Optional validation: `type`, `enum`, `minLength`, `maxLength`, `minimum`, `maximum`
- Required parameters listed in `"required"` array
- `additionalProperties: false` prevents extra parameters

## Notes
- The tool listing appears to be generated or injected into the system prompt
- No version information is visible in the tool definitions
- Tools are not marked with availability flags (all appear equally available)
