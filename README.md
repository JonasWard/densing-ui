# 🎯 Densing UI

A modern React application for interacting with [Densing](https://github.com/JonasWard/densing) - an ultra-compact data serialization library.

## What is Densing?

Densing is a TypeScript library that uses bit-level packing to encode structured data into the smallest possible representation, perfect for URLs, QR codes, and storage-constrained contexts.

## Features

🔗 **Shareable URLs** - Every state is encoded in the URL with pattern `/#/{example}/{state}`:
- Share your exact configuration with others
- Bookmark specific states
- Deep linking support for all schemas

✨ **Interactive Schema Builder** - Work with various Densing schema types:
- Integer ranges
- Fixed-point decimals
- Booleans
- Enumerations
- Optional fields
- Nested objects
- Arrays
- Discriminated unions

🎨 **Visual Data Editor** - Easy-to-use form inputs for each field type

📊 **Real-time Encoding** - Instantly see your data encoded to compact strings

📈 **Size Analysis** - Compare encoded size vs JSON with detailed metrics:
- Bit-level breakdown per field
- Compression ratio
- Efficiency metrics

🔓 **Decode Functionality** - Paste encoded strings and decode them back to data

🎭 **Multiple Example Schemas**:
- Device Configuration (IoT devices)
- User Profiles (with optional fields)
- Network Settings (nested objects and arrays)
- Action Types (discriminated unions)
- IoT Sensors (multiple measurement types)
- Color Palettes (arrays of objects)

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) installed on your system

### Installation

```bash
# Install dependencies
bun install

# Start development server
bun dev
```

The app will be available at `http://localhost:5173`

### Build for Production

```bash
bun run build
```

## How to Use

1. **Select a Schema** - Choose from the example schemas or modify the code to add your own
2. **Edit Field Values** - Use the interactive form to set values for each field
3. **View Encoded Output** - See the ultra-compact encoded string in real-time
4. **Analyze Compression** - Review the size metrics and compression ratio
5. **Share Your State** - Copy the URL to share your exact configuration with others
6. **Decode** - Paste an encoded string to decode it back to the original data

### URL Structure

The application uses HashRouter with the following pattern:

```
/#/{schemaName}/{encodedState}
```

**Examples:**
- `/#/device/Cqnu` - Device config with specific settings
- `/#/user/AZJk` - User profile with age field
- `/#/sensor/T3Rlc` - Sensor data snapshot

When you change any value, the URL updates automatically. You can share the URL and others will see your exact configuration!

## Example

For a device configuration with:
- Device ID (0-1000)
- Enabled (boolean)
- Temperature (-40 to 125°C, 0.1° precision)
- Mode (eco/normal/performance)

**JSON:** `{"deviceId":42,"enabled":true,"temperature":23.5,"mode":"performance"}` (87 bytes)

**Densing:** `Cqnu` (4 bytes) - **94% smaller!**

## Technology Stack

- **React 19** - UI framework
- **TypeScript** - Type safety
- **React Router** - Hash-based routing for shareable URLs
- **Vite** - Build tool
- **Bun** - Package manager and runtime
- **Densing** - Data serialization library

## Project Structure

```
src/
├── components/
│   ├── SchemaSelector.tsx    # Schema selection UI
│   ├── SchemaForm.tsx        # Form for editing data
│   ├── FieldInput.tsx        # Dynamic input for each field type
│   └── EncodedDisplay.tsx    # Encoded output and size analysis
├── pages/
│   └── Home.tsx              # Main page with routing logic
├── schemas/
│   └── examples.ts           # Example schema definitions
├── App.tsx                   # Router setup
└── main.tsx                  # App entry point
```

## Adding Custom Schemas

Edit `src/schemas/examples.ts` to add your own schemas:

```typescript
import { schema, int, bool, fixed, enumeration } from 'densing';

const mySchema = schema(
  int('myField', 0, 100),
  bool('active'),
  enumeration('type', ['A', 'B', 'C'])
);

export const exampleSchemas = {
  // ... existing schemas
  myCustom: {
    name: 'My Custom Schema',
    description: 'Description here',
    schema: mySchema,
    defaultData: {
      myField: 50,
      active: true,
      type: 'A'
    }
  }
};
```

## Learn More

- [Densing Documentation](https://github.com/JonasWard/densing)
- [React Documentation](https://react.dev/)
- [Bun Documentation](https://bun.sh/docs)

## License

MIT

---

**Made with ❤️ for applications where every character matters**
