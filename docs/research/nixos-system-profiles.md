# NixOS System Profiles Research

**Bead:** mtamyway-94193af1 (Child 1 of 4: NixOS system profiles and activation scripts)
**Date:** 2026-08-28
**Research Type:** Documentation review

## Overview

This document summarizes research into the official NixOS documentation regarding system profiles, their structure, management, and role in the NixOS activation process.

## Key Documentation Sources

### Official Documentation
1. **[NixOS Manual](https://nixos.org/manual/nixos/stable/)** - Primary NixOS documentation
2. **[Nix Profiles - Nix Reference Manual](https://nix.dev/manual/nix/2.22/package-management/profiles)** - Profile architecture and user environments
3. **[nix profile Command Reference](https://releases.nixos.org/nix/nix-2.28.3/manual/command-ref/new-cli/nix3-profile.html)** - Profile management commands

### Community Resources
- **[NixOS Discourse - List and delete NixOS generations](https://discourse.nixos.org/t/list-and-delete-nixos-generations/29637)** - Generation management discussion

## What is a System Profile?

### Core Concept

A **system profile** in NixOS is a versioned collection of symlinks that points to specific system configurations in the Nix store. It serves as the foundation for:

- **Atomic upgrades** - New configurations are built completely before activation
- **Rollback capability** - Previous configurations remain available
- **Generation management** - Each rebuild creates a new generation

### Location

The primary NixOS system profile resides at:
```
/nix/var/nix/profiles/system
```

This directory contains numbered generation symlinks (e.g., `system-1-link`, `system-2-link`) and a `system` symlink pointing to the current generation.

## Profile Architecture

### Nix Store Foundation

Every package and configuration in NixOS occupies a unique location in the Nix store (`/nix/store`), identified by cryptographic hashes of all build inputs:
- Sources
- Dependencies
- Compiler flags
- Build configuration

This ensures different versions never interfere with each other.

### User Environments

Since typing full Nix store paths would be impractical, Nix creates **user environments**:

1. **Environment Structure** - Directory trees containing symlinks to activated packages
2. **Storage Location** - User environments themselves reside in the Nix store
3. **PATH Management** - Nix maintains symlinks outside the store pointing to these environments

### Profile Versioning

Profiles organize **generations** to support atomic upgrades:

```
~/.nix-profile → profile → profile-N-link → /nix/store/[hash]-profile
```

For the system profile:
```
/nix/var/nix/profiles/system → system-N-link → /nix/store/[hash]-system-[generation]
```

Each symlink serves as a root for the Nix garbage collector.

## System Profile Management

### Profile Types

| Profile Type | Location | Purpose |
|-------------|----------|---------|
| **System** | `/nix/var/nix/profiles/system` | NixOS system configurations |
| **User** | `$XDG_STATE_HOME/nix/profiles` | Regular user package environments |
| **Root** | `$NIX_STATE_DIR/profiles/per-user/root` | Root user's profile |

### Commands for System Profile Management

#### Listing Generations
```bash
# NixOS-specific command
sudo nixos-rebuild list-generations

# Generic nix profile command
sudo nix profile history --profile /nix/var/nix/profiles/system

# Legacy nix-env command
sudo nix-env --list-generations --profile /nix/var/nix/profiles/system
```

#### Managing Old Generations
```bash
# Remove generations older than 14 days
sudo nix profile wipe-history --profile /nix/var/nix/profiles/system --older-than 14d

# Manual deletion (use with caution - can break GRUB entries)
sudo rm /nix/var/nix/profiles/system-*
sudo nix-store --gc
```

#### Inspecting Store Paths
```bash
# Show all GC roots pointing at a specific path
nix-store --query --roots <path>
```

## nixos-rebuild and Profile Creation

### Build Commands and Their Effects

| Command | Effect on Profile |
|---------|-------------------|
| `nixos-rebuild switch` | Creates new generation, activates immediately, sets as default boot |
| `nixos-rebuild boot` | Creates new generation, makes bootable, but doesn't activate now |
| `nixos-rebuild build` | Builds configuration but doesn't create profile entry |
| `nixos-rebuild test` | Builds and activates temporarily (not saved to profile) |

### Profile Groups in GRUB

The `-p` flag creates profile groupings in the GRUB boot menu:
```bash
nixos-rebuild switch -p test
```

This causes configurations to appear under a "NixOS - Profile 'test'" submenu in GRUB.

### Active vs. Booted System

You can verify which generation is active by comparing symlinks:
- **Current running system:** `/run/current-system/`
- **Booted system:** `/run/booted-system/`

## nix profile Command (Experimental)

The newer `nix profile` command suite provides enhanced profile management:

### Subcommands

| Subcommand | Purpose |
|------------|---------|
| `nix profile diff-closures` | Show closure difference between versions |
| `nix profile history` | Display all versions |
| `nix profile install` | Install a package into a profile |
| `nix profile list` | Show installed packages |
| `nix profile remove` | Delete packages |
| `nix profile rollback` | Revert to previous version |
| `nix profile upgrade` | Update packages |
| `nix profile wipe-history` | Delete non-current versions |

### Compatibility Warning

Once you use `nix profile`, you can no longer use `nix-env` without first deleting `$XDG_STATE_HOME/nix/profiles/profile`. Migration back requires removing this directory (deletes previously installed packages).

### Profile Structure

Each profile version contains:
- `manifest.nix` - for `nix-env` compatibility
- `manifest.json` - for `nix profile` metadata
- Symlink tree - pointing to installed package files

## System Activation Process

### How Activation Works

While the specific activation script details are covered in separate research, the profile-based activation flow is:

1. **Build Phase** - `nixos-rebuild` builds new configuration into Nix store
2. **Profile Creation** - New generation symlink created under `/nix/var/nix/profiles/system`
3. **Activation** - Symlinks are updated atomically to point to new generation
4. **GRUB Update** - Boot menu updated with new entry
5. **Service Restart** - System services restarted to use new configuration

### Atomicity Guarantees

The symlink-based approach ensures:
- **No partial states** - Either old or new configuration, never in-between
- **Safe rollback** - Previous generations remain intact and bootable
- **No file conflicts** - Multiple configurations coexist in Nix store

## Key Insights

1. **Profiles are Symlink Trees** - All profile management is symlink manipulation, never file mutation
2. **Generations are GC Roots** - Each generation symlink prevents garbage collection of its store paths
3. **System Profile is Canonical** - `/nix/var/nix/profiles/system` is the source of truth for boot configurations
4. **Atomic by Design** - Symlink updates are atomic, enabling safe upgrades and rollbacks
5. **Command Ecosystem Evolution** - Multiple command interfaces (`nix-env`, `nix profile`, `nixos-rebuild`) with overlapping functionality

## Related Research

This is the first of four related research tasks:
1. ✅ **NixOS system profiles** (this document)
2. **Activation scripts** - How profiles are activated
3. **Generation structure** - What's inside a system generation
4. **Binary directory structure** - How binaries are organized in the Nix store

## Sources

- [NixOS Manual](https://nixos.org/manual/nixos/stable/)
- [Nix Profiles Reference](https://nix.dev/manual/nix/2.22/package-management/profiles)
- [nix profile Command](https://releases.nixos.org/nix/nix-2.28.3/manual/command-ref/new-cli/nix3-profile.html)
- [NixOS Discourse](https://discourse.nixos.org/t/list-and-delete-nixos-generations/29637)
