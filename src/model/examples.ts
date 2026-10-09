import {
  array,
  bool,
  definition,
  enumArray,
  enumeration,
  fixed,
  int,
  object,
  optional,
  reference,
  referenceNumeric,
  schema,
  schemaWithDefinitions,
  template,
  union,
  type DenseSchema,
  type Template
} from 'densing';

export interface Example {
  id: string;
  name: string;
  description: string;
  schema: DenseSchema;
  data: unknown;
}

const plain = (s: { fields: unknown; definitions?: unknown; templates?: unknown }): DenseSchema =>
  JSON.parse(JSON.stringify(s));

// templates are defined once and only used through references
const expr: Template = template(
  union('expr', enumeration('type', ['number', 'add', 'multiply']), {
    number: [int('value', 0, 1000)],
    add: [reference('left', () => expr), reference('right', () => expr)],
    multiply: [reference('left', () => expr), reference('right', () => expr)]
  })
);

const vec3 = template(object('vec3', fixed('x', -10, 10, 0.01), fixed('y', -10, 10, 0.01), fixed('z', -10, 10, 0.01)));

export const examples: Example[] = [
  {
    id: 'device',
    name: 'Device Config',
    description: 'The README example: four fields in 24 bits',
    schema: plain(
      schema(
        int('deviceId', 0, 1000),
        bool('enabled'),
        fixed('temperature', -40, 125, 0.1),
        enumeration('mode', ['eco', 'normal', 'performance'])
      )
    ),
    data: { deviceId: 42, enabled: true, temperature: 23.5, mode: 'performance' }
  },
  {
    id: 'user',
    name: 'User Profile',
    description: 'An optional field costs one presence bit',
    schema: plain(
      schema(
        int('userId', 0, 10000),
        enumeration('role', ['guest', 'user', 'admin']),
        optional('age', int('ageValue', 0, 120)),
        bool('verified')
      )
    ),
    data: { userId: 100, role: 'user', age: 25, verified: true }
  },
  {
    id: 'network',
    name: 'Network Config',
    description: 'Nested object and a variable length array',
    schema: plain(
      schema(
        object(
          'network',
          enumeration('protocol', ['http', 'https', 'ws', 'wss']),
          int('port', 1024, 65535),
          bool('ssl')
        ),
        array('allowedIPs', 0, 5, int('ip', 0, 255))
      )
    ),
    data: { network: { protocol: 'https', port: 8080, ssl: true }, allowedIPs: [192, 168, 1] }
  },
  {
    id: 'action',
    name: 'Action Union',
    description: 'A tagged union: each variant has its own fields',
    schema: plain(
      schema(
        union('action', enumeration('type', ['start', 'stop', 'pause']), {
          start: [int('delay', 0, 60)],
          stop: [bool('force')],
          pause: [int('duration', 0, 3600)]
        })
      )
    ),
    data: { action: { type: 'start', delay: 5 } }
  },
  {
    id: 'sensor',
    name: 'IoT Sensor',
    description: 'Fixed-point measurements',
    schema: plain(
      schema(
        int('sensorId', 0, 100),
        fixed('temperature', -40, 85, 0.1),
        fixed('humidity', 0, 100, 0.1),
        int('battery', 0, 100),
        bool('alert'),
        enumeration('status', ['ok', 'warning', 'error'])
      )
    ),
    data: { sensorId: 7, temperature: 23.5, humidity: 65.2, battery: 87, alert: false, status: 'ok' }
  },
  {
    id: 'palette',
    name: 'Color Palette',
    description: 'Array of objects, plus a packed enum array',
    schema: plain(
      schema(
        array('colors', 0, 10, object('color', int('r', 0, 255), int('g', 0, 255), int('b', 0, 255))),
        enumArray('tags', enumeration('tag', ['warm', 'cool', 'pastel', 'neon', 'mono']), 0, 6)
      )
    ),
    data: {
      colors: [
        { r: 255, g: 0, b: 0 },
        { r: 0, g: 255, b: 0 },
        { r: 0, g: 0, b: 255 }
      ],
      tags: ['neon', 'cool']
    }
  },
  {
    id: 'box',
    name: 'Box (shared units)',
    description: 'A numeric definition with mm and m presets, shared by three fields',
    schema: plain(
      schemaWithDefinitions(
        [definition('length', { mm: { min: 0, max: 1000 }, m: { min: 0, max: 100, precision: 0.01 } })],
        referenceNumeric('width', 'length'),
        referenceNumeric('height', 'length'),
        referenceNumeric('depth', 'length')
      )
    ),
    data: { $presets: { length: 'mm' }, width: 120, height: 40, depth: 800 }
  },
  {
    id: 'expression',
    name: 'Expression Tree',
    description: 'A recursive template: (5 + 3) × 2',
    schema: plain(schema(reference('expr', expr))),
    data: {
      expr: {
        type: 'multiply',
        left: { type: 'add', left: { type: 'number', value: 5 }, right: { type: 'number', value: 3 } },
        right: { type: 'number', value: 2 }
      }
    }
  },
  {
    id: 'pose',
    name: 'Pose',
    description: 'One vec3 template, used for position and rotation',
    schema: plain(schema(reference('position', vec3), reference('rotation', vec3))),
    data: { position: { x: 1, y: 2, z: 3 }, rotation: { x: 0, y: 0, z: -0.5 } }
  },
  {
    id: 'cita',
    name: 'CITA',
    description: 'Building dimensions and typology',
    schema: plain(
      schema(
        int('length', 0, 7500),
        int('width', 0, 500),
        int('height', 0, 500),
        enumeration('typology', ['barn', 'school', 'house', 'church', 'castle']),
        object('offset', int('start', -256, 255), int('end', -256, 255))
      )
    ),
    data: { length: 2000, width: 300, height: 200, typology: 'house', offset: { start: 0, end: 0 } }
  }
];
