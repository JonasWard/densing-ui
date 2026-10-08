# densing builder

A visual schema builder for [densing](https://github.com/JonasWard/densing) 0.4: build a schema as a tree and see what every field costs, bit by bit.

## What it does

- **Outline tree.** Add fields of any densing type, rename them, and drag them to reorder or to nest them in objects and union variants. Wrap a field in an optional, array or object, or unwrap it. Keyboard: `↑↓` select, `Alt ↑↓` reorder, `Ctrl D` duplicate, `Del` remove, `Enter` rename, `Ctrl Z` / `Ctrl Shift Z` undo/redo.
- **Inspector with costs.** Each field shows its bit range. Integers and fixed-point fields show how many values the range has, how many fit in its bits, and a one-click "use the full N bits" when the top of the range is free. Fixed-point precision options are labelled with their bit cost. Enums say how many more options fit. Enum arrays compare packed and unpacked size. Union variants show their size each.
- **Bit ribbon.** Every bit the preview data encodes to, in encoder order and coloured by field. Bits are grouped under the base64url character they become. Presence bits, length prefixes and union tags are striped. Hovering a bit, a legend entry, a tree row or a form row highlights the same field everywhere.
- **Try it.** A form generated from the schema, the encoded string (base64url, QR-safe base45 or binary), a QR code, and paste-to-decode. When you edit the schema, preview values that still fit are kept.
- **Diagnostics.** Problems from `schemaFromJson` and `validateSchema` (bad ranges, duplicate names, unresolved or endless pointers) are marked on the field they belong to. You can keep editing; the preview pauses until the schema is valid.
- **Export.** TypeScript builder code (`schema(int(...), ...)`), generated types (`generateTypes`), schema JSON, and `densing-cli` commands. Import accepts schema JSON, pasted or as a file.

Schemas are saved in your browser's local storage. They are not put in the URL for now; that waits for densing's meta-schema.

## Develop

```bash
bun install
bun dev          # http://localhost:5173/densing-ui/
bun run test     # model tests: ops, diagnostics, codegen round-trip, bit layout vs encoder
bun run lint
bun run build
```

Pushes to `main` deploy to GitHub Pages (`.github/workflows/deploy.yml`).

## Layout

```
src/
  model/            pure logic, unit tested
    paths.ts        addressing nodes in the schema JSON (fields[0].variants.add[1])
    ops.ts          insert / move / duplicate / wrap / change type / union variants
    analyze.ts      per-node errors and bit ranges, built on densing's own checks
    ribbon.ts       the bit layout of a value, in encoder order
    data.ts         defaults per field, fitting preview data to an edited schema
    codegen.ts      schema → TypeScript builder code
    store.ts        reducer with undo/redo and local storage
    examples.ts
  components/       OutlineTree, Inspector, BitRibbon, Playground, DataForm, ExportPanel, Toolbar
```

The schema JSON is the editor's only state; it goes straight into densing's API (`schemaFromJson`, `validateSchema`, `getDenseFieldBitWidthRange`, `densing`, `undensing`, `generateTypes`).

## Ideas for later

- Infer a schema from sample JSON
- A bit budget (e.g. "fits in 20 URL characters"), with a warning when the maximum size goes over it
- Share schemas by URL using densing's meta-schema
