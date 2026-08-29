import { constants, access } from "node:fs/promises";
import { homedir } from "node:os";
import { describe, expect, it } from "vitest";

describe("Home Directory Accessibility", () => {
  it("should resolve home directory path", () => {
    const homePath = homedir();
    expect(homePath).toBeTruthy();
    expect(typeof homePath).toBe("string");
    expect(homePath.length).toBeGreaterThan(0);
  });

  it("should verify home directory exists and is readable", async () => {
    const homePath = homedir();

    try {
      await access(homePath, constants.R_OK | constants.X_OK);
      expect(true).toBe(true);
    } catch (error) {
      throw new Error(`Home directory ${homePath} is not accessible: ${error}`);
    }
  });

  it("should verify home directory is writable", async () => {
    const homePath = homedir();

    try {
      await access(homePath, constants.W_OK);
      expect(true).toBe(true);
    } catch (error) {
      throw new Error(`Home directory ${homePath} is not writable: ${error}`);
    }
  });
});
