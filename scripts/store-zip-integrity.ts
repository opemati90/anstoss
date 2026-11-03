import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Parse only the central directory; fail closed on ZIP64, multi-disk or
 * non-ASCII names. Never normalize names from a newline-delimited listing. */
export function storeZipEntries(archive: Buffer): string[] {
  if (archive.length < 22 || archive.length > 100 * 1024 * 1024) throw new Error('Invalid store archive size')
  let end = -1
  for (let i = archive.length - 22; i >= Math.max(0, archive.length - 65557); i--) {
    if (archive.readUInt32LE(i) === 0x06054b50 && i + 22 + archive.readUInt16LE(i + 20) === archive.length) { end = i; break }
  }
  if (end < 0 || archive.readUInt16LE(end + 4) !== 0 || archive.readUInt16LE(end + 6) !== 0) throw new Error('Invalid store archive directory')
  const count = archive.readUInt16LE(end + 10)
  const size = archive.readUInt32LE(end + 12)
  const offset = archive.readUInt32LE(end + 16)
  if (count === 0xffff || size === 0xffffffff || offset === 0xffffffff ||
    count !== archive.readUInt16LE(end + 8) || offset + size !== end) throw new Error('Unsupported store archive format')
  const names: string[] = []
  let cursor = offset
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > end || archive.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Invalid store archive entry')
    const flags = archive.readUInt16LE(cursor + 8)
    const nameLength = archive.readUInt16LE(cursor + 28)
    const extraLength = archive.readUInt16LE(cursor + 30)
    const commentLength = archive.readUInt16LE(cursor + 32)
    const next = cursor + 46 + nameLength + extraLength + commentLength
    if ((flags & 1) || nameLength === 0 || next > end || archive.readUInt16LE(cursor + 34) !== 0 ||
      archive.readUInt16LE(cursor + 6) >= 45 || archive.readUInt32LE(cursor + 20) === 0xffffffff ||
      archive.readUInt32LE(cursor + 24) === 0xffffffff || archive.readUInt32LE(cursor + 42) === 0xffffffff) {
      throw new Error('Unsupported store archive entry')
    }
    const extraEnd = cursor + 46 + nameLength + extraLength
    for (let extra = cursor + 46 + nameLength; extra < extraEnd;) {
      if (extra + 4 > extraEnd) throw new Error('Malformed store archive extra field')
      const length = archive.readUInt16LE(extra + 2)
      if (archive.readUInt16LE(extra) === 1 || extra + 4 + length > extraEnd) throw new Error('Unsupported store archive extra field')
      extra += 4 + length
    }
    const raw = archive.subarray(cursor + 46, cursor + 46 + nameLength)
    const name = raw.toString('ascii')
    if (!raw.equals(Buffer.from(name, 'ascii')) || !/^[a-zA-Z0-9._-]+\.png$/.test(name)) throw new Error('Invalid store archive name')
    names.push(name)
    cursor = next
  }
  if (cursor !== end || new Set(names).size !== names.length) throw new Error('Duplicate or malformed store archive entries')
  return names
}

/** Checks archive names, duplicate entries, and bytes without extracting files. */
export function verifyStoreZip(zip: string, directory: string, expectedNames: string[]): void {
  const names = [...expectedNames].sort()
  if (names.some((name) => !/^[a-zA-Z0-9._-]+\.png$/.test(name)) || new Set(names).size !== names.length) {
    throw new Error('Invalid expected store archive entries')
  }
  const entries = storeZipEntries(readFileSync(zip)).sort()
  if (JSON.stringify(entries) !== JSON.stringify(names)) throw new Error('Store archive entries differ')
  for (const name of names) {
    const zipped = execFileSync('unzip', ['-p', zip, name], { maxBuffer: 30 * 1024 * 1024 })
    if (!zipped.equals(readFileSync(join(directory, name)))) throw new Error(`Store archive entry differs: ${name}`)
  }
}
