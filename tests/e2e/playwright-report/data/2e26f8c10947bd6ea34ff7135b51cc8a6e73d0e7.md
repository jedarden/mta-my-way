# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: accessibility.e2e.ts >> Screen Reader Compatibility >> Focus Management >> should move focus to main on route change
- Location: accessibility.e2e.ts:115:5

# Error details

```
Error: browserType.launch: 
╔══════════════════════════════════════════════════════╗
║ Host system is missing dependencies to run browsers. ║
║ Missing libraries:                                   ║
║     libXcursor.so.1                                  ║
║     libgtk-3.so.0                                    ║
║     libgdk-3.so.0                                    ║
║     libpangocairo-1.0.so.0                           ║
║     libcairo-gobject.so.2                            ║
║     libgdk_pixbuf-2.0.so.0                           ║
╚══════════════════════════════════════════════════════╝
```