/**
 * vision-compare.mjs
 *
 * Runs the same image through Claude (current) and challenger models via OpenRouter,
 * using the exact prompts from production code. Scores each output for JSON completeness.
 *
 * Usage:
 *   node scripts/vision-compare.mjs <test-name> <image-path>
 *
 * test-name: vehicle | listing | receipt
 *
 * Examples:
 *   node scripts/vision-compare.mjs vehicle ~/Desktop/vin-sticker.jpg
 *   node scripts/vision-compare.mjs listing ~/Desktop/listing-flyer.png
 *   node scripts/vision-compare.mjs receipt ~/Desktop/repair-receipt.jpg
 *
 * Requires in .env.local:
 *   ANTHROPIC_API_KEY
 *   DEEPSEEK_API_KEY   (OpenRouter key)
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// ── Load .env.local ────────────────────────────────────────────────────────────
const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../.env.local')
const envVars = fs.readFileSync(envPath, 'utf8')
  .split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .reduce((acc, l) => {
    const [k, ...v] = l.split('=')
    acc[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '')
    return acc
  }, {})

const ANTHROPIC_KEY   = envVars.ANTHROPIC_API_KEY
const OPENROUTER_KEY  = envVars.DEEPSEEK_API_KEY  // repurposed slot

if (!ANTHROPIC_KEY)  { console.error('Missing ANTHROPIC_API_KEY in .env.local'); process.exit(1) }
if (!OPENROUTER_KEY) { console.error('Missing DEEPSEEK_API_KEY (OpenRouter key) in .env.local'); process.exit(1) }

// ── Challenger models to test via OpenRouter ───────────────────────────────────
const CHALLENGERS = [
  { id: 'google/gemini-2.0-flash-lite-001',        label: 'Gemini 2.0 Flash Lite', inM: 0.075,  outM: 0.30  },
  { id: 'amazon/nova-lite-v1',                     label: 'Amazon Nova Lite',       inM: 0.06,   outM: 0.24  },
  { id: 'openai/gpt-5-nano',                       label: 'GPT-5 Nano',             inM: 0.05,   outM: 0.40  },
  { id: 'google/gemini-2.0-flash-001',             label: 'Gemini 2.0 Flash',       inM: 0.10,   outM: 0.40  },
]

// ── Claude baselines ───────────────────────────────────────────────────────────
const CLAUDE_HAIKU = { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', inM: 0.80,  outM: 4.00 }
const CLAUDE_OPUS  = { id: 'claude-opus-4-5',           label: 'Claude Opus 4.5',  inM: 15.00, outM: 75.00 }

// ── Test definitions (exact prompts from production) ──────────────────────────
const TESTS = {
  vehicle: {
    label: 'Vehicle Intake Scan (VIN / window sticker)',
    claudeModel: CLAUDE_OPUS,
    maxTokens: 512,
    prompt: `Extract vehicle information from this image. Look for: VIN (17-character code), year, make, brand, model, trim level, and odometer/mileage reading. Return ONLY valid JSON with these exact keys (use null if not found): { "vin": string|null, "year": number|null, "make": string|null, "model": string|null, "trim": string|null, "mileage": number|null }. If you see a VIN, include all 17 characters exactly as shown. Do not include any text outside the JSON object.`,
    expectedKeys: ['vin', 'year', 'make', 'model', 'trim', 'mileage'],
  },
  listing: {
    label: 'RE Listing Photo Parse (flyer / MLS sheet)',
    claudeModel: CLAUDE_OPUS,
    maxTokens: 512,
    prompt: `Extract real estate listing information from this image or flyer.\nReturn ONLY valid JSON with these exact keys (use null if not found):\n{\n  "address_line1": "string|null",\n  "city": "string|null",\n  "state": "string|null",\n  "zip": "string|null",\n  "price": "number|null",\n  "bedrooms": "number|null",\n  "bathrooms": "number|null",\n  "sqft": "number|null",\n  "year_built": "number|null",\n  "property_type": "string|null",\n  "mls_number": "string|null",\n  "listing_agent": "string|null"\n}\nDo not include any text outside the JSON object.`,
    expectedKeys: ['address_line1', 'city', 'state', 'zip', 'price', 'bedrooms', 'bathrooms', 'sqft', 'year_built', 'property_type', 'mls_number', 'listing_agent'],
  },
  receipt: {
    label: 'Receipt OCR & Classification',
    claudeModel: CLAUDE_HAIKU,
    maxTokens: 900,
    systemPrompt: `You are a receipt OCR and bookkeeping classification engine for small independent used-car dealers.\nCRITICAL: Output ONLY a single raw JSON object. No markdown, no code fences, no explanation before or after.`,
    prompt: `Extract all data from this receipt image and classify it into a dealer bookkeeping category.\n\nAvailable categories:\n  {"id":"parts","name":"Parts & Supplies","requires_vehicle":true}\n  {"id":"labor","name":"Labor / Recon","requires_vehicle":true}\n  {"id":"transport","name":"Transport / Tow","requires_vehicle":false}\n  {"id":"fuel","name":"Fuel","requires_vehicle":false}\n  {"id":"office","name":"Office / Admin","requires_vehicle":false}\n  {"id":"other","name":"Other","requires_vehicle":false}\n\nReturn JSON: { "vendor": string|null, "date": string|null (YYYY-MM-DD), "total": number|null, "tax": number|null, "category_id": string, "description": string|null }`,
    expectedKeys: ['vendor', 'date', 'total', 'tax', 'category_id', 'description'],
  },
}

// ── Claude API call ────────────────────────────────────────────────────────────
async function callClaude(test, imageBase64, mimeType) {
  const t0 = Date.now()
  const body = {
    model: test.claudeModel.id,
    max_tokens: test.maxTokens,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
        { type: 'text', text: test.prompt },
      ],
    }],
  }
  if (test.systemPrompt) body.system = test.systemPrompt

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`Claude ${res.status}: ${JSON.stringify(data.error)}`)
  const ms = Date.now() - t0
  const inTokens = data.usage?.input_tokens ?? 0
  const outTokens = data.usage?.output_tokens ?? 0
  const cost = (inTokens / 1e6 * test.claudeModel.inM) + (outTokens / 1e6 * test.claudeModel.outM)
  return { text: data.content?.[0]?.text ?? '', ms, inTokens, outTokens, cost }
}

// ── OpenRouter API call ────────────────────────────────────────────────────────
async function callOpenRouter(model, test, imageBase64, mimeType) {
  const t0 = Date.now()
  const messages = []
  if (test.systemPrompt) messages.push({ role: 'system', content: test.systemPrompt })
  messages.push({
    role: 'user',
    content: [
      { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
      { type: 'text', text: test.prompt },
    ],
  })

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENROUTER_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: model.id, max_tokens: test.maxTokens, messages }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${JSON.stringify(data.error)}`)
  const ms = Date.now() - t0
  const inTokens = data.usage?.prompt_tokens ?? 0
  const outTokens = data.usage?.completion_tokens ?? 0
  const cost = (inTokens / 1e6 * model.inM) + (outTokens / 1e6 * model.outM)
  return { text: data.choices?.[0]?.message?.content ?? '', ms, inTokens, outTokens, cost }
}

// ── Scoring ───────────────────────────────────────────────────────────────────
function scoreOutput(raw, expectedKeys) {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return { valid: false, score: 0, parsed: null, filled: 0, total: expectedKeys.length }
  let parsed
  try { parsed = JSON.parse(match[0]) } catch { return { valid: false, score: 0, parsed: null, filled: 0, total: expectedKeys.length } }
  const filled = expectedKeys.filter(k => parsed[k] !== null && parsed[k] !== undefined && parsed[k] !== '').length
  return { valid: true, score: Math.round((filled / expectedKeys.length) * 100), parsed, filled, total: expectedKeys.length }
}

function bar(score) {
  const n = Math.round(score / 10)
  return '█'.repeat(n) + '░'.repeat(10 - n)
}

function fmt(result, score, modelLabel, modelPricing) {
  const costStr = result.cost < 0.0001 ? '<$0.0001' : `$${result.cost.toFixed(4)}`
  return [
    `  Model  : ${modelLabel}`,
    `  Score  : ${bar(score.score)} ${score.score}% (${score.filled}/${score.total} fields) | JSON valid: ${score.valid ? '✓' : '✗'}`,
    `  Latency: ${result.ms}ms`,
    `  Tokens : ${result.inTokens} in / ${result.outTokens} out`,
    `  Cost   : ${costStr}/call  (list: $${modelPricing.inM}/M in, $${modelPricing.outM}/M out)`,
  ].join('\n')
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const [,, testName, imagePath] = process.argv

  if (!testName || !imagePath || !TESTS[testName]) {
    console.log('Usage: node scripts/vision-compare.mjs <vehicle|listing|receipt> <image-path>')
    console.log('Tests: vehicle (VIN/sticker), listing (RE flyer), receipt (expense receipt)')
    process.exit(1)
  }

  const test = TESTS[testName]
  const absPath = path.resolve(imagePath)
  if (!fs.existsSync(absPath)) { console.error(`Image not found: ${absPath}`); process.exit(1) }

  const imageBuffer = fs.readFileSync(absPath)
  const imageBase64 = imageBuffer.toString('base64')
  const ext = path.extname(absPath).toLowerCase()
  const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.heic': 'image/heic' }
  const mimeType = mimeMap[ext] ?? 'image/jpeg'

  console.log(`\n${'═'.repeat(65)}`)
  console.log(`TEST    : ${test.label}`)
  console.log(`IMAGE   : ${path.basename(absPath)} (${Math.round(imageBuffer.length / 1024)}KB)`)
  console.log(`BASELINE: ${test.claudeModel.label} ($${test.claudeModel.inM}/$${test.claudeModel.outM} per M tokens)`)
  console.log(`${'═'.repeat(65)}\n`)
  console.log('Running all models in parallel...\n')

  // Run Claude + all challengers in parallel
  const [claudeSettled, ...challengerSettled] = await Promise.allSettled([
    callClaude(test, imageBase64, mimeType),
    ...CHALLENGERS.map(m => callOpenRouter(m, test, imageBase64, mimeType)),
  ])

  // ── Claude result ──
  console.log(`${'─'.repeat(65)}`)
  console.log(`BASELINE — ${test.claudeModel.label}`)
  console.log(`${'─'.repeat(65)}`)
  let claudeScore = { score: 0, valid: false, filled: 0, total: test.expectedKeys.length, parsed: null }
  if (claudeSettled.status === 'rejected') {
    console.log(`  ERROR: ${claudeSettled.reason}`)
  } else {
    claudeScore = scoreOutput(claudeSettled.value.text, test.expectedKeys)
    console.log(fmt(claudeSettled.value, claudeScore, test.claudeModel.label, test.claudeModel))
    if (claudeScore.parsed) {
      console.log('  Output:')
      console.log('  ' + JSON.stringify(claudeScore.parsed, null, 2).replace(/\n/g, '\n  '))
    } else {
      console.log('  Raw:', claudeSettled.value.text.slice(0, 200))
    }
  }

  // ── Challenger results ──
  const scores = []
  for (let i = 0; i < CHALLENGERS.length; i++) {
    const model = CHALLENGERS[i]
    const settled = challengerSettled[i]
    console.log(`\n${'─'.repeat(65)}`)
    console.log(`CHALLENGER — ${model.label}`)
    console.log(`${'─'.repeat(65)}`)

    if (settled.status === 'rejected') {
      console.log(`  ERROR: ${settled.reason}`)
      scores.push({ model, score: 0, valid: false, error: true })
      continue
    }

    const s = scoreOutput(settled.value.text, test.expectedKeys)
    scores.push({ model, result: settled.value, score: s })
    console.log(fmt(settled.value, s, model.label, model))
    if (s.parsed) {
      console.log('  Output:')
      console.log('  ' + JSON.stringify(s.parsed, null, 2).replace(/\n/g, '\n  '))
    } else {
      console.log('  Raw:', settled.value.text.slice(0, 200))
    }
  }

  // ── Leaderboard ──
  console.log(`\n${'═'.repeat(65)}`)
  console.log('LEADERBOARD (sorted by quality score)')
  console.log(`${'═'.repeat(65)}`)
  console.log(`  ${'Model'.padEnd(26)} ${'Score'.padEnd(8)} ${'Latency'.padEnd(10)} Cost/call  Savings vs baseline`)

  const baselineCostPerCall = claudeSettled.status === 'fulfilled' ? claudeSettled.value.cost : 0
  const baselineScore = claudeScore.score

  const all = [
    { label: test.claudeModel.label, score: claudeScore.score, ms: claudeSettled.status === 'fulfilled' ? claudeSettled.value.ms : 0, cost: baselineCostPerCall, savings: '—', baseline: true },
    ...scores.filter(s => !s.error).map(s => ({
      label: s.model.label,
      score: s.score.score,
      ms: s.result.ms,
      cost: s.result.cost,
      savings: baselineCostPerCall > 0 ? `${Math.round((1 - s.result.cost / baselineCostPerCall) * 100)}%` : '?',
    })),
  ].sort((a, b) => b.score - a.score)

  for (const row of all) {
    const scoreDiff = row.baseline ? '' : (row.score >= baselineScore ? ` ✓ (+${row.score - baselineScore}pts)` : ` ✗ (-${baselineScore - row.score}pts)`)
    const costStr = row.cost < 0.0001 ? '<$0.0001' : `$${row.cost.toFixed(5)}`
    console.log(`  ${row.label.padEnd(26)} ${String(row.score + '%').padEnd(8)} ${String(row.ms + 'ms').padEnd(10)} ${costStr.padEnd(11)} ${row.savings}${scoreDiff}`)
  }

  console.log(`\n${'═'.repeat(65)}\n`)
}

main().catch(e => { console.error(e); process.exit(1) })
