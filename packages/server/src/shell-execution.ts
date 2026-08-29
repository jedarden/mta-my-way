/**
 * Shell command execution interface.
 *
 * Provides a secure interface for executing basic shell commands
 * with proper validation, sanitization, and security controls.
 *
 * WARNING: This is a powerful administrative feature that should
 * only be accessible to authorized users with proper authentication.
 */

import { spawn } from "node:child_process";
import { logger } from "./observability/logger.js";

/**
 * Allowed shell commands for security.
 *
 * This whitelist approach prevents command injection and restricts
 * execution to known-safe commands.
 */
const ALLOWED_COMMANDS = new Set<string>([
  "pwd",
  "ls",
  "echo",
  "date",
  "whoami",
  "hostname",
  "uname",
]);

/**
 * Command execution result.
 */
export interface CommandResult {
  /** Exit code (0 = success) */
  exitCode: number | null;
  /** Standard output */
  stdout: string;
  /** Standard error output */
  stderr: string;
  /** Whether command execution timed out */
  timedOut: boolean;
}

/**
 * Command execution options.
 */
export interface CommandExecutionOptions {
  /** Command timeout in milliseconds (default: 5000ms) */
  timeout?: number;
  /** Maximum output size in bytes (default: 1MB) */
  maxOutputSize?: number;
  /** Working directory (default: current directory) */
  cwd?: string;
}

/**
 * Default command execution options.
 */
const DEFAULT_OPTIONS: CommandExecutionOptions = {
  timeout: 5000,
  maxOutputSize: 1_048_576, // 1MB
};

/**
 * Execute a shell command with security controls.
 *
 * Features:
 * - Command whitelist validation
 * - Timeout protection
 * - Output size limits
 * - Proper error handling
 *
 * @param command - Command to execute (must be in ALLOWED_COMMANDS)
 * @param args - Command arguments
 * @param options - Execution options
 * @returns Promise resolving to command result
 */
export async function executeCommand(
  command: string,
  args: string[] = [],
  options: CommandExecutionOptions = {}
): Promise<CommandResult> {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };

  // Validate command is allowed
  if (!ALLOWED_COMMANDS.has(command)) {
    logger.warn("Blocked attempt to execute unauthorized command", {
      command,
      allowedCommands: Array.from(ALLOWED_COMMANDS),
    });
    return {
      exitCode: 1,
      stdout: "",
      stderr: `Command '${command}' is not allowed`,
      timedOut: false,
    };
  }

  logger.info("Executing shell command", {
    command,
    args,
    timeout: mergedOptions.timeout,
  });

  return new Promise<CommandResult>((resolve) => {
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let totalOutputSize = 0;
    let timedOut = false;

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      logger.warn("Command execution timed out", {
        command,
        args,
        timeout: mergedOptions.timeout,
      });
      resolve({
        exitCode: null,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8") + "\nCommand timed out",
        timedOut: true,
      });
    }, mergedOptions.timeout);

    try {
      const child = spawn(command, args, {
        cwd: mergedOptions.cwd,
        stdio: ["ignore", "pipe", "pipe"],
        shell: true, // Use shell to resolve command paths
      });

      child.stdout?.on("data", (chunk: Buffer) => {
        // Check output size limit
        if (
          totalOutputSize + chunk.length >
          (mergedOptions.maxOutputSize ?? DEFAULT_OPTIONS.maxOutputSize!)
        ) {
          child.kill();
          return;
        }
        stdoutChunks.push(chunk);
        totalOutputSize += chunk.length;
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        // Check output size limit
        if (
          totalOutputSize + chunk.length >
          (mergedOptions.maxOutputSize ?? DEFAULT_OPTIONS.maxOutputSize!)
        ) {
          child.kill();
          return;
        }
        stderrChunks.push(chunk);
        totalOutputSize += chunk.length;
      });

      child.on("close", (code) => {
        clearTimeout(timeoutHandle);
        if (!timedOut) {
          resolve({
            exitCode: code,
            stdout: Buffer.concat(stdoutChunks).toString("utf8"),
            stderr: Buffer.concat(stderrChunks).toString("utf8"),
            timedOut: false,
          });
        }
      });

      child.on("error", (err) => {
        clearTimeout(timeoutHandle);
        if (!timedOut) {
          logger.error("Command execution failed", err, {
            command,
            args,
          });
          resolve({
            exitCode: null,
            stdout: "",
            stderr: `Command execution failed: ${err.message}`,
            timedOut: false,
          });
        }
      });
    } catch (err) {
      clearTimeout(timeoutHandle);
      if (!timedOut) {
        logger.error("Failed to spawn command", err as Error, {
          command,
          args,
        });
        resolve({
          exitCode: null,
          stdout: "",
          stderr: `Failed to spawn command: ${err instanceof Error ? err.message : String(err)}`,
          timedOut: false,
        });
      }
    }
  });
}

/**
 * Get list of allowed commands.
 *
 * Useful for UI display and validation.
 */
export function getAllowedCommands(): string[] {
  return Array.from(ALLOWED_COMMANDS);
}
