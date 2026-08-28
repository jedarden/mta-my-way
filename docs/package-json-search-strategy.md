# package.json Search Strategy

## Project Context

**Project**: MTA My Way
**Type**: TypeScript Monorepo
**Root Directory**: `/home/coding/mta-my-way`
**Repository Type**: Git (Forgejo primary, GitHub mirror)

## Discovered package.json Files

The following package.json files are tracked in the repository:

1. `./package.json` - Root package configuration
2. `./packages/server/package.json` - Backend Hono/Node.js server
3. `./packages/shared/package.json` - Shared utilities/types
4. `./packages/web/package.json` - Frontend React + Vite application
5. `./tests/e2e/package.json` - End-to-end test configuration

## Search Methods

### Method 1: find (Recommended for comprehensive search)

**Command**:
```bash
find . -name "package.json" -type f -not -path "*/node_modules/*" | sort
```

**Pros**:
- Finds all files regardless of git tracking status
- Excludes node_modules noise
- Works on any filesystem
- Portable across Unix-like systems

**Cons**:
- May include untracked files
- Can be slow on very large codebases (not an issue here)

**When to use**: When you need to find ALL package.json files, including untracked ones

### Method 2: git ls-files (Recommended for git-tracked files only)

**Command**:
```bash
git ls-files | grep -E "package\.json$" | sort
```

**Pros**:
- Only returns git-tracked files
- Fast for large repositories
- Git-native approach
- Clean output

**Cons**:
- Misses untracked files
- Requires git repository

**When to use**: When you only care about tracked project files (most common case)

### Method 3: locate (Not recommended)

**Command**:
```bash
locate package.json | grep -E "^/home/coding/mta-my-way" | grep -v node_modules
```

**Pros**:
- Very fast (uses database)
- Good for system-wide searches

**Cons**:
- Requires updatedb to be current
- Not repository-aware
- More complex filtering needed
- Not portable across environments

**When to use**: Rarely - only for system-wide package.json discovery

## Recommended Approach

For MTA My Way project work, use **git ls-files** as the primary method:

```bash
# Get all tracked package.json files
git ls-files | grep -E "package\.json$"
```

This returns exactly the 5 project files you need, without node_modules noise.

## Verification

Verified on 2026-08-28:

```bash
$ git ls-files | grep -E "package\.json$"
package.json
packages/server/package.json
packages/shared/package.json
packages/web/package.json
tests/e2e/package.json
```

**Result**: 5 package.json files identified, matching expected monorepo structure.

## Usage Examples

### Get list of all package.json files:
```bash
git ls-files | grep -E "package\.json$"
```

### Count package.json files:
```bash
git ls-files | grep -E "package\.json$" | wc -l
```

### Search for specific dependency across all package.json files:
```bash
git ls-files | grep -E "package\.json$" | xargs grep -l "dependency-name"
```

### Read all package.json files:
```bash
for file in $(git ls-files | grep -E "package\.json$"); do
  echo "=== $file ==="
  cat "$file"
  echo
done
```

## Project Structure Context

```
mta-my-way/
├── package.json                    # Root package (monorepo config)
├── packages/
│   ├── server/
│   │   └── package.json            # Hono/Node.js backend
│   ├── shared/
│   │   └── package.json            # Shared utilities/types
│   └── web/
│       └── package.json            # React + Vite frontend
└── tests/
    └── e2e/
        └── package.json            # E2E test configuration
```

## Notes

- All 5 package.json files are git-tracked
- No untracked package.json files exist in the project
- The search strategy accounts for the monorepo structure with nested packages
- node_modules directories are properly excluded from search results
