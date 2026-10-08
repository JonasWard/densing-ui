import { densing } from 'densing';
import { useMemo } from 'react';
import { useEditor } from './editor';
import { layoutBits, type Segment } from './model/ribbon';

/** The preview data encoded in the chosen base, its raw bits, and the bit layout */
export const useEncoding = () => {
  const { doc, analysis } = useEditor();
  return useMemo(() => {
    if (!analysis.schema)
      return {
        error: analysis.rootErrors[0] ?? 'Fix the fields marked ! to see the encoding',
        segments: [],
        bits: '',
        encoded: ''
      };
    try {
      const encoded = densing(analysis.schema, doc.data, doc.base);
      const bits = densing(analysis.schema, doc.data, 'binary');
      return { error: null, segments: layoutBits(analysis.schema, doc.data, analysis.byName), bits, encoded };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e), segments: [] as Segment[], bits: '', encoded: '' };
    }
  }, [analysis, doc.data, doc.base]);
};
