export type DatasetFormat = 'YOLO' | 'COCO' | 'Pascal VOC' | 'CreateML';

export type DatasetEntry = { path: string; text: () => Promise<string> };

/** An imported shape. Points are 0–1 fractions of the image when `norm`, otherwise image pixels. */
export type DatasetShape = { label: string; kind: 'rect' | 'polygon'; pts: [number, number][]; norm: boolean };

export type DatasetCheck =
  | { ok: true; format: DatasetFormat; images: DatasetEntry[]; annotated: number; classes: string[]; shapes: Record<string, DatasetShape[]> }
  | { ok: false; error: string };

type Found = { classes: string[]; shapes: Record<string, DatasetShape[]> } | null;

const imageExt = /\.(jpe?g|png|bmp|webp|gif|tiff?)$/i;
const stem = (p: string) => p.split('/').pop()!.replace(/\.[^.]+$/, '').toLowerCase();
const base = (p: string) => p.split('/').pop()!.toLowerCase();
const ignored = (p: string) => p.startsWith('__MACOSX/') || base(p).startsWith('.');
// Windows-made files use \r\n; normalise so line-based parsing works everywhere
const lines = (s: string) => s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const add = (shapes: Record<string, DatasetShape[]>, path: string, s: DatasetShape) => (shapes[path] ??= []).push(s);
const pairs = (v: number[]) => v.slice(0, v.length - (v.length % 2)).reduce<[number, number][]>((a, _, i) => (i % 2 ? a : [...a, [v[i], v[i + 1]]]), []);

async function detectCoco(jsons: DatasetEntry[], byName: Map<string, string>): Promise<Found> {
  for (const j of jsons) {
    try {
      const data = JSON.parse(await j.text());
      if (!Array.isArray(data?.images) || !Array.isArray(data?.annotations) || !Array.isArray(data?.categories)) continue;
      const cats = new Map<unknown, string>(data.categories.map((c: { id: unknown; name: string }) => [c.id, String(c.name)]));
      const imgs = new Map<unknown, string>();
      for (const im of data.images as { id: unknown; file_name?: string }[]) {
        const path = im.file_name && byName.get(base(im.file_name));
        if (path) imgs.set(im.id, path);
      }
      const shapes: Record<string, DatasetShape[]> = {};
      for (const a of data.annotations as { image_id: unknown; category_id: unknown; bbox?: number[]; segmentation?: unknown }[]) {
        const path = imgs.get(a.image_id), label = cats.get(a.category_id);
        if (!path || label == null) continue;
        const polys = Array.isArray(a.segmentation) ? (a.segmentation as unknown[]).filter((p): p is number[] => Array.isArray(p) && p.length >= 6) : [];
        if (polys.length) polys.forEach((p) => add(shapes, path, { label, kind: 'polygon', pts: pairs(p), norm: false }));
        else if (a.bbox?.length === 4) {
          const [x, y, w, h] = a.bbox;
          add(shapes, path, { label, kind: 'rect', pts: [[x, y], [x + w, y + h]], norm: false });
        }
      }
      if (Object.keys(shapes).length) return { classes: [...cats.values()], shapes };
    } catch { /* not JSON, try next */ }
  }
  return null;
}

async function detectCreateMl(jsons: DatasetEntry[], byName: Map<string, string>): Promise<Found> {
  for (const j of jsons) {
    try {
      const data = JSON.parse(await j.text());
      if (!Array.isArray(data) || !data.length || typeof data[0]?.image !== 'string' || !Array.isArray(data[0]?.annotations)) continue;
      const shapes: Record<string, DatasetShape[]> = {};
      const classes = new Set<string>();
      for (const d of data as { image?: string; annotations?: { label: string; coordinates?: { x: number; y: number; width: number; height: number } }[] }[]) {
        const path = d.image && byName.get(base(d.image));
        if (!path) continue;
        for (const a of d.annotations ?? []) {
          const c = a.coordinates;
          if (!c || !a.label) continue;
          classes.add(a.label);
          // x/y are the box centre, in pixels
          add(shapes, path, { label: a.label, kind: 'rect', pts: [[c.x - c.width / 2, c.y - c.height / 2], [c.x + c.width / 2, c.y + c.height / 2]], norm: false });
        }
      }
      if (Object.keys(shapes).length) return { classes: [...classes], shapes };
    } catch { /* not JSON, try next */ }
  }
  return null;
}

