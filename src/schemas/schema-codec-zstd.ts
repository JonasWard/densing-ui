import { ZstdCodec } from 'zstd-codec';
import type { DenseField } from 'densing';

// Base64 URL-safe encoding (matches densing's base64url)
const base64urlChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function base64UrlEncode(bytes: Uint8Array): string {
  let result = '';
  let bits = 0;
  let bitCount = 0;

  for (let i = 0; i < bytes.length; i++) {
    bits = (bits << 8) | bytes[i];
    bitCount += 8;

    while (bitCount >= 6) {
      bitCount -= 6;
      result += base64urlChars[(bits >> bitCount) & 0x3f];
    }
  }

  if (bitCount > 0) {
    result += base64urlChars[(bits << (6 - bitCount)) & 0x3f];
  }

  return result;
}

function base64UrlDecode(str: string): Uint8Array {
  const charToValue = new Map<string, number>();
  for (let i = 0; i < base64urlChars.length; i++) {
    charToValue.set(base64urlChars[i], i);
  }

  const bytes: number[] = [];
  let bits = 0;
  let bitCount = 0;

  for (let i = 0; i < str.length; i++) {
    const value = charToValue.get(str[i]);
    if (value === undefined) continue;

    bits = (bits << 6) | value;
    bitCount += 6;

    if (bitCount >= 8) {
      bitCount -= 8;
      bytes.push((bits >> bitCount) & 0xff);
    }
  }

  return new Uint8Array(bytes);
}

// Cache for the ZSTD codec
let zstdSimple: any = null;

async function getZstdSimple() {
  if (!zstdSimple) {
    zstdSimple = await new Promise((resolve) => {
      ZstdCodec.run((zstd: any) => {
        resolve(new zstd.Simple());
      });
    });
  }
  return zstdSimple;
}

/**
 * Encode schema to base64 using zstd compression
 */
export async function encodeSchemaToBase64(name: string, fields: DenseField[]): Promise<string> {
  // Create schema object
  const schemaData = { name, fields };

  // Convert to JSON
  const jsonString = JSON.stringify(schemaData);

  // Convert to Uint8Array
  const jsonBytes = new TextEncoder().encode(jsonString);

  // Get ZSTD instance and compress
  const simple = await getZstdSimple();
  const compressed = simple.compress(jsonBytes);

  // Encode to base64url
  return base64UrlEncode(compressed);
}

/**
 * Decode base64 schema back to schema configuration
 */
export async function decodeSchemaFromBase64(base64: string): Promise<{ name: string; fields: DenseField[] }> {
  // Decode from base64url
  const compressed = base64UrlDecode(base64);

  // Get ZSTD instance and decompress
  const simple = await getZstdSimple();
  const jsonBytes = simple.decompress(compressed);

  // Convert to string
  const jsonString = new TextDecoder().decode(jsonBytes);

  // Parse JSON
  const schemaData = JSON.parse(jsonString);

  return {
    name: schemaData.name,
    fields: schemaData.fields
  };
}
