import type { FieldType } from '../model/ops';

export const TYPE_GLYPH: Record<FieldType, string> = {
  bool: '01',
  int: '#',
  fixed: '.1',
  enum: 'ab',
  object: '{}',
  array: '[]',
  enum_array: '[a]',
  optional: '?',
  union: '|',
  pointer: '↗',
  reference_numeric: '#→',
  reference: '&'
};

export const download = (filename: string, text: string, type = 'text/plain') => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};
