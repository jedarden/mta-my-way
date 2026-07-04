/**
 * Port conflict detection utility for E2E tests.
 *
 * Checks if a port is already in use before starting the test server.
 * Returns appropriate exit codes for scripting integration.
 */

import { createServer } from "node:net";

const PORT = 3001;

function checkPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();

    server.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        resolve(true); // Port is in use
      } else {
        resolve(false); // Other error, assume port is available
      }
    });

    server.once("listening", () => {
      server.close();
      resolve(false); // Port is available
    });

    server.listen(port, "127.0.0.1");
  });
}

async function main() {
  const portInUse = await checkPort(PORT);

  if (portInUse) {
    console.error(`❌ Port ${PORT} is already in use. Another process is listening on this port.`);
    console.error(
      "\nOptions:\n" +
        "  1. Stop the existing process (find it with: lsof -i :3001)\n" +
        "  2. Let Playwright reuse the existing server (set CI=false for reuseExistingServer)\n" +
        "  3. Use a different port (update playwright.config.ts baseURL and webServer.url)"
    );
    process.exit(1);
  }

  console.log(`✅ Port ${PORT} is available`);
  process.exit(0);
}

// Run if called directly (ES module check)
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}`) {
  main().catch((err) => {
    console.error("Error checking port:", err);
    process.exit(2);
  });
}

export { checkPort };
