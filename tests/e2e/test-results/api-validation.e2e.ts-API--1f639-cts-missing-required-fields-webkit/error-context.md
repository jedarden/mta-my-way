# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: api-validation.e2e.ts >> API validation >> rejects missing required fields
- Location: api-validation.e2e.ts:20:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "Validation failed"
Received: "validation failed"
```

# Test source

```ts
  1   | /**
  2   |  * E2E tests for API validation and Zod schema enforcement.
  3   |  */
  4   | 
  5   | import { expect, test } from "@playwright/test";
  6   | 
  7   | test.describe("API validation", () => {
  8   |   test("rejects malformed JSON in POST requests", async ({ request }) => {
  9   |     const response = await request.post("/api/commute/analyze", {
  10  |       data: "not valid json",
  11  |       headers: { "Content-Type": "application/json" },
  12  |     });
  13  | 
  14  |     expect(response.status()).toBe(400);
  15  |     const body = await response.json();
  16  |     expect(body).toHaveProperty("error");
  17  |     expect(body.error).toBe("Validation failed");
  18  |   });
  19  | 
  20  |   test("rejects missing required fields", async ({ request }) => {
  21  |     const response = await request.post("/api/commute/analyze", {
  22  |       data: JSON.stringify({ originId: "101" }), // Missing destinationId
  23  |       headers: { "Content-Type": "application/json" },
  24  |     });
  25  | 
  26  |     expect(response.status()).toBe(400);
  27  |     const body = await response.json();
  28  |     expect(body).toHaveProperty("error");
> 29  |     expect(body.error).toBe("Validation failed");
      |                        ^ Error: expect(received).toBe(expected) // Object.is equality
  30  |   });
  31  | 
  32  |   test("rejects invalid station IDs", async ({ request }) => {
  33  |     const response = await request.post("/api/commute/analyze", {
  34  |       data: JSON.stringify({
  35  |         originId: "101",
  36  |         destinationId: "999999", // Non-existent station
  37  |       }),
  38  |       headers: { "Content-Type": "application/json" },
  39  |     });
  40  | 
  41  |     expect(response.status()).toBe(404);
  42  |     const body = await response.json();
  43  |     expect(body).toHaveProperty("error");
  44  |     expect(body.error).toContain("not found");
  45  |   });
  46  | 
  47  |   test("accepts valid commute analyze request", async ({ request }) => {
  48  |     const response = await request.post("/api/commute/analyze", {
  49  |       data: JSON.stringify({
  50  |         originId: "101",
  51  |         destinationId: "726",
  52  |       }),
  53  |       headers: { "Content-Type": "application/json" },
  54  |     });
  55  | 
  56  |     expect(response.status()).toBe(200);
  57  |     const body = await response.json();
  58  |     expect(body).toHaveProperty("commuteId");
  59  |     expect(body).toHaveProperty("origin");
  60  |     expect(body).toHaveProperty("destination");
  61  |     expect(body).toHaveProperty("directRoutes");
  62  |     expect(body).toHaveProperty("transferRoutes");
  63  |     expect(body).toHaveProperty("recommendation");
  64  |   });
  65  | });
  66  | 
  67  | test.describe("Station search validation", () => {
  68  |   test("returns 400 for empty search query", async ({ request }) => {
  69  |     const response = await request.get("/api/stations/search?q=");
  70  | 
  71  |     expect(response.status()).toBe(400);
  72  |     const body = await response.json();
  73  |     expect(body).toHaveProperty("error");
  74  |     expect(body.error).toContain("required");
  75  |   });
  76  | 
  77  |   test("returns empty array for no matches", async ({ request }) => {
  78  |     const response = await request.get("/api/stations/search?q=NonexistentStation");
  79  | 
  80  |     expect(response.status()).toBe(200);
  81  |     const body = await response.json();
  82  |     expect(Array.isArray(body)).toBe(true);
  83  |     expect(body.length).toBe(0);
  84  |   });
  85  | 
  86  |   test("returns results for valid search", async ({ request }) => {
  87  |     const response = await request.get("/api/stations/search?q=Times");
  88  | 
  89  |     expect(response.status()).toBe(200);
  90  |     const body = await response.json();
  91  |     expect(Array.isArray(body)).toBe(true);
  92  |     expect(body.length).toBeGreaterThan(0);
  93  |     expect(body[0]).toHaveProperty("id");
  94  |     expect(body[0]).toHaveProperty("name");
  95  |     expect(body[0]).toHaveProperty("lines");
  96  |   });
  97  | });
  98  | 
  99  | test.describe("Push notification validation", () => {
  100 |   test("validates push subscribe request schema", async ({ request }) => {
  101 |     const response = await request.post("/api/push/subscribe", {
  102 |       data: JSON.stringify({
  103 |         subscription: {
  104 |           endpoint: "https://fcm.googleapis.com/fcm/send/test",
  105 |           keys: {
  106 |             p256dh: "test-key",
  107 |             auth: "test-auth",
  108 |           },
  109 |         },
  110 |         favorites: [{ id: "fav-1", stationId: "101", lines: ["1"], direction: "both" }],
  111 |       }),
  112 |       headers: { "Content-Type": "application/json" },
  113 |     });
  114 | 
  115 |     expect(response.status()).toBe(200);
  116 |     const body = await response.json();
  117 |     expect(body).toHaveProperty("success");
  118 |     expect(body.success).toBe(true);
  119 |   });
  120 | 
  121 |   test("rejects invalid push subscription data", async ({ request }) => {
  122 |     const response = await request.post("/api/push/subscribe", {
  123 |       data: JSON.stringify({
  124 |         subscription: "invalid", // Should be an object
  125 |       }),
  126 |       headers: { "Content-Type": "application/json" },
  127 |     });
  128 | 
  129 |     expect(response.status()).toBe(400);
```