import fsp from 'node:fs/promises';
import path from 'node:path';

export interface ImageMeta {
  filename: string;
  size: number;
  width?: number;
  height?: number;
}

const HEADER_BYTES = 30;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP_LOSSY_START_CODE = Buffer.from([0x9d, 0x01, 0x2a]);

interface Dimensions {
  width: number;
  height: number;
}

const readPngDimensions = (header: Buffer): Dimensions | null => {
  if (header.length < 24 || !header.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return null;
  }

  if (header.toString('ascii', 12, 16) !== 'IHDR') {
    return null;
  }

  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
};

const readWebpDimensions = (header: Buffer): Dimensions | null => {
  if (
    header.length < 30 ||
    header.toString('ascii', 0, 4) !== 'RIFF' ||
    header.toString('ascii', 8, 12) !== 'WEBP'
  ) {
    return null;
  }

  const chunkType = header.toString('ascii', 12, 16);

  if (chunkType === 'VP8X') {
    return { width: header.readUIntLE(24, 3) + 1, height: header.readUIntLE(27, 3) + 1 };
  }

  if (chunkType === 'VP8L') {
    const bits = header.readUInt32LE(21);

    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }

  if (chunkType === 'VP8 ' && header.subarray(23, 26).equals(WEBP_LOSSY_START_CODE)) {
    return { width: header.readUInt16LE(26) & 0x3fff, height: header.readUInt16LE(28) & 0x3fff };
  }

  return null;
};

const readHeader = async (filePath: string): Promise<{ header: Buffer; size: number }> => {
  const handle = await fsp.open(filePath, 'r');

  try {
    const stat = await handle.stat();
    const header = Buffer.alloc(Math.min(HEADER_BYTES, stat.size));

    await handle.read(header, 0, header.length, 0);

    return { header, size: stat.size };
  } finally {
    await handle.close();
  }
};

export const readImageMeta = async (dir: string, filename: string): Promise<ImageMeta> => {
  const filePath = path.join(dir, filename);
  const { header, size } = await readHeader(filePath);
  const dimensions = readPngDimensions(header) ?? readWebpDimensions(header);

  if (!dimensions) {
    return { filename, size };
  }

  return { filename, size, ...dimensions };
};

export const readImageMetaForFiles = (dir: string, filenames: string[]): Promise<ImageMeta[]> =>
  Promise.all(filenames.map((filename) => readImageMeta(dir, filename)));
