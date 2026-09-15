/**
 * Regression: a detached slider must repaint a frozen viewport even if Chrome
 * suspends its animation-frame callbacks. Uses an already running dev server.
 * PUPPETEER_MODULE may point to a local Puppeteer installation.
 */
const assert = require('node:assert/strict')
const puppeteer = require(process.env.PUPPETEER_MODULE || 'puppeteer')

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}),
    args: ['--enable-unsafe-webgpu'],
    defaultViewport: { width: 1000, height: 750, deviceScaleFactor: 1 },
  })
  try {
    const errors = []
    const scene = await browser.newPage()
    scene.on('pageerror', error => errors.push(error.message))
    await scene.goto(`${process.env.CASINO_URL || 'http://127.0.0.1:3001'}/resume?flight=hold&rouSize=1.45`, { waitUntil: 'networkidle0', timeout: 90000 })
    // The covered intro and shader preparation must finish before freezing RAF.
    await new Promise(resolve => setTimeout(resolve, 10000))
    const opened = new Promise(resolve => scene.once('popup', resolve))
    await scene.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Animation workspace')).click())
    const panel = await opened
    panel.on('pageerror', error => errors.push(error.message))
    await panel.setViewport({ width: 480, height: 820, deviceScaleFactor: 1 })
    await panel.waitForSelector('input[type=range]')
    await scene.evaluate(() => { window.requestAnimationFrame = () => 0 })
    await new Promise(resolve => setTimeout(resolve, 200))
    const before = await scene.screenshot()
    const box = await (await panel.$('input[type=range]')).boundingBox()
    await panel.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2)
    await panel.mouse.down()
    for (let i = 0; i < 5; i++) {
      await panel.mouse.move(box.x + box.width * (0.45 + i * 0.08), box.y + box.height / 2, { steps: 4 })
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    await new Promise(resolve => setTimeout(resolve, 100))
    // Capture BEFORE releasing: a change handler that only commits on release fails.
    const during = await scene.screenshot()
    await panel.mouse.up()
    const counts = await panel.evaluate(async images => {
      return Promise.all(images.map(async data => {
        const image = new Image()
        image.src = `data:image/png;base64,${data}`
        await image.decode()
        const canvas = document.createElement('canvas')
        canvas.width = image.width; canvas.height = image.height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(image, 0, 0)
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data
        let gold = 0
        for (let i = 0; i < pixels.length; i += 4) {
          const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2]
          if (r > 80 && g > r * 0.65 && b < g * 0.8) gold++
        }
        return gold
      }))
    }, [Buffer.from(before).toString('base64'), Buffer.from(during).toString('base64')])
    assert(counts[0] > 1000, 'Roulette must be visible before the test')
    assert(counts[1] > counts[0] * 1.3, `Wheel did not visibly grow during drag with RAF stopped: ${counts}`)
    assert.deepEqual(errors, [], 'No browser errors')
    console.log(`OK: detached drag repainted the wheel with RAF suspended; gold pixels ${counts[0]} -> ${counts[1]}.`)
  } finally {
    await browser.close()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
