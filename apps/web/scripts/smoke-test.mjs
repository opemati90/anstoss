import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'

const src = new URL('../src/', import.meta.url)
const read = (name) => readFileSync(new URL(name, src), 'utf8')
const attrs = {}
const document = {
  readyState: 'loading',
  body: { dataset: { site: 'home' } },
  head: { querySelector: () => null },
  documentElement: {
    setAttribute: (name, value) => {
      attrs[name] = value
    },
  },
  querySelector: () => null,
  getElementById: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  dispatchEvent: () => {},
}
const window = {
  localStorage: { getItem: () => null, setItem: () => {} },
  location: { href: 'https://anstoss.io/' },
}
runInNewContext(read('i18n.js'), { window, document, URL, URLSearchParams, CustomEvent: class {} })
const i18n = window.AnstossI18n
const price = (value) => Number(value.replace(/[^\d.,]/g, '').replace(',', '.'))
for (const language of i18n.langs) {
  i18n.choose(language)
  const t = i18n.t()
  assert.equal(attrs.lang, language)
  assert.equal(attrs.dir, language === 'ar' ? 'rtl' : 'ltr')
  document.body.dataset.site = 'signup'
  i18n.choose(language)
  assert.equal(document.title, `Anstoss – ${t.signup.title}`)
  document.body.dataset.site = 'home'
  assert.ok(price(t.club_py) < price(t.club_pm) * 12, `${language}: yearly saving`)
  assert.equal(Math.round(price(t.club_py) * 100), Math.round(price(t.club_pm) * 100) * 10)
  for (const key of [
    'title',
    'body',
    'email',
    'skip',
    'existing',
    'open',
    'download',
    'support',
    'back',
  ]) {
    assert.ok(t.signup[key]?.length > 0, `${language}: signup.${key}`)
  }
  // Verify every declared homepage text key resolves, not just dictionary parity.
  for (const [, key] of read('index.html').matchAll(/data-t="([^"]+)"/g)) {
    assert.equal(
      typeof key.split('.').reduce((v, part) => v?.[part], t),
      'string',
      `${language}: ${key}`,
    )
  }
}
i18n.choose('en')
assert.match(i18n.t().faq[0][1], /not|manual|disabled/i)
assert.match(i18n.t().signup.email, /personal email/)
const signup = read('signup.html')
assert.ok(!signup.includes('<form'), 'Signup must not pretend a mailto pilot form registers a club')
assert.ok(signup.includes('anstoss://sign-in?intent=club-setup'))
assert.ok(!signup.includes('24 Stunden'))
for (const page of ['index.html', 'signup.html', 'legal.html', 'account-deletion.html']) {
  for (const [, path] of read(page).matchAll(/(?:src|href)="\.\/([^"?#]+)/g)) {
    assert.ok(existsSync(fileURLToPath(new URL(path, src))), `${page}: missing local asset ${path}`)
  }
}
console.log('Website smoke passed: seven locales, annual saving, signup and local links')
