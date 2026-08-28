/**
 * Environment variable parsing utilities
 */

/**
 * Parse a string environment variable value as a boolean
 *
 * Truthy values: "true", "TRUE", "1" (case-insensitive)
 * Falsy values: "false", "FALSE", "0", "" (empty string), undefined
 *
 * @param value - The environment variable value to parse (can be undefined for unset vars)
 * @returns boolean - The parsed boolean value
 *
 * @example
 * ```ts
 * parseEnvBool("true")   // true
 * parseEnvBool("TRUE")   // true
 * parseEnvBool("1")      // true
 * parseEnvBool("false")  // false
 * parseEnvBool("0")      // false
 * parseEnvBool("")       // false
 * parseEnvBool(undefined) // false
 * parseEnvBool("yes")    // false (not a recognized truthy value)
 * ```
 */
export function parseEnvBool(value: string | undefined): boolean {
  if (value === undefined || value === "") {
    return false;
  }

  const normalized = value.toLowerCase().trim();

  return normalized === "true" || normalized === "1";
}

/**
 * Result of reading and validating the SHELL environment variable
 */
export interface ShellEnvResult {
  /**
   * Whether the SHELL environment variable is set and valid
   */
  readonly exists: boolean;
  /**
   * The value of the SHELL environment variable (if set)
   */
  readonly value: string | undefined;
  /**
   * Whether the value is a valid path format
   */
  readonly isValid: boolean;
  /**
   * The shell name extracted from the path (e.g., "bash", "zsh")
   */
  readonly shellName: string | undefined;
}

/**
 * Read and validate the SHELL environment variable
 *
 * This function reads the SHELL environment variable and validates:
 * - The variable is set and non-empty
 * - The value is a valid path format (contains / and shell name)
 * - The shell name can be extracted from the path
 *
 * @returns ShellEnvResult - The validation result with value and metadata
 *
 * @example
 * ```ts
 * // In a typical Unix environment
 * const result = readShellEnv();
 * // result.exists = true
 * // result.value = "/bin/bash"
 * // result.isValid = true
 * // result.shellName = "bash"
 *
 * // When SHELL is not set
 * const result = readShellEnv();
 * // result.exists = false
 * // result.value = undefined
 * // result.isValid = false
 * // result.shellName = undefined
 * ```
 */
export function readShellEnv(): ShellEnvResult {
  const shellValue = process.env.SHELL;

  if (!shellValue || shellValue.trim() === "") {
    return {
      exists: false,
      value: shellValue,
      isValid: false,
      shellName: undefined,
    };
  }

  // Remove trailing slash for consistent processing
  const normalizedPath = shellValue.endsWith("/") ? shellValue.slice(0, -1) : shellValue;

  // Validate path format: should contain "/" and have length > 1
  const isValidPath = normalizedPath.includes("/") && normalizedPath.length > 1;

  // Extract shell name from path (last non-empty component)
  const parts = normalizedPath.split("/").filter((p) => p.length > 0);
  const shellName = parts.length > 0 ? parts[parts.length - 1] : undefined;

  return {
    exists: true,
    value: shellValue,
    isValid: isValidPath && Boolean(shellName),
    shellName,
  };
}
