// Curate the supplied artwork without modifying or regenerating its pixels.
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const sharp = require('sharp')
const catalogue = require('./launch-listings-20261115.json')
const source = process.argv[2]
if (!source) throw new Error('Pass the extracted anstoss-store-assets directory')
const output = path.join(__dirname, '../output/store-drafts-20261115')
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;')
const hash = value => crypto.createHash('sha256').update(value).digest('hex')

async function main() {
  const manifest = []
  for (const [locale, copy] of Object.entries(catalogue.locales)) {
    for (const [field, max] of [['promotionalText', 170], ['keywords', 100], ['shortDescription', 80], ['description', 4000]]) {
      assert.ok([...copy[field]].length <= max, `${locale} ${field} exceeds ${max}`)
    }
    for (const platform of ['app-store', 'google-play']) {
      const names = [...catalogue.screenshots, ...(platform === 'google-play' ? ['feature-graphic.png'] : [])]
      for (const name of names) {
        const relative = path.join(platform, locale, name)
        const bytes = fs.readFileSync(path.join(source, relative))
        const meta = await sharp(bytes).metadata()
        const size = name === 'feature-graphic.png' ? [1024, 500] : platform === 'app-store' ? [1320, 2868] : [1080, 1920]
        assert.deepEqual([meta.width, meta.height], size, relative)
        assert.equal(meta.hasAlpha, false, `${relative}: transparency`)
        fs.mkdirSync(path.dirname(path.join(output, relative)), { recursive: true })
        fs.writeFileSync(path.join(output, relative), bytes)
        manifest.push({ file: relative, width: meta.width, height: meta.height, sha256: hash(bytes) })
      }
    }
  }
  fs.mkdirSync(path.join(output, 'icon'), { recursive: true })
  for (const name of ['app-store-icon-1024.png', 'google-play-icon-512.png']) {
    fs.copyFileSync(path.join(source, 'icon', name), path.join(output, 'icon', name))
  }
  fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify({ ...catalogue, assets: manifest }, null, 2))
  const sections = Object.entries(catalogue.locales).map(([locale, copy]) => `<section id="${locale}"><h2>${escape(copy.appleLocale)}</h2><div class="screens">${catalogue.screenshots.map((name, i) => `<a href="app-store/${locale}/${name}"><img src="app-store/${locale}/${name}" alt="${escape(copy.appleLocale)} — ${['Attendance', 'Lineup', 'Player', 'Dues'][i]}" /></a>`).join('')}</div><details><summary>Google Play assets and listing text</summary><div class="screens">${catalogue.screenshots.map(name => `<a href="google-play/${locale}/${name}"><img src="google-play/${locale}/${name}" alt="Android artwork ${name}" /></a>`).join('')}</div><img class="feature" src="google-play/${locale}/feature-graphic.png" alt="Feature graphic" /><h3>${escape(copy.promotionalText)}</h3><p class="copy">${escape(copy.description)}</p></details></section>`).join('')
  fs.writeFileSync(path.join(output, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Anstoss — store draft review</title><style>body{margin:0;background:#0b100d;color:#ecefea;font:16px/1.5 system-ui}main{max-width:1400px;margin:auto;padding:28px}h1{margin:0;font-size:32px}h2{font-size:22px;margin:24px 0 12px}p{color:#bec8c0}.screens{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px}.screens img{width:100%;display:block}a{color:#d4f25c}nav{display:flex;gap:20px;flex-wrap:wrap}section{padding:12px 0 28px;border-bottom:1px solid #2a342d}details{margin-top:16px}summary{cursor:pointer;padding:12px 0}.feature{max-width:100%;width:700px;margin-top:20px}.copy{white-space:pre-line;max-width:800px}.notice{border-left:4px solid #d4f25c;padding-left:16px}@media(max-width:700px){.screens{grid-template-columns:repeat(2,minmax(0,1fr))}main{padding:16px}}</style><main><h1>Anstoss · updated store draft selection</h1><p class="notice">Drafts only. Existing artwork preserved; four launch images per language. Parent and AI-credit slides excluded. Italian pending artwork. Spanish and Arabic excluded because the app does not support them.</p><nav>${Object.entries(catalogue.locales).map(([locale, copy]) => `<a href="#${locale}">${escape(copy.appleLocale)}</a>`).join('')}</nav>${sections}<h2>Agreed pricing · not a purchase screen</h2><p>Team: €12.99/month or €129/year · Club (up to 3 teams): €29.99/month or €299/year · Club Unlimited (one club): €39.99/month or €399/year. Free stays separate. Native billing verification remains outstanding.</p><p>Original supplied artwork has not been edited. This gallery does not certify store submission readiness.</p></main></html>`)
  console.log(JSON.stringify({ output, assetCount: manifest.length, locales: Object.keys(catalogue.locales), validation: 'dimensions, opacity, metadata lengths and original byte hashes checked' }))
}
main().catch(error => { console.error(error); process.exitCode = 1 })
