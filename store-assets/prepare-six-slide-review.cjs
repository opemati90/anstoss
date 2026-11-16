// Assemble a review gallery without altering any source-image pixels.
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const sharp = require('sharp')
const catalogue = require('./launch-listings-20261115.json')
const source = process.argv[2]
if (!source) throw new Error('Pass the extracted original artwork directory')
const output = path.join(__dirname, '../output/store-drafts-20261115/six-slide-review')
const locales = process.argv.slice(3)
const selected = locales.length ? locales : Object.keys(catalogue.locales)
const slides = [
  ['01.png', 'Availability', false],
  ['02.png', 'Line-up', false],
  ['04.png', 'Player and event response', false],
  ['07-chat.png', 'Team chat', true],
  ['08-squad.png', 'Squad management', true],
  ['06.png', 'Dues tracking', false],
]
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;')

async function main() {
  const assets = []
  for (const locale of selected) {
    assert.ok(catalogue.locales[locale], `Unsupported locale: ${locale}`)
    for (const [filename, benefit, generated] of slides) {
      const origin = generated
        ? path.join(__dirname, 'expansion-review', locale, filename)
        : path.join(source, 'app-store', locale, filename)
      const bytes = fs.readFileSync(origin)
      const metadata = await sharp(bytes).metadata()
      assert.ok(metadata.width > 0 && metadata.height > metadata.width, origin)
      assert.ok(Math.abs(metadata.width / metadata.height - 1320 / 2868) < 0.005, `Unexpected aspect ratio: ${origin}`)
      const relative = path.join(locale, filename)
      const destination = path.join(output, relative)
      fs.mkdirSync(path.dirname(destination), { recursive: true })
      fs.copyFileSync(origin, destination)
      assets.push({ locale, file: relative, benefit, origin, width: metadata.width, height: metadata.height,
        sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
        provenance: generated ? 'AI-generated review mockup based on Anstoss QA screen' : 'Unmodified user-supplied artwork',
        storeUploadApproved: false })
    }
  }
  const sections = selected.map(locale => `<section id="${locale}"><h2>${escape(catalogue.locales[locale].appleLocale)}</h2><div class="slides">${slides.map(([filename, benefit, generated], i) => `<figure><a href="${locale}/${filename}"><img src="${locale}/${filename}" alt="${escape(benefit)}" /></a><figcaption><strong>${i + 1}. ${escape(benefit)}</strong><span>${generated ? 'New review artwork' : 'Original artwork preserved'}</span></figcaption></figure>`).join('')}</div></section>`).join('')
  fs.writeFileSync(path.join(output, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Anstoss · six-slide store preview</title><style>*{box-sizing:border-box}body{margin:0;background:#101713;color:#f1eee4;font:15px/1.5 system-ui}main{max-width:1900px;margin:auto;padding:30px}h1{font-size:30px;margin:0}p{color:#b6c2b9;max-width:1100px}nav{display:flex;gap:24px;flex-wrap:wrap;margin:24px 0}a{color:#d4f25c}h2{margin:32px 0 16px;font-size:22px}.slides{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:16px}figure{margin:0}img{display:block;width:100%;height:auto;aspect-ratio:1320/2868;object-fit:contain}figcaption{padding:12px 0;font-size:12px}figcaption span{display:block;color:#a5b0a8;font-size:11px;margin-top:4px}section{padding-bottom:20px;border-bottom:1px solid #2a342d}.notice{border-left:3px solid #d4f25c;padding-left:14px}@media(max-width:1000px){.slides{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:550px){main{padding:18px}.slides{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}}</style><main><h1>Anstoss · six benefits, one consistent style</h1><p class="notice">Visual review only. Four supplied slides are unchanged; chat and squad management are new generated marketing mockups based on QA screens. New images still need release-screen comparison and store-sized exports. This gallery is not a native test result or store submission.</p><nav>${selected.map(locale=>`<a href="#${locale}">${escape(catalogue.locales[locale].appleLocale)}</a>`).join('')}</nav>${sections}<p>No family, automatic translation, AI-credit or direct social-publishing claims. Italian artwork remains pending. No store submission or public release has been made.</p></main></html>`)
  fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify({ status: 'visual-review-only', screenshotsPerLocale: 6, selected, assets }, null, 2))
  console.log(JSON.stringify({ output, locales: selected, assets: assets.length, originalPixelsUnchanged: true }))
}
main().catch(error => { console.error(error); process.exitCode = 1 })
