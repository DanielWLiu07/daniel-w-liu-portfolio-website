// Run against the dev server; PUPPETEER_MODULE can point to an external install.
const puppeteer = require(process.env.PUPPETEER_MODULE || 'puppeteer-core')
const assert = require('node:assert/strict')

async function check() {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--enable-unsafe-webgpu', '--use-angle=metal'],
    defaultViewport: { width: 1600, height: 1000, deviceScaleFactor: 1 },
  })
  try {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`${process.env.BASE_URL || 'http://localhost:3001'}/resume?perf&fdbg`, { waitUntil: 'networkidle0', timeout: 90000 })
    await page.waitForFunction(() => window.__hit?.at(-1)?.[1] > 8, { timeout: 90000 })
    const before = await page.evaluate(() => window.__st)
    for (const mode of ['button', 'escape', 'interrupted']) {
      await page.mouse.click(800, 825)
      await page.waitForSelector('.casino-file-close.is-open')
      await new Promise(resolve => setTimeout(resolve, mode === 'interrupted' ? 220 : 1800))
      if (mode === 'button') await page.click('.casino-file-close')
      else {
        await page.mouse.move(800, 825)
        await page.keyboard.press('Escape')
      }
      await page.waitForFunction(() => window.__st?.a[1] === 0)
      await new Promise(resolve => setTimeout(resolve, 300))
      const after = await page.evaluate(() => window.__st)
      assert.deepEqual(after.pos, before.pos, `${mode}: exact home position`)
      assert.deepEqual(after.rot, before.rot, `${mode}: exact home rotation`)
      assert.deepEqual(after.cam, before.cam, `${mode}: camera unchanged`)
      assert.deepEqual(after.swell, [1, 0], `${mode}: no floating scale/lift`)
      assert.deepEqual(after.hover, [0, 0], `${mode}: no stale hover`)
      assert.deepEqual(after.a, [0, 0], `${mode}: fully closed`)
    }
    assert.deepEqual(errors, [])
    console.log('Folder close: button, Escape and interrupted opening return exactly home; no browser errors.')
  } finally {
    await browser.close()
  }
}
check().catch(error => { console.error(error); process.exitCode = 1 })
