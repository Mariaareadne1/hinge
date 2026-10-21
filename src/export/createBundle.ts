import { strToU8, zipSync } from 'fflate'
import type { ExportFile } from './generateReact'

/** Zip export files under a single folder; returns the archive bytes. */
export function createZip(folder: string, files: ExportFile[]): Uint8Array {
  const entries: Record<string, Uint8Array> = {}
  for (const f of files) entries[`${folder}/${f.path}`] = strToU8(f.contents)
  // Fixed mtime keeps archives reproducible for identical projects.
  return zipSync(entries, { level: 6, mtime: new Date('2026-01-01T00:00:00Z') })
}
