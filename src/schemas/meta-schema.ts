// NOTE: meta-schema is no longer used since we switched to zstd compression
// Kept for reference, but createRecursiveUnion is not available in densing 0.2.1

export const metaSchema = null as any;

// Commented out - uses createRecursiveUnion which doesn't exist in densing 0.2.1
// export const metaSchema = schema(...);

/**
 * Helper to encode strings into the string table format
 */
export function encodeStringTable(strings: string[]): number[] {
  const joined = strings.join('|');
  return Array.from(joined).map((c) => c.charCodeAt(0));
}

/**
 * Helper to decode strings from the string table
 */
export function decodeStringTable(charCodes: number[]): string[] {
  const joined = String.fromCharCode(...charCodes);
  return joined.split('|');
}

/**
 * Get string index from the string table
 */
export function getStringIndex(strings: string[], str: string): number {
  let index = strings.indexOf(str);
  if (index === -1) {
    index = strings.length;
    strings.push(str);
  }
  return index;
}
