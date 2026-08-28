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
