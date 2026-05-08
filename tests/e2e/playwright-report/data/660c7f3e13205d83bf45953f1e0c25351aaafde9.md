# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: line-diagram.e2e.ts >> Line Diagram Screen >> Error Handling >> should handle API failures gracefully
- Location: line-diagram.e2e.ts:459:5

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