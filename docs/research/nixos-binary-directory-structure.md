# NixOS System Binary Directory Structure

Research findings on where NixOS installs system binaries and how the paths are organized.

## Primary Binary Paths

### `/run/current-system/sw/bin` (Runtime Path)

- **Purpose**: Runtime symlink to the current system generation's binaries
- **Created**: At boot time
- **Stability**: More stable and always available at runtime
- **Recommended for**: Scripts and PATH configuration
- **Structure**: The `sw` stands for "software" and contains user-space binaries

### `/nix/var/nix/profiles/system/sw/bin` (System Profile Path)

- **Purpose**: System profile that tracks system-wide package generations
- **Created**: Each time you run `nixos-rebuild switch`
- **Management**: The `system` symlink always points to the current generation
- **Older generations**: Stored as `system-N-link` (e.g., `system-29-link`, `system-30-link`)
- **List generations**: `sudo nix-env -p /nix/var/nix/profiles/system --list-generations`

## Directory Structure Chain

```
/run/current-system → /nix/var/nix/profiles/system → /nix/store/[hash]-system
```

The relationship:
1. `/run/current-system` symlinks to the current system generation in `/nix/store`
2. `/nix/var/nix/profiles/system` is the profile tracking which generation is "current"
3. Both ultimately point to the same location in the Nix store

## The "sw" Directory Contents

The `sw` (software) subdirectory contains:
- **`bin/`** - Executable binaries
- **`share/`** - Shared files (man pages, bash completions, etc.)
- **`lib/`** - Libraries
- Other standard software directories

## Traditional Linux Path Equivalents

| Traditional Linux | NixOS |
|-------------------|-------|
| `/usr/bin` | `/run/current-system/sw/bin` or `/nix/var/nix/profiles/system/sw/bin` |
| `/usr/local/bin` | (Not used - same paths apply) |

## Key Design Principles

1. **Atomic Upgrades**: Each generation is completely self-contained
2. **Rollback Capability**: Can switch between generations instantly
3. **Symlink-based**: Uses symlinks to point to actual store paths in `/nix/store/`
4. **Declarative**: The system configuration determines what appears in these paths

## Sources

- [Why doesn't e.g /bin link to /run/current-system/sw/bin? - NixOS Discourse](https://discourse.nixos.org/t/why-doesnt-e-g-bin-link-to-run-current-system-sw-bin/1562)
- [Common Issue: accessing binaries like /bin/bash - NixOS Discourse](https://discourse.nixos.org/t/common-issue-accessing-binaries-like-bin-bash/63312)
- [/run/current-system: NixOS. A beginner's look](https://xn--w5d.cc/2020/08/31/current-system-nixos.html)
- [How to add stuff to `/run/current-system/sw`? - NixOS Discourse](https://discourse.nixos.org/t/how-to-add-stuff-to-run-current-system-sw-nix-store-isnt-safe/1331)
- [Why does Nix link out to /run/current-system/sw/ instead of /usr - Reddit](https://www.reddit.com/r/NixOS/comments/1gke8qe/why_does_nix_link_out-to-runcurrentsystemsw/)
