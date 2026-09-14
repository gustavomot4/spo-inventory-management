const { test } = require('node:test')
const assert = require('node:assert/strict')
const vm = require('node:vm')
const fs = require('node:fs')
const ts = require('typescript')

const source = fs.readFileSync('src/lib/accessibility.ts', 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const context = { exports: {} }
vm.runInNewContext(compiled, context)
const api = context.exports

test('saved preferences accept only supported values', () => {
  for (const value of [null, '', '0', '99', '150', 'NaN', '100px', '<script>', ' 100 ']) {
    assert.equal(api.parseFontScale(value), 100)
  }
  for (const scale of [87.5, 100, 112.5, 125]) assert.equal(api.parseFontScale(String(scale)), scale)
  for (const value of [null, '', 'DARK', 'unknown', 'system']) assert.equal(api.parseTheme(value), 'system')
  assert.equal(api.parseTheme('light'), 'light')
  assert.equal(api.parseTheme('dark'), 'dark')
})

test('pre-paint script and runtime agree for every preference and OS theme', () => {
  for (const scale of [null, 'bad', '87.5', '100', '112.5', '125']) {
    for (const theme of [null, 'bad', 'light', 'dark', 'system']) {
      for (const systemDark of [false, true]) {
        const root = { style: {}, dataset: {} }
        context.document = { documentElement: root }
        context.localStorage = { getItem: key => key === api.FONT_STORAGE_KEY ? scale : theme }
        const preferences = api.readPreferences()
        api.applyPreferences(preferences, systemDark)
        const bootRoot = { style: {}, dataset: {} }
        vm.runInNewContext(api.ACCESSIBILITY_INIT_SCRIPT, {
          localStorage: context.localStorage,
          document: { documentElement: bootRoot },
          window: { matchMedia: () => ({ matches: systemDark }) },
        })
        assert.deepEqual(bootRoot, root)
      }
    }
  }
})

test('blocked storage does not prevent startup or OS theme selection', () => {
  const root = { style: {}, dataset: {} }
  const localStorage = { getItem() { throw new Error('SecurityError') } }
  context.localStorage = localStorage
  assert.equal(api.readPreferences().fontScale, 100)
  assert.equal(api.readPreferences().theme, 'system')
  vm.runInNewContext(api.ACCESSIBILITY_INIT_SCRIPT, {
    localStorage, document: { documentElement: root },
    window: { matchMedia: () => ({ matches: true }) },
  })
  assert.equal(root.style.fontSize, '100%')
  assert.equal(root.dataset.theme, 'dark')
})

test('semantic text colors have at least 4.5:1 contrast on their surfaces in both themes', () => {
  const css = fs.readFileSync('src/app/globals.css', 'utf8')
  function tokens(selector) {
    const block = css.slice(css.indexOf(selector)).split('}')[0]
    return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(\d+)\s+(\d+)\s+(\d+)/g)]
      .map(([, name, ...rgb]) => [name, rgb.map(Number)]))
  }
  function luminance(rgb) {
    return rgb.map(v => v / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0)
  }
  const light = tokens(':root {')
  for (const palette of [light, { ...light, ...tokens(":root[data-theme='dark'] {") }]) {
    for (const [fg, bg] of [
      ['foreground', 'background'], ['foreground', 'surface'], ['muted-foreground', 'surface'],
      ['muted-foreground', 'muted'], ['accent-foreground', 'accent'], ['accent-foreground', 'surface'],
      ['success', 'success-muted'], ['success', 'surface'], ['warning', 'warning-muted'], ['warning', 'surface'],
      ['destructive', 'danger-muted'], ['destructive', 'surface'],
      ['primary-foreground', 'primary'], ['destructive-foreground', 'danger-solid'],
    ]) {
      const [a, b] = [luminance(palette[fg]), luminance(palette[bg])].sort((a, b) => b - a)
      assert.ok((a + 0.05) / (b + 0.05) >= 4.5, `${fg} on ${bg}`)
    }
  }
})
