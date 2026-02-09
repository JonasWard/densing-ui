import { schema, int, fixed, array, object, createRecursiveUnion } from 'densing';

/**
 * Meta-schema: A schema that describes schemas!
 * This allows us to encode/decode entire schema definitions as compact base64 strings.
 */
export const metaSchema = schema(
  object(
    'schema',
    // Schema metadata
    object(
      'meta',
      int('version', 1, 10)
    ),
    // Root fields
    array(
      'fields',
      0,
      20,
      createRecursiveUnion(
        'field',
        ['bool', 'int', 'fixed', 'enum', 'optional', 'array', 'enum_array', 'object', 'union'],
        (recurse) => ({
          bool: [
            int('nameIndex', 0, 100)
          ],
          int: [
            int('nameIndex', 0, 100),
            int('min', -1000, 1000),
            int('max', -1000, 10000)
          ],
          fixed: [
            int('nameIndex', 0, 100),
            int('min', -1000, 1000),
            int('max', -1000, 10000),
            fixed('precision', 0.001, 10, 0.001)
          ],
          enum: [
            int('nameIndex', 0, 100),
            array('options', 1, 20, int('opt', 0, 100)) // Store as string indices
          ],
          optional: [
            int('nameIndex', 0, 100),
            recurse('wrapped')
          ],
          array: [
            int('nameIndex', 0, 100),
            int('minLength', 0, 100),
            int('maxLength', 0, 100),
            recurse('item')
          ],
          enum_array: [
            int('nameIndex', 0, 100),
            int('minLength', 0, 100),
            int('maxLength', 0, 100),
            array('options', 1, 20, int('opt', 0, 100))
          ],
          object: [
            int('nameIndex', 0, 100),
            array('fields', 0, 20, recurse('field'))
          ],
          union: [
            int('nameIndex', 0, 100),
            array('options', 2, 20, int('opt', 0, 100)),
            array('variants', 2, 20, 
              array('variantFields', 0, 20, recurse('vfield'))
            )
          ]
        }),
        5 // max depth for nested structures
      )
    ),
    // String lookup table (for field names, enum options, etc.)
    array('strings', 0, 200, int('charCode', 32, 126))
  )
);

/**
 * Helper to encode strings into the string table format
 */
export function encodeStringTable(strings: string[]): number[] {
  const joined = strings.join('|');
  return Array.from(joined).map(c => c.charCodeAt(0));
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