async function detectVoc(xmls: DatasetEntry[], byStem: Map<string, string>): Promise<Found> {
  const classes = new Set<string>();
  const shapes: Record<string, DatasetShape[]> = {};
  for (const x of xmls) {
    const path = byStem.get(stem(x.path));
    if (!path) continue;
    const doc = new DOMParser().parseFromString(await x.text(), 'application/xml');
    if (!doc.querySelector('annotation')) continue;
    doc.querySelectorAll('annotation > object').forEach((o) => {
      const label = o.querySelector('name')?.textContent?.trim();
      const v = ['xmin', 'ymin', 'xmax', 'ymax'].map((k) => Number(o.querySelector(`bndbox > ${k}`)?.textContent));
      if (!label || v.some(Number.isNaN)) return;
      classes.add(label);
      add(shapes, path, { label, kind: 'rect', pts: [[v[0], v[1]], [v[2], v[3]]], norm: false });
    });
  }
  return Object.keys(shapes).length ? { classes: [...classes], shapes } : null;
}

const yoloLine = /^\d+(\s+-?\d*\.?\d+(e-?\d+)?){4,}$/i;

async function detectYolo(txts: DatasetEntry[], all: DatasetEntry[], byStem: Map<string, string>): Promise<Found> {
  const rows: [string, number[][]][] = [];
  for (const t of txts) {
    const path = byStem.get(stem(t.path));
    if (!path) continue;
    const ls = lines(await t.text());
    if (!ls.length || !ls.every((l) => yoloLine.test(l))) continue;
    rows.push([path, ls.map((l) => l.split(/\s+/).map(Number))]);
  }
  if (!rows.length) return null;

  // Class names come from classes.txt / obj.names or the `names:` key of data.yaml
  let classes: string[] = [];
  const namesFile = all.find((e) => /^(classes\.txt|obj\.names|.*\.names)$/.test(base(e.path)));
  const yaml = all.find((e) => /\.ya?ml$/.test(base(e.path)));
  if (namesFile) classes = lines(await namesFile.text());
  else if (yaml) classes = parseYamlNames(await yaml.text());
  const ids = [...new Set(rows.flatMap(([, r]) => r.map((v) => v[0])))].sort((a, b) => a - b);
  if (!classes.length) classes = ids.map((i) => `class_${i}`);
  const name = (i: number) => classes[i] ?? `class_${i}`;
  ids.forEach((i) => { if (!classes.includes(name(i))) classes.push(name(i)); });

  const shapes: Record<string, DatasetShape[]> = {};
  for (const [path, r] of rows) {
    for (const [cls, ...v] of r) {
      if (v.length === 4) {
        const [cx, cy, w, h] = v;
        add(shapes, path, { label: name(cls), kind: 'rect', pts: [[cx - w / 2, cy - h / 2], [cx + w / 2, cy + h / 2]], norm: true });
      } else if (v.length >= 6) add(shapes, path, { label: name(cls), kind: 'polygon', pts: pairs(v), norm: true });
    }
  }
  return { classes, shapes };
}

function parseYamlNames(src: string): string[] {
  src = src.replace(/\r\n?/g, '\n');
  const inline = src.match(/^names:\s*\[(.*)\]/m);
  if (inline) return inline[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  const block = src.match(/^names:[ \t]*\n((?:[ \t]+.*\n?)+)/m);
  if (!block) return [];
  return lines(block[1])
    .map((l) => l.replace(/^-\s*/, '').replace(/^\d+\s*:\s*/, '').replace(/^['"]|['"]$/g, ''));
}

/** Accepts only datasets that contain images plus annotations in a known format. */
export async function checkDataset(entries: DatasetEntry[]): Promise<DatasetCheck> {
  const files = entries.filter((e) => !ignored(e.path));
  const images = files.filter((e) => imageExt.test(e.path));
  if (!images.length) return { ok: false, error: 'No images found. The dataset must contain images and their annotations.' };

  // First image wins when names repeat across folders
  const byName = new Map<string, string>(), byStem = new Map<string, string>();
  for (const i of images) {
    if (!byName.has(base(i.path))) byName.set(base(i.path), i.path);
    if (!byStem.has(stem(i.path))) byStem.set(stem(i.path), i.path);
  }
  const by = (ext: RegExp) => files.filter((e) => ext.test(e.path));
  const jsons = by(/\.json$/i);

  const detectors: [DatasetFormat, () => Promise<Found>][] = [
    ['COCO', () => detectCoco(jsons, byName)],
    ['Pascal VOC', () => detectVoc(by(/\.xml$/i), byStem)],
    ['YOLO', () => detectYolo(by(/\.txt$/i), files, byStem)],
    ['CreateML', () => detectCreateMl(jsons, byName)],
  ];
  for (const [format, detect] of detectors) {
    const found = await detect();
    if (found) return { ok: true, format, images, annotated: Object.keys(found.shapes).length, ...found };
  }
  return { ok: false, error: 'No annotations found for these images. Supported formats: YOLO, COCO, Pascal VOC, CreateML.' };
}
