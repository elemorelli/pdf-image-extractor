const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FILENAME_RE = /^[\w.-]+\.(png|webp)$/i;

export const isValidJobId = (id: unknown): boolean => typeof id === 'string' && UUID_RE.test(id);

export const isValidSubfolder = (name: unknown): boolean =>
  name === 'transparent' || name === 'opaque';

export const isValidFilename = (name: unknown): boolean =>
  typeof name === 'string' && FILENAME_RE.test(name) && !name.includes('..');
