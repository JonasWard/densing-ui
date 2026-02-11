import { DenseField } from 'densing';
import { encodeSchemaToBase64 } from '../src/schemas/schema-codec-zstd';

// Device Config
const deviceFields: DenseField[] = [
  { name: 'deviceId', type: 'int', min: 0, max: 1000, defaultValue: 0 },
  { name: 'enabled', type: 'bool', defaultValue: false },
  { name: 'temperature', type: 'fixed', min: -40, max: 125, precision: 0.1, defaultValue: 0 },
  { name: 'mode', type: 'enum', options: ['eco', 'normal', 'performance'], defaultValue: 'eco' }
];

// User Profile
const userFields: DenseField[] = [
  { name: 'userId', type: 'int', min: 0, max: 10000, defaultValue: 0 },
  { name: 'role', type: 'enum', options: ['guest', 'user', 'admin'], defaultValue: 'guest' },
  {
    name: 'age',
    type: 'optional',
    field: { name: 'ageValue', type: 'int', min: 0, max: 120, defaultValue: 0 }
  },
  { name: 'verified', type: 'bool', defaultValue: false }
];

// Network Config
const networkFields: DenseField[] = [
  {
    name: 'network',
    type: 'object',
    fields: [
      { name: 'protocol', type: 'enum', options: ['http', 'https', 'ws', 'wss'], defaultValue: 'http' },
      { name: 'port', type: 'int', min: 1024, max: 65535, defaultValue: 80 },
      { name: 'ssl', type: 'bool', defaultValue: false }
    ]
  },
  {
    name: 'allowedIPs',
    type: 'array',
    minLength: 0,
    maxLength: 5,
    items: { name: 'ip', type: 'int', min: 0, max: 255, defaultValue: 0 }
  }
];

// Action Union
const actionFields: DenseField[] = [
  {
    name: 'action',
    type: 'union',
    discriminator: {
      name: 'type',
      type: 'enum',
      options: ['start', 'stop', 'pause'],
      defaultValue: 'start'
    },
    variants: {
      start: [{ name: 'delay', type: 'int', min: 0, max: 60, defaultValue: 0 }],
      stop: [{ name: 'force', type: 'bool', defaultValue: false }],
      pause: [{ name: 'duration', type: 'int', min: 0, max: 3600, defaultValue: 0 }]
    }
  }
];

// IoT Sensor
const sensorFields: DenseField[] = [
  { name: 'sensorId', type: 'int', min: 0, max: 100, defaultValue: 0 },
  { name: 'temperature', type: 'fixed', min: -40, max: 85, precision: 0.1, defaultValue: 0 },
  { name: 'humidity', type: 'fixed', min: 0, max: 100, precision: 0.1, defaultValue: 0 },
  { name: 'battery', type: 'int', min: 0, max: 100, defaultValue: 0 },
  { name: 'alert', type: 'bool', defaultValue: false },
  { name: 'status', type: 'enum', options: ['ok', 'warning', 'error'], defaultValue: 'ok' }
];

// Color Palette
const paletteFields: DenseField[] = [
  {
    name: 'colors',
    type: 'array',
    minLength: 0,
    maxLength: 10,
    items: {
      name: 'color',
      type: 'object',
      fields: [
        { name: 'r', type: 'int', min: 0, max: 255, defaultValue: 0 },
        { name: 'g', type: 'int', min: 0, max: 255, defaultValue: 0 },
        { name: 'b', type: 'int', min: 0, max: 255, defaultValue: 0 }
      ]
    }
  }
];

// Expression Tree (Recursive with pointer)
const expressionFields: DenseField[] = [
  {
    name: 'expr',
    type: 'union',
    discriminator: {
      name: 'type',
      type: 'enum',
      options: ['number', 'add', 'multiply'],
      defaultValue: 'number'
    },
    variants: {
      number: [{ name: 'value', type: 'int', min: 0, max: 1000, defaultValue: 0 }],
      add: [
        { name: 'left', type: 'pointer', targetName: 'expr' },
        { name: 'right', type: 'pointer', targetName: 'expr' }
      ],
      multiply: [
        { name: 'left', type: 'pointer', targetName: 'expr' },
        { name: 'right', type: 'pointer', targetName: 'expr' }
      ]
    }
  }
];

// CITA Building
const citaFields: DenseField[] = [
  { name: 'length', type: 'int', min: 0, max: 7500, defaultValue: 2000 },
  { name: 'width', type: 'int', min: 0, max: 500, defaultValue: 300 },
  { name: 'height', type: 'int', min: 0, max: 500, defaultValue: 200 },
  { name: 'typology', type: 'enum', options: ['barn', 'school', 'house', 'church', 'castle'], defaultValue: 'house' },
  {
    name: 'offset',
    type: 'object',
    fields: [
      { name: 'start', type: 'int', min: -256, max: 255, defaultValue: 0 },
      { name: 'end', type: 'int', min: -256, max: 255, defaultValue: 0 }
    ]
  }
];

// Generate the schema registry with async/await
async function generateRegistry() {
  const schemaRegistry: Record<string, string> = {
    device: await encodeSchemaToBase64('Device Config', deviceFields),
    user: await encodeSchemaToBase64('User Profile', userFields),
    network: await encodeSchemaToBase64('Network Config', networkFields),
    action: await encodeSchemaToBase64('Action Union', actionFields),
    sensor: await encodeSchemaToBase64('IoT Sensor', sensorFields),
    palette: await encodeSchemaToBase64('Color Palette', paletteFields),
    expression: await encodeSchemaToBase64('Expression Tree', expressionFields),
    cita: await encodeSchemaToBase64('CITA Building', citaFields)
  };

  // Write to JSON file
  console.log(JSON.stringify(schemaRegistry, null, 2));
}

generateRegistry().catch(console.error);
