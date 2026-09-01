/**
 * Generate the three court plates.
 *
 *   node scripts/court-art.mjs            all three
 *   node scripts/court-art.mjs J Q        just those
 *   node scripts/court-art.mjs --dry      print the prompt and the provider, generate nothing
 *
 * The key is read from .env.local and never printed, never passed as an argv and
 * never written into a downloaded file's path. Whichever of the supported keys
 * is present decides the provider, so adding a key is the only setup step.
 *
 * ONE image per rank, not per card. The figure is the same on all four suits and
 * only the marks change, so three images cover twelve cards, and the suit is
 * still DRAWN over the plate rather than generated into it: a picture cannot put
 * the wrong suit on a card if it never carries the suit.
 *
 * Each image is the TOP HALF of the figure. card-art.ts mirrors it into the
 * bottom half itself, so the point symmetry a court card needs is guaranteed by
 * the code and is not something the generator has to get right.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'public', 'cards')

function env() {
  const f = join(ROOT, '.env.local')
  if (!existsSync(f)) return {}
  const out = {}
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return out
}

/**
 * The palette and the framing the deck already uses, stated to the generator so
 * the plate lands in the same deck rather than beside it.
 *
 * The measured problem with the drawn courts was WEIGHT, not draughtsmanship:
 * they carried 38 percent ink against 9.6 for the ranked cards, four times as
 * much, which is why they read as pasted in. So the prompt asks for a light
 * plate on cream, and that is the thing to check on the result before wiring it.
 */
const PALETTE = 'cream paper #f6f2e6, crimson #b8181c, ink black #1a1a1a, antique gold #c8a227'
const FIGURE = {
  J: 'a young knave in a soft plumed cap, holding a halberd',
  Q: 'a queen in a crown, holding a single long stemmed flower',
  K: 'a bearded king in a crown, holding an upright sword',
}
const prompt = (rank) => [
  `The TOP HALF ONLY of a playing card court figure: ${FIGURE[rank]}.`,
  'Head and shoulders down to the waist, cut off cleanly at the bottom edge of the frame.',
  'Flat vector illustration, bold clean shapes, strong even ink outlines, no shading, no gradients, no texture.',
  `Strictly limited palette: ${PALETTE}. No other colours.`,
  'LIGHT overall: mostly cream, with the crimson and gold as detail rather than as large filled areas.',
  'The figure is centred and symmetrical about the vertical axis, facing forward or in clean profile.',
  'Plain flat cream background, no border, no frame, no card edge, no rounded corners.',
  'No text, no letters, no numbers, no suit symbols of any kind.',
  'Vintage playing card engraving redrawn as modern flat vector art.',
].join(' ')

const RANKS = ['J', 'Q', 'K']
const args = process.argv.slice(2)
const dry = args.includes('--dry')
const want = args.filter((a) => RANKS.includes(a.toUpperCase())).map((a) => a.toUpperCase())
const ranks = want.length ? want : RANKS

const E = env()
const provider = E.OPENAI_API_KEY
  ? 'openai'
  : E.REPLICATE_API_TOKEN
    ? 'replicate'
    : E.IDEOGRAM_API_KEY
      ? 'ideogram'
      : E.STABILITY_API_KEY
        ? 'stability'
        : null

if (!provider) {
  console.error('No image key in .env.local. Add ONE of:')
  console.error('  OPENAI_API_KEY=      REPLICATE_API_TOKEN=      IDEOGRAM_API_KEY=      STABILITY_API_KEY=')
  console.error('Then re-run. Until then the deck prints the drawn courts, which is a complete card.')
  process.exit(dry ? 0 : 1)
}
console.log(`provider: ${provider}`)
if (dry) {
  for (const r of ranks) console.log(`\n--- ${r} ---\n${prompt(r)}`)
  process.exit(0)
}

async function openai(p) {
  const r = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${E.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt: p,
      size: '1024x1024',
      // transparent so the plate lands ON the card's own paper rather than
      // bringing its own slightly different cream with it
      background: 'transparent',
      output_format: 'png',
      n: 1,
    }),
  })
  if (!r.ok) throw new Error(`openai ${r.status}: ${(await r.text()).slice(0, 400)}`)
  const j = await r.json()
  return Buffer.from(j.data[0].b64_json, 'base64')
}

async function replicate(p) {
  const start = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-1.1-pro/predictions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${E.REPLICATE_API_TOKEN}`, prefer: 'wait' },
    body: JSON.stringify({ input: { prompt: p, aspect_ratio: '1:1', output_format: 'png' } }),
  })
  if (!start.ok) throw new Error(`replicate ${start.status}: ${(await start.text()).slice(0, 400)}`)
  let j = await start.json()
  while (j.status === 'starting' || j.status === 'processing') {
    await new Promise((s) => setTimeout(s, 2000))
    const poll = await fetch(j.urls.get, { headers: { authorization: `Bearer ${E.REPLICATE_API_TOKEN}` } })
    j = await poll.json()
  }
  if (j.status !== 'succeeded') throw new Error(`replicate ${j.status}: ${JSON.stringify(j.error).slice(0, 300)}`)
  const url = Array.isArray(j.output) ? j.output[0] : j.output
  return Buffer.from(await (await fetch(url)).arrayBuffer())
}

async function ideogram(p) {
  const form = new FormData()
  form.append('prompt', p)
  form.append('rendering_speed', 'QUALITY')
  form.append('aspect_ratio', '1x1')
  const r = await fetch('https://api.ideogram.ai/v1/ideogram-v3/generate', {
    method: 'POST',
    headers: { 'Api-Key': E.IDEOGRAM_API_KEY },
    body: form,
  })
  if (!r.ok) throw new Error(`ideogram ${r.status}: ${(await r.text()).slice(0, 400)}`)
  const j = await r.json()
  return Buffer.from(await (await fetch(j.data[0].url)).arrayBuffer())
}

async function stability(p) {
  const form = new FormData()
  form.append('prompt', p)
  form.append('output_format', 'png')
  form.append('aspect_ratio', '1:1')
  const r = await fetch('https://api.stability.ai/v2beta/stable-image/generate/core', {
    method: 'POST',
    headers: { authorization: `Bearer ${E.STABILITY_API_KEY}`, accept: 'image/*' },
    body: form,
  })
  if (!r.ok) throw new Error(`stability ${r.status}: ${(await r.text()).slice(0, 400)}`)
  return Buffer.from(await r.arrayBuffer())
}

const CALL = { openai, replicate, ideogram, stability }[provider]

mkdirSync(OUT, { recursive: true })
for (const rank of ranks) {
  process.stdout.write(`${rank} ... `)
  try {
    const png = await CALL(prompt(rank))
    const file = join(OUT, `court-${rank.toLowerCase()}.png`)
    writeFileSync(file, png)
    console.log(`${(png.length / 1024).toFixed(0)} KB -> public/cards/court-${rank.toLowerCase()}.png`)
  } catch (e) {
    console.log(`FAILED: ${e.message}`)
  }
}
console.log('\nReload /cards?print&suit=hearts. Any plate that exists is printed; any that does not falls back to the drawn figure.')
console.log('Check the ink weight before keeping one: the ranked cards sit near 10 percent and the drawn courts at 38, which is what made them read as pasted in.')
