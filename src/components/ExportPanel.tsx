import { generateTypes } from 'densing';
import { useMemo, useState } from 'react';
import { identifier, schemaToCode } from '../model/codegen';
import { useEditor } from '../editor';
import { CopyButton, Segmented } from './ui';
import { download } from './ui-utils';

type Tab = 'json' | 'ts' | 'types' | 'cli';

export const ExportPanel = () => {
  const { doc, analysis } = useEditor();
  const [tab, setTab] = useState<Tab>('ts');
  const slug =
    doc.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'schema';
  const out = useMemo(() => {
    const s = analysis.schema;
    switch (tab) {
      case 'json':
        return { text: JSON.stringify(s ?? doc.schema, null, 2), file: `${slug}.json`, type: 'application/json' };
      case 'ts':
        return s ? { text: schemaToCode(s, doc.name), file: `${slug}.schema.ts`, type: 'text/typescript' } : null;
      case 'types':
        return s
          ? { text: generateTypes(s, identifier(doc.name)), file: `${slug}.types.ts`, type: 'text/typescript' }
          : null;
      case 'cli':
        return {
          text: [
            '# save the JSON tab as',
            `#   ${slug}.json`,
            'npm install -g densing-cli',
            '',
            `densing size -s ${slug}.json`,
            `densing encode -s ${slug}.json data.json`,
            `densing decode -s ${slug}.json <encoded>`
          ].join('\n'),
          file: `${slug}.sh`,
          type: 'text/plain'
        };
    }
  }, [tab, analysis.schema, doc.schema, doc.name, slug]);

  return (
    <div className="export">
      <div className="inline between">
        <Segmented
          small
          value={tab}
          onChange={setTab}
          options={[
            { value: 'ts', label: 'Builder' },
            { value: 'types', label: 'Types' },
            { value: 'json', label: 'JSON' },
            { value: 'cli', label: 'CLI' }
          ]}
        />
        {out && (
          <span className="inline">
            <CopyButton text={out.text} />
            <button type="button" className="btn small" onClick={() => download(out.file, out.text, out.type)}>
              Download
            </button>
          </span>
        )}
      </div>
      {out ? <pre className="code">{out.text}</pre> : <p className="muted small">Fix the schema to export it.</p>}
      {tab === 'json' && !analysis.schema && (
        <p className="muted small">Showing the work in progress JSON: it does not load with schemaFromJson yet.</p>
      )}
    </div>
  );
};
