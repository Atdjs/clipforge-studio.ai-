/**
 * Fast, memory-safe file fingerprinting for files up to 1 GB+.
 * Reads only 3 small 64 KB byte slices (start, middle, end) plus size & name,
 * hashing via Web Crypto SHA-256 in milliseconds without loading the full video.
 */
export async function computeVideoFileHash(file: File): Promise<string> {
  const SLICE_BYTES = 64 * 1024;
  const parts: ArrayBuffer[] = [];

  const meta = new TextEncoder().encode(`${file.size}:${file.lastModified}:${file.name}`);
  parts.push(meta.buffer as ArrayBuffer);

  if (file.size <= SLICE_BYTES * 3) {
    parts.push(await file.arrayBuffer());
  } else {
    const midOffset = Math.max(0, Math.floor(file.size / 2 - SLICE_BYTES / 2));
    const tailOffset = Math.max(0, file.size - SLICE_BYTES);
    const [head, mid, tail] = await Promise.all([
      file.slice(0, SLICE_BYTES).arrayBuffer(),
      file.slice(midOffset, midOffset + SLICE_BYTES).arrayBuffer(),
      file.slice(tailOffset, file.size).arrayBuffer(),
    ]);
    parts.push(head, mid, tail);
  }

  const totalLen = parts.reduce((sum, buf) => sum + buf.byteLength, 0);
  const combined = new Uint8Array(totalLen);
  let cursor = 0;
  for (const buf of parts) {
    combined.set(new Uint8Array(buf), cursor);
    cursor += buf.byteLength;
  }

  const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
