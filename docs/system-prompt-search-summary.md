# System Prompt Search Summary

**Date:** 2026-08-28
**Task:** Search docs/ for system prompt references
**Status:** ✅ Complete

## Search Keywords
- `system prompt`
- `CLAUDE.md`
- `.claude/`
- `prompt file`

## Files Found

### 1. `/home/coding/mta-my-way/docs/system-prompt-tool-listing.md`
- **Content:** Describes the tool listing mechanism in the system prompt
- **Key Topics:** XML-based tool structure, JSON Schema format, tool categorization, parameter patterns
- **Relevance:** High - Directly documents system prompt structure

### 2. `/home/coding/mta-my-way/docs/system-prompt-tool-mechanism.md`
- **Content:** Explains how tools are listed, organized, and structured in the system prompt
- **Key Topics:** Tool categories, parameter schema standards, organization principles, security & permissions
- **Relevance:** High - Comprehensive system prompt documentation

### 3. `/home/coding/mta-my-way/docs/notes/system-prompt-file-locations.md`
- **Content:** Search results documenting where system prompt files are located
- **Key Topics:** Search results by location (.claude/, docs/, config files), system prompt structure
- **Relevance:** High - Dedicated search results for system prompt locations

### 4. `/home/coding/mta-my-way/docs/tool-listing-analysis.md`
- **Content:** Analysis of tool listing structure and format
- **Key Topics:** XML-based structure, tool signature format, WebSearch tool details, usage constraints
- **Relevance:** Medium - Focuses on tool structure within system prompt

### 5. `/home/coding/mta-my-way/docs/research/tool-listing-mechanism.md`
- **Content:** Technical structure analysis of tool listing mechanism
- **Key Topics:** Container format, tool schema, parameter patterns, naming conventions
- **Relevance:** Medium - Research analysis of system prompt components

## Key Findings

1. **No Traditional System Prompt File:** The system prompt is dynamically injected by the Claude Code harness, not stored as a static file.

2. **Documentation Coverage:** The docs/ directory contains extensive documentation describing system prompt structure and mechanisms.

3. **Tool Focus:** Most documentation focuses on the tool listing mechanism within the system prompt (XML structure, JSON Schema, tool categories).

4. **Main Insight:** The system prompt is composed of multiple sources:
   - Base Claude instructions
   - Tool definitions (with JSON Schema)
   - Project instructions (CLAUDE.md)
   - Session-specific context

## Total Files
**5 files** reference system prompt locations or structure in the docs/ directory.
