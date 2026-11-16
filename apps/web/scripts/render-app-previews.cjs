/* Render the owner's approved design components, not invented screenshot markup.
 * Optional local tooling: playwright and sharp. No runtime dependency is added.
 * Run from the repository root: node apps/web/scripts/render-app-previews.cjs
 */
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')
const sharp = require('sharp')
const { locales, dictionaries } = require('./preview-locales.cjs')
const root = path.resolve(__dirname, '../../..')
const source = path.join(root, 'docs/redesign/handoff/prototype')
const destination = path.join(root, 'apps/web/src/assets/app-previews')
const colors = ['#0E3B2B', '#7A1F2B', '#123A5C', '#1F2A44', '#5B2A86', '#B4511E']
const screens = ['Home', 'Lineup', 'Player', 'Join', 'Fees', 'Calendar', 'Chat']
const stringsOnly = process.argv.includes('--strings')

async function main() {
  fs.mkdirSync(destination, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
    const cdp = await page.context().newCDPSession(page)
    // Self-hosted fonts only. No design-service runtime or remote requests.
    await page.route('https://preview.anstoss.local/**', async route => {
      const name = new URL(route.request().url()).pathname.split('/').pop()
      await route.fulfill({ contentType: 'font/woff2', body: fs.readFileSync(path.join(root, 'apps/web/src/fonts', name)) })
    })
    const manifest = []
    const requested = process.argv.slice(2).filter(value => locales.includes(value))
    for (const locale of stringsOnly ? ['de'] : requested.length ? requested : locales) {
    const localDestination = path.join(destination, locale)
    fs.mkdirSync(localDestination, { recursive: true })
    for (const name of screens) {
      for (const color of name === 'Player' && !stringsOnly ? colors : [colors[0]]) {
        const file = name.toLowerCase() + (name === 'Player' ? '-' + color.slice(1).toLowerCase() : '') + '.webp'
        const html = fs.readFileSync(path.join(source, name + '.dc.html'), 'utf8')
        const logic = html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)?.[1]
        const markup = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<link[^>]*>/g, '')
        await page.setContent(markup)
        await page.addStyleTag({ content: [400, 500, 600, 700].map(weight => `@font-face{font-family:Inter;font-weight:${weight};src:url(https://preview.anstoss.local/inter-latin-ext-${weight}-normal.woff2)}@font-face{font-family:Inter;font-weight:${weight};src:url(https://preview.anstoss.local/inter-latin-${weight}-normal.woff2);unicode-range:U+0000-00FF,U+2000-206F,U+20AC}`).join('') + `@font-face{font-family:'Barlow Condensed';font-weight:700;src:url(https://preview.anstoss.local/barlow-condensed-latin-ext-700-normal.woff2)}@font-face{font-family:'Barlow Condensed';font-weight:700;src:url(https://preview.anstoss.local/barlow-condensed-latin-700-normal.woff2);unicode-range:U+0000-00FF,U+2000-206F,U+20AC}x-dc,helmet{display:contents}body{margin:0}.scr{isolation:isolate}.preview-status{position:absolute;top:19px;left:27px;right:27px;display:flex;justify-content:space-between;font:600 12px Inter;z-index:3;pointer-events:none}.preview-status i{display:block;width:19px;height:9px;border:1.5px solid currentColor;border-radius:3px}.preview-home{position:absolute;bottom:7px;left:calc(50% - 56px);width:112px;height:4px;border-radius:3px;background:currentColor;opacity:.8;z-index:3}` })
        await page.evaluate(({ logic, color, name }) => {
          class DCLogic { constructor(props) { this.props = props; this.state = {} } setState(value) { Object.assign(this.state, value) } }
          const Component = logic ? new Function('DCLogic', logic + ';return Component')(DCLogic) : null
          const component = Component ? new Component({ club: color }) : null
          if (name === 'Player') component.state.a = 'yes'
          const values = component?.renderVals() || {}
          const value = (expression, context) => expression.replace(/{{|}}/g, '').trim().split('.').reduce((result, key) => result?.[key], context)
          const interpolate = (text, context) => text.replace(/{{\s*([^}]+)\s*}}/g, (_, expression) => String(value(expression, context) ?? ''))
          function render(node, context) {
            if (node.nodeType === Node.TEXT_NODE) { node.textContent = interpolate(node.textContent, context); return }
            if (node.nodeType !== Node.ELEMENT_NODE) return
            if (node.localName === 'sc-for') {
              const fragment = document.createDocumentFragment()
              for (const entry of value(node.getAttribute('list'), context) || []) {
                for (const child of [...node.childNodes]) { const clone = child.cloneNode(true); render(clone, { ...context, [node.getAttribute('as')]: entry }); fragment.append(clone) }
              }
              node.replaceWith(fragment); return
            }
            if (node.localName === 'sc-if') {
              if (!value(node.getAttribute('value'), context)) { node.remove(); return }
              for (const child of [...node.childNodes]) render(child, context)
              node.replaceWith(...node.childNodes); return
            }
            for (const attr of [...node.attributes]) {
              if (/^on/i.test(attr.name)) node.removeAttribute(attr.name)
              else node.setAttribute(attr.name, interpolate(attr.value, context))
            }
            for (const child of [...node.childNodes]) render(child, context)
          }
          render(document.querySelector('x-dc'), values)
          const screen = document.querySelector('.scr')
          const status = document.createElement('div'); status.className = 'preview-status'; status.innerHTML = '<span>9:41</span><i></i>'; screen.append(status)
          const home = document.createElement('span'); home.className = 'preview-home'; screen.append(home)
          if (screen.innerText.includes('{{')) throw new Error('Unresolved component binding')
        }, { logic, color, name })
        if (stringsOnly) {
          const strings = await page.locator('.scr').evaluate(screen => {
            const walker = document.createTreeWalker(screen, NodeFilter.SHOW_TEXT)
            const strings = []; let node
            while ((node = walker.nextNode())) { const text = node.textContent.trim().replace(/\s+/g, ' '); if (text) strings.push(text) }
            return [...new Set(strings)]
          })
          manifest.push({ name, strings })
          continue
        }
        // Translate the full rendered component, including dynamic labels and inputs.
        const translations = { ...dictionaries[locale] }
        if (name === 'Lineup') translations.Offen = { de: 'Offen', en: 'Vacant', fr: 'Libre', es: 'Libre', pt: 'Vago', tr: 'Boş', ar: 'شاغر' }[locale]
        const translated = await page.evaluate(({ locale, translations, name }) => {
          const screen = document.querySelector('.scr')
          const walker = document.createTreeWalker(screen, NodeFilter.SHOW_TEXT)
          const textNodes = []; let node
          while ((node = walker.nextNode())) textNodes.push(node)
          const proper = new Set(['SVS', 'SV Spreewiese 1921', 'Osei', 'Kaya', 'Yılmaz', 'Becker', 'Schulz', 'Hoffmann', 'Nowak', 'Petrović', 'Wagner', 'Meyer', 'Adeyemi', 'Lange', 'Krüger', 'Brandt', 'MY', 'SK', 'PK', 'JW', 'KO', 'Mert Yılmaz', 'Sinan Kaya', 'Paul Krüger', 'Jonas Wagner', 'Kofi Osei'])
          const missing = []
          for (const textNode of textNodes) {
            const original = textNode.textContent.trim().replace(/\s+/g, ' ')
            if (!original) continue
            if (translations[original]) {
              const translated = locale === 'ar' ? translations[original].replace(/\d(?:-\d){2,}/g, formation => '\u2066' + formation + '\u2069') : translations[original]
              textNode.textContent = textNode.textContent.replace(textNode.textContent.trim(), translated)
            }
            else if (!proper.has(original) && !/^[\d.:+\s-]+$/.test(original)) missing.push(original)
          }
          if (missing.length) throw new Error(`${locale}/${name}: untranslated text ${JSON.stringify(missing)}`)
          for (const input of screen.querySelectorAll('[placeholder]')) {
            const text = input.getAttribute('placeholder')
            if (translations[text]) input.setAttribute('placeholder', translations[text])
            else throw new Error(`${locale}/${name}: untranslated placeholder ${text}`)
          }
          // Preserve football formations and names; mirror reading order, not the pitch.
          document.documentElement.lang = locale
          screen.dir = locale === 'ar' ? 'rtl' : 'ltr'
          if (locale === 'ar') {
            for (const back of screen.querySelectorAll('[aria-label="Zurück"] svg')) back.style.transform = 'scaleX(-1)'
          }
          return textNodes.filter(n => n.textContent.trim()).map(n => n.textContent.trim())
        }, { locale, translations, name })
        if (name === 'Chat') await page.addStyleTag({ content: '.chip{font-size:12px;padding-inline:9px;gap:4px}' })
        if (locale === 'ar') await page.addStyleTag({ content: [400, 600, 700].map(weight => `@font-face{font-family:'IBM Plex Sans Arabic';font-weight:${weight};src:url(https://preview.anstoss.local/ibm-plex-sans-arabic-arabic-${weight}-normal.woff2)}`).join('') + `.scr,.scr *{font-family:'IBM Plex Sans Arabic',Inter,sans-serif!important}.disp{line-height:1.15!important}.preview-status{direction:ltr}.scr .bar{direction:rtl}.tabs{direction:rtl}` })
        await page.evaluate(() => document.fonts.ready)
        await page.evaluate(() => window.scrollTo(0, 0))
        const buffer = await page.locator('.scr').screenshot()
        await sharp(buffer).webp({ quality: 92, effort: 6 }).toFile(path.join(localDestination, file))
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 4 / 3, mobile: false })
        const small = await page.locator('.scr').screenshot()
        await sharp(small).webp({ quality: 90, effort: 6 }).toFile(path.join(localDestination, file.replace('.webp', '-520.webp')))
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: false })
        manifest.push({ file: `${locale}/${file}`, source: `docs/redesign/handoff/prototype/${name}.dc.html`, clubColor: color, width: 780, height: 1688, visibleText: translated })
        console.log(locale + '/' + file)
      }
    }
    }
    if (stringsOnly) fs.writeFileSync(path.join(root, 'output/playwright/preview-strings.json'), JSON.stringify(manifest, null, 2))
    else fs.writeFileSync(path.join(destination, 'provenance.json'), JSON.stringify({ kind: 'Illustrative app previews rendered from the owner-approved November 13 design handoff. Sample data; not native production screenshots.', assets: manifest }, null, 2) + '\n')
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
