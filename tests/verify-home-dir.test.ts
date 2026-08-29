import { execSync } from "node:child_process";
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

  describe("Shell expansion tests", () => {
    it("should execute echo ~ and capture output", () => {
      const output = execSync("echo ~", { encoding: "utf-8" }).trim();
      expect(output).toBeTruthy();
      expect(typeof output).toBe("string");
    });

    it("should verify echo ~ output is a valid absolute path", () => {
      const output = execSync("echo ~", { encoding: "utf-8" }).trim();

      // Should start with / (Unix absolute path)
      expect(output.startsWith("/")).toBe(true);

      // Should not be empty
      expect(output.length).toBeGreaterThan(0);

      // Should not contain spaces (valid path)
      expect(output.match(/\s/)).toBeNull();
    });

    it("should verify echo ~ output matches Node.js homedir()", () => {
      const shellHome = execSync("echo ~", { encoding: "utf-8" }).trim();
      const nodeHome = homedir();

      expect(shellHome).toBe(nodeHome);
    });

    it("should verify echo ~ output is accessible", async () => {
      const homePath = execSync("echo ~", { encoding: "utf-8" }).trim();

      try {
        await access(homePath, constants.R_OK | constants.X_OK);
        expect(true).toBe(true);
      } catch (error) {
        throw new Error(
          `Home directory from shell expansion ${homePath} is not accessible: ${error}`
        );
      }
    });
  });
});
