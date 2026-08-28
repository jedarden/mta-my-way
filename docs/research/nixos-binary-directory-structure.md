# NixOS System Binary Directory Structure

Research findings on where NixOS installs system binaries and how the paths are organized.

## Primary Binary Paths

### `/run/current-system/sw/bin` (Runtime Path)

- **Purpose**: Runtime symlink to the current system generation's binaries
- **Created**: During `nixos-rebuild switch` (NOT at boot time - it's volatile)
- **Stability**: Volatile - lost on reboot, recreated at each nixos-rebuild
- **Recommended for**: Scripts and PATH configuration (available during runtime)
- **Structure**: The `sw` stands for "software" and contains user-space binaries
- **Real path**: `/run/current-system/sw` → `/nix/store/[hash]-system-path/`

**Example from live system:**
```bash
$ ls -la /run/current-system/sw
lrwxrwxrwx 1 root root 55 Dec 31  1969 sw -> /nix/store/17n18lm73c7z2c076anllnknlfx4wqmy-system-path

$ ls -la /run/current-system/sw/bin/
lrwxrwxrwx 1 root root 69 Dec 31  1969 [ -> /nix/store/...-coreutils-full-9.11/bin/[
lrwxrwxrwx 1 root root 69 Dec 31  1969 age -> /nix/store/...-age-1.3.1/bin/age
# ... thousands of symlinks to actual binaries in /nix/store/
```

### `/nix/var/nix/profiles/system` (Persistent System Profile)

- **Purpose**: Persistent profile that tracks all system generations across reboots
- **Created**: Each time you run `nixos-rebuild switch`
- **Management**: The `system` symlink always points to the current generation
- **Older generations**: Stored as `system-N-link` (e.g., `system-29-link`, `system-30-link`)
- **List generations**: `sudo nix-env -p /nix/var/nix/profiles/system --list-generations`
- **Boot entries**: This profile generates the GRUB boot menu entries

**Key difference**: This is the PERSISTENT profile that survives reboots. The `/run/current-system` is VOLATILE and represents only the currently running configuration.

## How the System Path is Built

The `system-path` store path is constructed by NixOS during `nixos-rebuild` by combining all packages specified in `environment.systemPackages` from your NixOS configuration.

### Build Process

1. **Configuration Evaluation**: Nix evaluates `/etc/nixos/configuration.nix` and processes all NixOS modules
2. **Package Collection**: All packages in `environment.systemPackages` are collected
3. **System Path Build**: Nix creates a special store path called `system-path` that symlinks together all the `bin/`, `sbin/`, `lib/`, `share/`, and `etc/` directories from every package
4. **Profile Creation**: The system profile (`/nix/var/nix/profiles/system`) is updated to point to the new generation
5. **Runtime Activation**: The current running system's `/run/current-system` symlinks are updated

### The "system-path" Store Path

The `system-path` is a unique Nix store path that consolidates all system packages:

```bash
/nix/store/[hash]-system-path/
├── bin/        # Symlinks to all package binaries
├── sbin/       # System binaries
├── lib/        # Combined libraries
├── share/      # Shared resources (man pages, completions)
└── etc/        # Configuration files
```

Every binary in `/run/current-system/sw/bin/` is a symlink to the actual binary in the Nix store:
```bash
/run/current-system/sw/bin/age → /nix/store/...-age-1.3.1/bin/age
/run/current-system/sw/bin/git → /nix/store/...-git-2.45.2/bin/git
```

## Complete Directory Structure Chain

```
/run/current-system (volatile, created at nixos-rebuild)
├── sw → /nix/store/[hash]-system-path
│   ├── bin/ → (symlinks to all package binaries in /nix/store)
│   ├── lib/
│   ├── share/
│   └── etc/
├── kernel → /nix/store/[hash]-linux-[version]/bzImage
├── initrd → /nix/store/[hash]-initrd-linux-[version]/initrd
├── etc → /nix/store/[hash]-etc/etc
├── systemd → /nix/store/[hash]-systemd-[version]
└── activate (script)

/nix/var/nix/profiles/system (persistent, survives reboots)
├── system → [hash]-nixos-system-[hostname]-[generation]
├── system-1-link → [older generation]
├── system-2-link → [older generation]
└── ...
```

**Key relationships:**
- `/run/current-system` is created during `nixos-rebuild switch` and points to the CURRENTLY RUNNING system
- `/nix/var/nix/profiles/system` contains ALL generations and is used for boot menu entries
- Both ultimately point to the same Nix store generation when a system is running
- On reboot, the system profile generation becomes the new `/run/current-system`

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
- [What happens when you run nixos-rebuild](https://asymmetric.github.io/2019/12/21/nixos-rebuild/)
- [nixos-rebuild man page](https://www.mankier.com/8/nixos-rebuild)
- [NixOS Wiki: nixos-rebuild](https://wiki.nixos.org/wiki/Nixos-rebuild)

## Research Notes

**Date**: 2026-08-28  
**Bead**: mtamyway-e4679f8c  
**System**: NixOS 26.05.20260826.062346a (Hetzner ex44)

### Key Discoveries

1. **Volatility correction**: Earlier documentation incorrectly stated that `/run/current-system` is created at boot. It is actually created during `nixos-rebuild switch` and is volatile (lost on reboot).

2. **System profile distinction**: The persistent profile at `/nix/var/nix/profiles/system` tracks all generations and survives reboots, while `/run/current-system` only represents the currently running configuration.

3. **System-path verification**: Confirmed on live system that `/run/current-system/sw` points to `/nix/store/[hash]-system-path`, which is a specially constructed store path that aggregates all `environment.systemPackages`.

4. **Symlink structure**: Every binary in `/run/current-system/sw/bin/` is a symlink to the actual binary in the `/nix/store/`, not a copy. This enables atomic upgrades and instant rollback.
