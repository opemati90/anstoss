import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('production API build layout', () => {
  it('pins source root and excludes tests that import workspace source', () => {
    const config = JSON.parse(readFileSync(resolve(__dirname, '../tsconfig.build.json'), 'utf8'))
    expect(config.compilerOptions.rootDir).toBe('./src')
    expect(config.exclude).toContain('src/**/*.spec.ts')
    expect(config.exclude).toContain('src/test-utils/**')
  })

  it('checks the compiled entrypoint before publishing a runtime image', () => {
    const dockerfile = readFileSync(resolve(__dirname, '../Dockerfile'), 'utf8')
    expect(dockerfile).toContain('RUN test -f /app/apps/api/dist/main.js')
    expect(dockerfile).toContain('CMD ["node", "apps/api/dist/main.js"]')
  })
})
