const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FILENAME_RE = /^[\w.-]+\.(png|webp)$/i;

export function isValidJobId(id: unknown): boolean {
  return typeof id === 'string' && UUID_RE.test(id);
}

export function isValidSubfolder(name: unknown): boolean {
  return name === 'transparent' || name === 'opaque';
}

export function isValidFilename(name: unknown): boolean {
  return typeof name === 'string' && FILENAME_RE.test(name) && !name.includes('..');
}
