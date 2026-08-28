# Ripgrep Binary Verification

## Date: 2026-08-28 (Re-verified)

## Verification Results

### Binary Location
- **Path:** `/run/current-system/sw/bin/rg`
- **Status:** ✅ EXISTS
- **Type:** Symlink to Nix store

### Symlink Target
- **Target:** `/nix/store/pvh5hvndqbhr9l89ikd7gkqbgjvkf1vq-ripgrep-15.1.0/bin/rg`
- **Resolved:** ✅ VALID

### File Permissions
- **Permissions:** `-r-xrwxr-x` (0755)
- **Owner:** root:root
- **Executable:** ✅ YES (execute bit set for owner, group, and others)

### Binary Metadata
- **Version:** ripgrep 15.1.0
- **Size:** 6,372,912 bytes (~6.4 MB)
- **Features:** +pcre2
- **SIMD compile:** +SSE2, -SSSE3, -AVX2
- **SIMD runtime:** +SSE2, +SSSE3, +AVX2
- **PCRE2:** 10.45 (JIT available)

### Functional Test
```bash
/run/current-system/sw/bin/rg --version
```
**Result:** ✅ PASS - Returns riprep 15.1.0 with feature information

## Conclusion
The ripgrep binary is properly installed at the expected NixOS system path and is fully functional with all expected features including PCRE2 support and SIMD optimizations.
