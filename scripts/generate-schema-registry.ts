import { encodeSchemaToBase64 } from '../src/schemas/schema-codec';
import type { FieldConfig } from '../src/components/SchemaBuilder';

// Device Config
const deviceFields: FieldConfig[] = [
  { id: '1', name: 'deviceId', type: 'int', min: 0, max: 1000 },
  { id: '2', name: 'enabled', type: 'bool' },
  { id: '3', name: 'temperature', type: 'fixed', min: -40, max: 125, precision: 0.1 },
  { id: '4', name: 'mode', type: 'enum', options: ['eco', 'normal', 'performance'] }
];

// User Profile
const userFields: FieldConfig[] = [
  { id: '1', name: 'userId', type: 'int', min: 0, max: 10000 },
  { id: '2', name: 'role', type: 'enum', options: ['guest', 'user', 'admin'] },
  { 
    id: '3', 
    name: 'age', 
    type: 'optional',
    wrappedField: { id: '3a', name: 'ageValue', type: 'int', min: 0, max: 120 }
  },
  { id: '4', name: 'verified', type: 'bool' }
];

// Network Config
const networkFields: FieldConfig[] = [
  {
    id: '1',
    name: 'network',
    type: 'object',
    fields: [
      { id: '1a', name: 'protocol', type: 'enum', options: ['http', 'https', 'ws', 'wss'] },
      { id: '1b', name: 'port', type: 'int', min: 1024, max: 65535 },
      { id: '1c', name: 'ssl', type: 'bool' }
    ]
  },
  {
    id: '2',
    name: 'allowedIPs',
    type: 'array',
    minLength: 0,
    maxLength: 5,
    wrappedField: { id: '2a', name: 'ip', type: 'int', min: 0, max: 255 }
  }
];

// Action Union
const actionFields: FieldConfig[] = [
  {
    id: '1',
    name: 'action',
    type: 'union',
    discriminatorField: {
      id: '1d',
      name: 'type',
      type: 'enum',
      options: ['start', 'stop', 'pause']
    },
    variants: {
      start: [{ id: '1a', name: 'delay', type: 'int', min: 0, max: 60 }],
      stop: [{ id: '1b', name: 'force', type: 'bool' }],
      pause: [{ id: '1c', name: 'duration', type: 'int', min: 0, max: 3600 }]
    }
  }
];

// IoT Sensor
const sensorFields: FieldConfig[] = [
  { id: '1', name: 'sensorId', type: 'int', min: 0, max: 100 },
  { id: '2', name: 'temperature', type: 'fixed', min: -40, max: 85, precision: 0.1 },
  { id: '3', name: 'humidity', type: 'fixed', min: 0, max: 100, precision: 0.1 },
  { id: '4', name: 'battery', type: 'int', min: 0, max: 100 },
  { id: '5', name: 'alert', type: 'bool' },
  { id: '6', name: 'status', type: 'enum', options: ['ok', 'warning', 'error'] }
];

// Color Palette
const paletteFields: FieldConfig[] = [
  {
    id: '1',
    name: 'colors',
    type: 'array',
    minLength: 0,
    maxLength: 10,
    wrappedField: {
      id: '1a',
      name: 'color',
      type: 'object',
      fields: [
        { id: '1a1', name: 'r', type: 'int', min: 0, max: 255 },
        { id: '1a2', name: 'g', type: 'int', min: 0, max: 255 },
        { id: '1a3', name: 'b', type: 'int', min: 0, max: 255 }
      ]
    }
  }
];

// CITA Building
const citaFields: FieldConfig[] = [
  { id: '1', name: 'length', type: 'int', min: 0, max: 7500 },
  { id: '2', name: 'width', type: 'int', min: 0, max: 500 },
  { id: '3', name: 'height', type: 'int', min: 0, max: 500 },
  { id: '4', name: 'typology', type: 'enum', options: ['barn', 'school', 'house', 'church', 'castle'] },
  {
    id: '5',
    name: 'offset',
    type: 'object',
    fields: [
      { id: '6', name: 'start', type: 'int', min: -256, max: 255 },
      { id: '7', name: 'end', type: 'int', min: -256, max: 255 }
    ]
  }
];

// Generate the schema registry
const schemaRegistry: Record<string, string> = {
  device: encodeSchemaToBase64('Device Config', deviceFields),
  user: encodeSchemaToBase64('User Profile', userFields),
  network: encodeSchemaToBase64('Network Config', networkFields),
  // action: encodeSchemaToBase64('Action Union', actionFields),  // Skip for now
  sensor: encodeSchemaToBase64('IoT Sensor', sensorFields),
  palette: encodeSchemaToBase64('Color Palette', paletteFields),
  cita: encodeSchemaToBase64('CITA Building', citaFields)
};

// Write to JSON file
console.log(JSON.stringify(schemaRegistry, null, 2));
