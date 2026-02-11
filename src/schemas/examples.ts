import { schema, int, bool, fixed, enumeration, array, optional, object, union, pointer } from 'densing';

// Example 1: Device Configuration
const deviceSchema = schema(
  int('deviceId', 0, 1000),
  bool('enabled'),
  fixed('temperature', -40, 125, 0.1),
  enumeration('mode', ['eco', 'normal', 'performance'])
);

// Example 2: User Profile
const userSchema = schema(
  int('userId', 0, 10000),
  enumeration('role', ['guest', 'user', 'admin']),
  optional('age', int('ageValue', 0, 120)),
  bool('verified')
);

// Example 3: Network Configuration
const networkSchema = schema(
  object('network', enumeration('protocol', ['http', 'https', 'ws', 'wss']), int('port', 1024, 65535), bool('ssl')),
  array('allowedIPs', 0, 5, int('ip', 0, 255))
);

// Example 4: Action with Union
const actionSchema = schema(
  union('action', enumeration('type', ['start', 'stop', 'pause']), {
    start: [int('delay', 0, 60)],
    stop: [bool('force')],
    pause: [int('duration', 0, 3600)]
  })
);

// Example 5: IoT Sensor Data
const sensorSchema = schema(
  int('sensorId', 0, 100),
  fixed('temperature', -40, 85, 0.1),
  fixed('humidity', 0, 100, 0.1),
  int('battery', 0, 100),
  bool('alert'),
  enumeration('status', ['ok', 'warning', 'error'])
);

// Example 6: Color Palette
const paletteSchema = schema(
  array('colors', 0, 10, object('color', int('r', 0, 255), int('g', 0, 255), int('b', 0, 255)))
);

// Example 7: Expression Tree (Recursive) - Commented out, requires createRecursiveUnion from densing
const expressionSchema = schema(
  union('expr', enumeration('type', ['number', 'add', 'multiply']), {
    number: [int('value', 0, 1000)],
    add: [pointer('left', 'expr'), pointer('right', 'expr')],
    multiply: [pointer('left', 'expr'), pointer('right', 'expr')]
  })
);

const citaSchema = schema(
  int('length', 0, 7500),
  int('width', 0, 500),
  int('height', 0, 500),
  enumeration('typology', ['barn', 'school', 'house', 'church', 'castle']),
  object('offset', int('start', -256, 255), int('end', -256, 255))
);

export const exampleSchemas = {
  device: {
    name: 'Device Config',
    description: 'IoT device configuration with temperature and mode',
    schema: deviceSchema,
    defaultData: {
      deviceId: 42,
      enabled: true,
      temperature: 23.5,
      mode: 'performance'
    }
  },
  user: {
    name: 'User Profile',
    description: 'User profile with optional age field',
    schema: userSchema,
    defaultData: {
      userId: 100,
      role: 'user',
      age: 25,
      verified: true
    }
  },
  network: {
    name: 'Network Config',
    description: 'Network settings with nested object and array',
    schema: networkSchema,
    defaultData: {
      network: {
        protocol: 'https',
        port: 8080,
        ssl: true
      },
      allowedIPs: [192, 168, 1]
    }
  },
  action: {
    name: 'Action Union',
    description: 'Discriminated union for different action types',
    schema: actionSchema,
    defaultData: {
      action: {
        type: 'start',
        delay: 5
      }
    }
  },
  sensor: {
    name: 'IoT Sensor',
    description: 'Sensor data with multiple measurement types',
    schema: sensorSchema,
    defaultData: {
      sensorId: 7,
      temperature: 23.5,
      humidity: 65.2,
      battery: 87,
      alert: false,
      status: 'ok'
    }
  },
  palette: {
    name: 'Color Palette',
    description: 'Array of RGB color objects',
    schema: paletteSchema,
    defaultData: {
      colors: [
        { r: 255, g: 0, b: 0 },
        { r: 0, g: 255, b: 0 },
        { r: 0, g: 0, b: 255 }
      ]
    }
  },
  expression: {
    name: 'Expression Tree',
    description: 'Recursive mathematical expression tree',
    schema: expressionSchema,
    defaultData: {
      expr: {
        type: 'multiply',
        left: {
          type: 'add',
          left: { type: 'number', value: 5 },
          right: { type: 'number', value: 3 }
        },
        right: { type: 'number', value: 2 }
      }
    }
  },
  cita: {
    name: 'CITA',
    description: 'CITA configuration',
    schema: citaSchema,
    defaultData: {
      width: 300,
      height: 200,
      length: 2000,
      typology: 'house',
      offset: {
        start: 0,
        end: 0
      }
    }
  }
} as const;
