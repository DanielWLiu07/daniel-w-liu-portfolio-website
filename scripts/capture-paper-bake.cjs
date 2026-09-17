// Run against a production preview of the authored launch, held at 3.43 seconds.
// PUPPETEER_MODULE may point to an existing browser-automation installation.
const p = require(process.env.PUPPETEER_MODULE || 'puppeteer')
const fs = require('node:fs')
;(async () => {
  const browser = await p.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--enable-unsafe-webgpu'] })
  try {
    for (const [name, width, height] of [['desktop', 1440, 900], ['portrait', 390, 844]]) {
      const page = await browser.newPage()
      await page.setViewport({ width, height })
      await page.evaluateOnNewDocument(() => {
        window.__observed = []; window.__THREE_DEVTOOLS__ = new EventTarget()
        window.__THREE_DEVTOOLS__.addEventListener('observe', e => window.__observed.push(e.detail))
      })
      await page.goto(`${process.env.PREVIEW_URL || 'http://localhost:3144'}/resume?flight=3.43&paperBake=1`)
      await page.waitForFunction(() => performance.getEntriesByName('casino:intro-start').length, { timeout: 90000 })
      await new Promise(r => setTimeout(r, 5000))
      const result = await page.evaluate(() => {
        const cards = []
        for (const scene of window.__observed.filter(s => s.isScene)) scene.traverse(o => { if (o.isMesh && o.userData.paperFlightBody !== undefined) cards.push(o) })
        cards.sort((a, b) => a.userData.paperFlightBody - b.userData.paperFlightBody)
        if (cards.length !== 67) throw Error(`Expected 67 cards, got ${cards.length}`)
        let root = cards[0]
        while (root.userData.cardRenderLayer === undefined) root = root.parent
        const centre = root.getWorldPosition(root.position.clone()), orientation = root.getWorldQuaternion(root.quaternion.clone()), inverse = orientation.clone().invert()
        return cards.map(card => {
          card.geometry.computeBoundingBox()
          return {
            index: card.userData.paperFlightBody,
            p: card.getWorldPosition(card.position.clone()).sub(centre).applyQuaternion(inverse).toArray(),
            q: inverse.clone().multiply(card.getWorldQuaternion(card.quaternion.clone())).toArray(),
            size: card.geometry.boundingBox.getSize(card.position.clone()).multiply(card.getWorldScale(card.position.clone())).toArray(),
          }
        })
      })
      fs.writeFileSync(`scripts/fixtures/paper-${name}.json`, JSON.stringify({ viewport: [width, height], speed: 70.4, cards: result }))
      console.log(name, result.length)
      await page.close()
    }
  } finally { browser.process().kill('SIGKILL') }
})().catch(error => { console.error(error); process.exitCode = 1 })
