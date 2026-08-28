# NixOS System Binary Directory Structure

**Date:** 2026-08-28
**Research Context:** Foundational research for understanding where NixOS installs system binaries

## Overview

NixOS uses a unique filesystem layout that deviates from the traditional Unix Filesystem Hierarchy Standard (FHS). Instead of using paths like `/usr/bin` or `/bin`, NixOS provides system binaries through a sophisticated symlink structure that enables package isolation, reproducibility, and atomic upgrades.

## Primary System Binary Location

### `/run/current-system/sw/bin/`

This is the standard location where NixOS exposes system-wide binaries to users.

- **Purpose:** Provides symlinks to all executables from packages declared in `environment.systemPackages`
- **Meaning of 'sw':** Stands for "software" - a convention for aggregated user-facing packages
- **Automatic PATH inclusion:** This directory is automatically added to every user's `PATH` environment variable
- **Symlink targets:** Individual binaries are symlinks to package derivations in `/nix/store`

## Directory Structure and Symlink Chain

The NixOS binary system follows a hierarchical symlink structure:

```
/run/current-system/sw/bin/
  → points to current system profile generation
  → /nix/var/nix/profiles/system
  → /nix/store/<hash>-system-path/
  → individual package binaries in /nix/store/<hash>-<name>-<version>/bin/
```

### Structure Breakdown:

1. **`/run/current-system`** - Symlink to the active system profile generation
2. **`/nix/var/nix/profiles/system`** - System profile location containing all generations
3. **`/nix/store/<hash>-system-path/`** - The current system derivation
4. **`/sw/` directory** - Contains standard Unix-like subdirectories:
   - `/sw/bin` - Executable binaries
   - `/sw/lib` - Libraries
   - `/sw/share` - Shared resources
   - `/sw/etc` - Configuration files

## Other Common Binary Paths

### System-Level Paths

- **System profile:** `/nix/var/nix/profiles/system`
- **System generations:** `/nix/var/nix/profiles/system-*-link` (where `*` is the generation number)

### User-Level Paths

- **User profile base:** `/nix/var/nix/profiles/per-user/$username/profile`
- **User home symlink:** `~/.nix-profile` → points to user's current profile
- **Individual packages:** `/nix/store/<hash>-<name>-<version>/bin/`

## Why NixOS Deviates from FHS

### Design Rationale

1. **Package Isolation:** Traditional paths like `/usr/bin` would couple packages to system state
2. **Reproducibility:** Each package has a unique path based on its content hash
3. **Atomic Upgrades:** System configuration changes are applied atomically via symlink updates
4. **No Traditional Paths:** No guarantee binaries will be at `/bin/bash`, `/usr/bin/ls`, etc.

### How Rebuilds Work

When you run `nixos-rebuild`:

1. Build a new system configuration derivation in `/nix/store`
2. Aggregate all `environment.systemPackages` into the `/sw` directory
3. Create a new generation in the system profile
4. Atomically update the `/run/current-system` symlink

## Important Usage Notes

### DO:

- **Use PATH for binaries:** Access binaries through your PATH, not absolute store paths
- **Use Nix code helpers:** In Nix expressions, use `lib.getExe pkgs.package` to find binary paths dynamically
- **Trust the symlink structure:** Rely on `/run/current-system/sw/bin` for system binaries

### DON'T:

- **Hardcode store paths:** Avoid `/nix/store/...` paths in configuration files like `~/.bashrc`
- **Assume traditional paths:** Don't expect binaries at `/bin/bash`, `/usr/bin/ls`, etc.
- **Create symlink chains:** The Nix store cannot contain symlink components (prevents "impure" builds)

## Sources

- [Why doesn't e.g /bin link to /run/current-system/sw/bin?](https://discourse.nixos.org/t/why-doesnt-e-g-bin-link-to-run-current-system-sw-bin/1562)
- [Common Issue: accessing binaries like /bin/bash](https://discourse.nixos.org/t/common-issue-accessing-binaries-like-bin-bash/63312)
- [/run/current-system: NixOS. A beginner's look](https://xn--w5d.cc/2020/08/31/current-system-nixos.html)
- [Nix Reference Manual: Profiles](https://nix.dev/manual/nix/2.22/package-management/profiles)
- [NixOS Manual](https://nixos.org/manual/nixos/stable/)
- [Why /nix/var/nix/profiles/per-user is empty](https://discourse.nixos.org/t/why-nix-var-nix-profiles-per-user-is-empty/58095)
- [NixOS Wiki: User Environment](https://nixos.wiki/wiki/User_Environment)

## Next Steps

This research provides the foundation for understanding how NixOS manages binaries, which is essential for:
- Understanding ripgrep availability on NixOS systems
- Configuring applications to find system binaries correctly
- Debugging PATH and binary accessibility issues on NixOS
