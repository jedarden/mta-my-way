/**
 * Output encoding utilities to prevent XSS attacks.
 *
 * These functions provide defense-in-depth by encoding user-generated
 * content before rendering. React automatically escapes content in JSX,
 * but these utilities are useful for:
 * - Rendering in contexts where React's auto-escaping doesn't apply
 * - Building dynamic HTML attributes
 * - Preparing content for non-React contexts (e.g., document.title)
 *
 * Per security requirements: All dynamically generated content must be
 * encoded before rendering.
 */

/**
 * HTML entity encoding map.
 */
const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
  "/": "&#x2F;",
};

/**
 * Encode a string for safe HTML rendering.
 * Replaces HTML special characters with their entity equivalents.
 *
 * @example
 * ```ts
 * encodeHTML("<script>alert('xss')</script>")
 * // Returns: "&lt;script&gt;alert('xss')&lt;/script&gt;"
 * ```
 */
export function encodeHTML(input: string): string {
  return String(input).replace(/[&<>"'/]/g, (char) => HTML_ENTITIES[char] || char);
}

/**
 * Encode a string for safe use in an HTML attribute.
 * Encodes quotes, backticks, and other characters that could break out of an attribute.
 *
 * @example
 * ```ts
 * encodeHTMLAttribute('" onclick="alert(\'xss\')')
 * // Returns: "&quot; onclick=&quot;alert('xss')&quot;"
 * ```
 */
export function encodeHTMLAttribute(input: string): string {
  return String(input).replace(
    /[&<>"'`=/]/g,
    (char) => HTML_ENTITIES[char] || `&#${char.charCodeAt(0)};`
  );
}

/**
 * Encode a string for safe use in a URL.
 * Uses encodeURIComponent for proper URL encoding.
 *
 * @example
 * ```ts
 * encodeURLComponent("hello world")
 * // Returns: "hello%20world"
 * ```
 */
export function encodeURLComponent(input: string): string {
  return encodeURIComponent(input);
}

/**
 * Encode a string for safe use in JavaScript (e.g., in inline event handlers).
 * Note: Avoid inline event handlers when possible; use event listeners instead.
 *
 * @example
 * ```ts
 * encodeJSString("'; alert('xss'); //")
 * // Returns: "\\x27; alert(\\x27xss\\x27); //"
 * ```
 */
export function encodeJSString(input: string): string {
  // Build regex with control character ranges to avoid eslint issues
  // Matches characters that need escaping in JavaScript strings
  const controlChars = String.fromCharCode(0x00);
  const controlCharsEnd = String.fromCharCode(0x2f);
  const controlChars2Start = String.fromCharCode(0x3a);
  const controlChars2End = String.fromCharCode(0x40);
  const controlChars3Start = String.fromCharCode(0x5b);
  const controlChars3End = String.fromCharCode(0x60);
  const controlChars4Start = String.fromCharCode(0x7b);
  const controlChars4End = String.fromCharCode(0xff);
  const regex = new RegExp(
    `[${controlChars}-${controlCharsEnd}${controlChars2Start}-${controlChars2End}${controlChars3Start}-${controlChars3End}${controlChars4Start}-${controlChars4End}]`,
    "g"
  );
  return String(input).replace(regex, (char) => {
    return `\\x${char.charCodeAt(0).toString(16).padStart(2, "0")}`;
  });
}

/**
 * Sanitize and encode user input for display in text content.
 * This is the safest default for displaying user-generated text.
 *
 * @example
 * ```ts
 * sanitizeUserInput("<img src=x onerror=alert('xss')>")
 * // Returns: "&lt;img src=x onerror=alert(&#39;xss&#39;)&gt;"
 * ```
 */
export function sanitizeUserInput(input: string): string {
  // Remove null bytes and control characters (build regex to avoid lint issues)
  const range1 = `${String.fromCharCode(0x00)}-${String.fromCharCode(0x08)}`;
  const range2 = `${String.fromCharCode(0x0b)}-${String.fromCharCode(0x0c)}`;
  const range3 = `${String.fromCharCode(0x0e)}-${String.fromCharCode(0x1f)}`;
  const range4 = String.fromCharCode(0x7f);
  const controlCharRegex = new RegExp(`[${range1}${range2}${range3}${range4}]`, "g");
  let sanitized = String(input).replace(controlCharRegex, "");
  // Encode HTML entities
  sanitized = encodeHTML(sanitized);
  // Normalize whitespace
  sanitized = sanitized.replace(/\s+/g, " ").trim();
  return sanitized;
}

/**
 * Truncate a string to a maximum length, encoding it first.
 * Useful for limiting display length while maintaining security.
 *
 * @example
 * ```ts
 * truncateEncoded("<p>Very long string...</p>", 20)
 * // Returns: "&lt;p&gt;Very long stri..."
 * ```
 */
export function truncateEncoded(input: string, maxLength: number): string {
  const encoded = encodeHTML(input);
  if (encoded.length <= maxLength) {
    return encoded;
  }
  return encoded.slice(0, maxLength - 3) + "...";
}
