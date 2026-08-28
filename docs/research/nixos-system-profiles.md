# NixOS System Profiles Documentation Sources

Research conducted: 2026-08-28

## Overview

NixOS system profiles are the mechanism for managing system configuration generations, enabling atomic upgrades and rollbacks. Profiles are created by `nixos-rebuild` operations and stored as generations in `/nix/var/nix/profiles/`.

## Official Documentation Sources

### 1. NixOS Manual (Primary Source)
**URL:** https://nixos.org/manual/nixos/stable/

#### Chapter/Section Locations:

**Chapter 2: Installation**
- **Section: "Changing the Configuration"** (approximately section 2.4)
  - Documents `nixos-rebuild switch`, `test`, `boot`, `build`, `repl`, `build-vm`
  - Explains profile naming with `-p` flag for GRUB submenu organization
  - Covers rollback capabilities through boot menu selection

**Chapter 13: Profiles**
- Located under the Configuration chapter
- Covers predefined configuration profiles provided by nixpkgs
- Lists available profiles: All Hardware, Base, Clone Config, Demo, Docker Container, Graphical, Hardened, Headless, Installation Device, Minimal, QEMU Guest
- Usage pattern: `imports = [ <nixpkgs/nixos/modules/profiles/profile-name.nix> ];`

The main NixOS manual covers:
- System configuration management
- `nixos-rebuild` command usage
- Profile naming with `-p` flag for GRUB submenu organization
- Rollback capabilities through boot menu selection
- Predefined configuration profiles for different use cases

Key commands documented:
- `nixos-rebuild switch` - Build, activate, and set as default boot
- `nixos-rebuild test` - Activate without making boot default
- `nixos-rebuild boot` - Build and set as boot default, activate on reboot
- `nixos-rebuild build` - Build only, for verification
- `nixos-rebuild repl` - Interactive configuration exploration
- `nixos-rebuild build-vm` - Test in QEMU sandbox

### 2. Nix Reference Manual - Profiles Section
**URL:** https://nix.dev/manual/nix/2.22/package-management/profiles

Explains the profile mechanism:
- **Purpose**: Different user configurations with atomic upgrades and rollbacks
- **User Environments**: Directory trees of symlinks pointing to activated packages
- **Generations**: Numbered links (e.g., `default-42-link`, `default-43-link`)
- **Profile Storage**: `/nix/var/nix/profiles/`
- **User Profile**: Symlink at `~/.nix-profile`

Management commands:
- `nix-env --rollback` - Revert to previous generation
- `nix-env --switch-generation 43` - Switch to specific generation
- `nix-env --list-generations` - View all generations
- `nix-env --switch-profile` - Change between profiles
- `nix-env --profile <path>` - Target specific profile

### 3. NixOS Wiki - nixos-rebuild
**URL:** https://wiki.nixos.org/wiki/Nixos-rebuild

Comprehensive `nixos-rebuild` documentation:
- Command overview and Python rewrite (`nixos-rebuild-ng`)
- All subcommands (switch, boot, test, build, dry-activate, build-vm)
- **System Generations**: Stored as `/nix/var/nix/profiles/system-N-link`
- **Generation Management**:
  - `nixos-rebuild list-generations` - List all generations
  - `nixos-rebuild --rollback switch` - Revert to previous generation
  - Manual activation: `/nix/var/nix/profiles/system-N-link/bin/switch-to-configuration switch`
- **Remote Deployment**: Build/deploy across hosts

### 4. NixOS Wiki - System Configuration
**URL:** https://wiki.nixos.org/wiki/NixOS_system_configuration

Covers:
- Declarative configuration principles
- Working with `/etc/nixos/configuration.nix`
- Configuration workflow

## Additional Documentation Sources

### Nixpkgs Manual
**URL:** https://nixos.org/nixpkgs/manual/
- Package management reference
- Public interface documentation

### NixOS Wiki (General)
**URL:** https://wiki.nixos.org/
- Community-maintained documentation
- Additional guides and how-tos

## Key Concepts

### Profile Structure
```
/nix/var/nix/profiles/
├── system-1-link -> /nix/store/...-nixos-system-<hostname>-v1
├── system-2-link -> /nix/store/...-nixos-system-<hostname>-v2
├── system-3-link -> /nix/store/...-nixos-system-<hostname>-v3
└── system -> system-3-link (current generation)
```

### User Profiles
```
~/.nix-profile -> /nix/var/nix/profiles/per-user/$USER/profile
```

### Profile Naming
```bash
# Create named profile (appears as GRUB submenu)
nixos-rebuild switch -p test
```

### Rollback Methods
1. **Boot Menu**: Select previous generation from GRUB
2. **Command**: `sudo nixos-rebuild --rollback switch`
3. **Manual**: Activate specific generation directly

## Research Notes

- System profiles are essentially garbage collection roots
- Each generation is a complete system closure
- Old generations remain in store until garbage collected
- Profile isolation prevents interference between users
- Atomic upgrades via symlink switching

## Sources

- [NixOS Manual](https://nixos.org/manual/nixos/stable/)
- [Nix Reference Manual - Profiles](https://nix.dev/manual/nix/2.22/package-management/profiles)
- [nixos-rebuild - Official NixOS Wiki](https://wiki.nixos.org/wiki/Nixos-rebuild)
- [NixOS System Configuration Wiki](https://wiki.nixos.org/wiki/NixOS_system_configuration)
- [Nixpkgs Manual](https://nixos.org/nixpkgs/manual/)
