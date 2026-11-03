// Exercise the real CJS consumer and patched ESM decoder used by Expo Router.
const queryString = require('query-string') as { parse(value: string): Record<string, unknown> }

describe('query-string decoder interoperability', () => {
  it('decodes valid and malformed percent-encoded values without throwing', () => {
    expect(queryString.parse('name=%E2%9C%93').name).toBe('✓')
    expect(() => queryString.parse('name=%E0%A4%A')).not.toThrow()
    expect(typeof queryString.parse('name=%E0%A4%A').name).toBe('string')
  })
})
