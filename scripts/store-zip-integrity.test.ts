import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { join } from 'node:path'
import { storeZipEntries, verifyStoreZip } from './store-zip-integrity'

const root = process.cwd()
const screenshots = ['01-anstoss.png', '02-club-home.png', '03-events-rsvp.png',
  '04-team-chat.png', '05-squad.png', '06-contributions.png']

test('the current archives contain exactly their corresponding loose files', () => {
  for (const [store, extras] of [
    ['app-store', ['app-icon-1024.png']],
    ['play-store', ['feature-graphic-1024x500.png', 'play-icon-512.png']],
  ] as const) {
    assert.doesNotThrow(() => verifyStoreZip(join(root, `store-assets/${store}-upload.zip`),
      join(root, `store-assets/${store}/en-US`), [...screenshots, ...extras]))
  }
})

test('rejects missing, duplicate, path-like and mismatched expected entries', () => {
  const zip = join(root, 'store-assets/app-store-upload.zip')
  const dir = join(root, 'store-assets/app-store/en-US')
  assert.throws(() => verifyStoreZip(zip, dir, screenshots))
  assert.throws(() => verifyStoreZip(zip, dir, [...screenshots, screenshots[0]]))
  assert.throws(() => verifyStoreZip(zip, dir, [...screenshots, '../app-icon-1024.png']))
  assert.throws(() => verifyStoreZip(zip, join(root, 'store-assets/source'), [...screenshots, 'app-icon-1024.png']))
})

function directory(names: string[]): Buffer {
  const entries = names.map((name) => {
    const raw = Buffer.from(name)
    const entry = Buffer.alloc(46 + raw.length)
    entry.writeUInt32LE(0x02014b50, 0)
    entry.writeUInt16LE(raw.length, 28)
    raw.copy(entry, 46)
    return entry
  })
  const body = Buffer.concat(entries)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(names.length, 8)
  end.writeUInt16LE(names.length, 10)
  end.writeUInt32LE(body.length, 12)
  return Buffer.concat([body, end])
}

test('central directory rejects malicious actual entry names and duplicates', () => {
  assert.deepEqual(storeZipEntries(directory(['01-anstoss.png'])), ['01-anstoss.png'])
  for (const names of [['01-anstoss.png', '01-anstoss.png'], ['../evil.png'], ['/evil.png'], ['\nevil.png'], ['evil.png\n']]) {
    assert.throws(() => storeZipEntries(directory(names)))
  }
  const encrypted = directory(['01-anstoss.png'])
  encrypted.writeUInt16LE(1, 8)
  assert.throws(() => storeZipEntries(encrypted))
  for (const field of [20, 24, 42]) {
    const zip64 = directory(['01-anstoss.png'])
    zip64.writeUInt32LE(0xffffffff, field)
    assert.throws(() => storeZipEntries(zip64))
  }
  const zip64version = directory(['01-anstoss.png'])
  zip64version.writeUInt16LE(45, 6)
  assert.throws(() => storeZipEntries(zip64version))
  const original = directory(['01-anstoss.png'])
  const extra = Buffer.from([1, 0, 0, 0])
  const zip64extra = Buffer.concat([original.subarray(0, original.length - 22), extra, original.subarray(original.length - 22)])
  zip64extra.writeUInt16LE(extra.length, 30)
  zip64extra.writeUInt32LE(zip64extra.length - 22, zip64extra.length - 10)
  assert.throws(() => storeZipEntries(zip64extra))
  const multidisk = directory(['01-anstoss.png'])
  multidisk.writeUInt16LE(1, multidisk.length - 18)
  assert.throws(() => storeZipEntries(multidisk))
  assert.throws(() => storeZipEntries(directory(['01-anstoss.png']).subarray(0, 25)))
})
