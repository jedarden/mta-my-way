# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: map.e2e.ts >> Map Screen >> Navigation >> should navigate back to home
- Location: map.e2e.ts:228:5

# Error details

```
Error: locator.click: Error: Unknown attribute "aria-label", must be one of "checked", "disabled", "expanded", "include-hidden", "level", "name", "pressed", "selected".
    at validateAttributes (<anonymous>:4915:15)
    at Object.queryAll (<anonymous>:4975:23)
    at InjectedScript._queryEngineAll (<anonymous>:6645:49)
    at InjectedScript.querySelectorAll (<anonymous>:6632:30)
    at eval (eval at evaluate (:302:30), <anonymous>:2:35)
    at UtilityScript.evaluate (<anonymous>:304:16)
    at UtilityScript.<anonymous> (<anonymous>:1:44)
Call log:
  - waiting for locator('role=link[aria-label*="back" i]').or(locator('role=button[aria-label*="back" i]'))

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - link "Skip to main content" [ref=e2] [cursor=pointer]:
    - /url: "#app"
  - navigation [ref=e3]:
    - generic [ref=e4]:
      - link "⚔️ AI Code Battle" [ref=e5] [cursor=pointer]:
        - /url: "#/"
      - generic [ref=e6]:
        - link "Watch" [ref=e7] [cursor=pointer]:
          - /url: "#/watch"
        - link "Compete" [ref=e8] [cursor=pointer]:
          - /url: "#/compete"
        - link "Leaderboard" [ref=e9] [cursor=pointer]:
          - /url: "#/leaderboard"
        - link "Evolution" [ref=e10] [cursor=pointer]:
          - /url: "#/evolution"
        - link "Blog" [ref=e11] [cursor=pointer]:
          - /url: "#/blog"
        - link "Season 1" [ref=e12] [cursor=pointer]:
          - /url: "#/season/1"
```