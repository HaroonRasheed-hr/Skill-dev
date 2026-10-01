export type DatasetFormat = 'YOLO' | 'COCO' | 'Pascal VOC' | 'CreateML';

export type DatasetEntry = { path: string; text: () => Promise<string> };

export type DatasetCheck =
  | { ok: true; format: DatasetFormat; images: DatasetEntry[]; annotated: number; classes: string[] }
  | { ok: false; error: string };

const imageExt = /\.(jpe?g|png|bmp|webp|gif|tiff?)$/i;
const stem = (p: string) => p.split('/').pop()!.replace(/\.[^.]+$/, '').toLowerCase();
const base = (p: string) => p.split('/').pop()!.toLowerCase();
const ignored = (p: string) => p.startsWith('__MACOSX/') || base(p).startsWith('.');

async function detectCoco(jsons: DatasetEntry[], imageNames: Set<string>) {
  for (const j of jsons) {
    try {
      const data = JSON.parse(await j.text());
      if (!Array.isArray(data?.images) || !Array.isArray(data?.annotations) || !Array.isArray(data?.categories)) continue;
      const annotatedIds = new Set(data.annotations.map((a: { image_id: unknown }) => a.image_id));
      const annotated = data.images.filter((im: { id: unknown; file_name?: string }) => annotatedIds.has(im.id) && im.file_name && imageNames.has(base(im.file_name))).length;
      if (annotated) return { annotated, classes: data.categories.map((c: { name: string }) => String(c.name)) };
    } catch { /* not JSON, try next */ }
  }
  return null;
}

async function detectCreateMl(jsons: DatasetEntry[], imageNames: Set<string>) {
  for (const j of jsons) {
    try {
      const data = JSON.parse(await j.text());
      if (!Array.isArray(data) || !data.length || typeof data[0]?.image !== 'string' || !Array.isArray(data[0]?.annotations)) continue;
      const items = data.filter((d: { image?: string; annotations?: unknown[] }) => d.image && imageNames.has(base(d.image)) && d.annotations?.length);
      if (items.length) {
        const classes = new Set<string>(items.flatMap((d: { annotations: { label: string }[] }) => d.annotations.map((a) => a.label)));
        return { annotated: items.length, classes: [...classes] };
      }
    } catch { /* not JSON, try next */ }
  }
  return null;
}

async function detectVoc(xmls: DatasetEntry[], imageStems: Set<string>) {
  const classes = new Set<string>();
  let annotated = 0;
  for (const x of xmls) {
    if (!imageStems.has(stem(x.path))) continue;
    const doc = new DOMParser().parseFromString(await x.text(), 'application/xml');
    const objects = doc.querySelectorAll('annotation > object > name');
    if (!doc.querySelector('annotation') || !objects.length) continue;
    objects.forEach((n) => classes.add(n.textContent!.trim()));
    annotated++;
  }
  return annotated ? { annotated, classes: [...classes] } : null;
}

const yoloLine = /^\d+(\s+-?\d*\.?\d+(e-?\d+)?){4,}$/i;

async function detectYolo(txts: DatasetEntry[], all: DatasetEntry[], imageStems: Set<string>) {
  let annotated = 0;
  const ids = new Set<number>();
  for (const t of txts) {
    if (!imageStems.has(stem(t.path))) continue;
    const lines = (await t.text()).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length || !lines.every((l) => yoloLine.test(l))) continue;
    lines.forEach((l) => ids.add(Number(l.split(/\s+/)[0])));
    annotated++;
  }
  if (!annotated) return null;

  // Class names come from classes.txt / obj.names or the `names:` key of data.yaml
  let classes: string[] = [];
  const namesFile = all.find((e) => /^(classes\.txt|obj\.names|.*\.names)$/.test(base(e.path)));
  const yaml = all.find((e) => /\.ya?ml$/.test(base(e.path)));
  if (namesFile) classes = (await namesFile.text()).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  else if (yaml) classes = parseYamlNames(await yaml.text());
  if (!classes.length) classes = [...ids].sort((a, b) => a - b).map((i) => `class_${i}`);
  return { annotated, classes };
}

function parseYamlNames(src: string): string[] {
  const inline = src.match(/^names:\s*\[(.*)\]/m);
  if (inline) return inline[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  const block = src.match(/^names:\s*\n((?:[ \t]+.*\n?)+)/m);
  if (!block) return [];
  return block[1].split('\n').map((l) => l.trim()).filter(Boolean)
    .map((l) => l.replace(/^-\s*/, '').replace(/^\d+\s*:\s*/, '').replace(/^['"]|['"]$/g, ''));
}

/** Accepts only datasets that contain images plus annotations in a known format. */
export async function checkDataset(entries: DatasetEntry[]): Promise<DatasetCheck> {
  const files = entries.filter((e) => !ignored(e.path));
  const images = files.filter((e) => imageExt.test(e.path));
  if (!images.length) return { ok: false, error: 'No images found. The dataset must contain images and their annotations.' };

  const imageNames = new Set(images.map((i) => base(i.path)));
  const imageStems = new Set(images.map((i) => stem(i.path)));
  const by = (ext: RegExp) => files.filter((e) => ext.test(e.path));
  const jsons = by(/\.json$/i);

  const detectors: [DatasetFormat, () => Promise<{ annotated: number; classes: string[] } | null>][] = [
    ['COCO', () => detectCoco(jsons, imageNames)],
    ['Pascal VOC', () => detectVoc(by(/\.xml$/i), imageStems)],
    ['YOLO', () => detectYolo(by(/\.txt$/i), files, imageStems)],
    ['CreateML', () => detectCreateMl(jsons, imageNames)],
  ];
  for (const [format, detect] of detectors) {
    const found = await detect();
    if (found) return { ok: true, format, images, ...found };
  }
  return { ok: false, error: 'No annotations found for these images. Supported formats: YOLO, COCO, Pascal VOC, CreateML.' };
}
