// Technical store export of approved review artwork; no content is redrawn.
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const sharp = require('sharp')
const catalogue = require('./launch-listings-20261115.json')
const source = process.argv[2]
if (!source) throw new Error('Pass the original extracted artwork directory')
const root = path.join(__dirname, '../output/store-six-final-drafts-20261115')
const order = [
  ['01.png', '01-availability.png'], ['02.png', '02-lineup.png'],
  ['04.png', '03-player-events.png'], ['07-chat.png', '04-team-chat.png'],
  ['08-squad.png', '05-squad.png'], ['06.png', '06-dues.png'],
]
async function main() {
  const assets = []
  for (const locale of Object.keys(catalogue.locales)) {
    for (const platform of ['app-store', 'google-play']) {
      const size = platform === 'app-store' ? [1320, 2868] : [1080, 1920]
      const directory = path.join(root, platform, locale)
      fs.mkdirSync(directory, { recursive: true })
      for (const [input, filename] of order) {
        const generated = input.startsWith('07-') || input.startsWith('08-')
        const origin = generated ? path.join(__dirname, 'expansion-review', locale, input) : path.join(source, platform, locale, input)
        const output = path.join(directory, filename)
        if (!generated) fs.copyFileSync(origin, output)
        else await sharp(origin).resize(...size, { fit: 'contain', background: input.startsWith('07-') ? '#0E3B2B' : '#F1EEE4' }).flatten().png().toFile(output)
        const meta = await sharp(output).metadata()
        assert.deepEqual([meta.width, meta.height], size)
        assert.equal(meta.hasAlpha, false)
        assert.ok(fs.statSync(output).size < 8 * 1024 * 1024)
        assets.push({ platform, locale, filename, width: meta.width, height: meta.height, generated, status: 'draft-only' })
      }
      if (platform === 'google-play') fs.copyFileSync(path.join(source, platform, locale, 'feature-graphic.png'), path.join(directory, `${locale}-feature-graphic.png`))
    }
  }
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({ status: 'approved for store drafts only; release verification outstanding', order, assets }, null, 2))
  console.log(JSON.stringify({ root, screenshots: assets.length, locales: Object.keys(catalogue.locales), sizesValidated: true }))
}
main().catch(e => { console.error(e); process.exitCode = 1 })
