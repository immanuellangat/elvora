// End-to-end smoke test: drives the production build in headless Microsoft Edge.
// Usage: npm run build && npx vite preview --port 4173 & node e2e/smoke.mjs [screenshotDir]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.BASE_URL ?? 'http://localhost:4173'
const SHOTS = process.argv[2] ?? 'e2e/screenshots'
mkdirSync(SHOTS, { recursive: true })

const errors = []
const results = []
const step = async (name, fn) => {
  try {
    await fn()
    results.push(`PASS ${name}`)
  } catch (e) {
    results.push(`FAIL ${name}: ${e.message.split('\n').slice(0, 3).join(' | ')}`)
    await page.screenshot({ path: join(SHOTS, `FAIL-${name.replace(/\W+/g, '-')}.png`) }).catch(() => {})
  }
}
const waitText = async (locator, text, msg) => {
  for (let i = 0; i < 40; i++) {
    if ((await locator.textContent()) === text) return
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error(`${msg}: expected ${text}, got ${await locator.textContent()}`)
}
// Current HH:mm, avoiding the last seconds of a minute so the value is still "now" when saved.
const currentHHMM = async () => {
  if (new Date().getSeconds() >= 52) await new Promise((r) => setTimeout(r, (61 - new Date().getSeconds()) * 1000))
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg)
}

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({ viewport: { width: 1360, height: 860 }, colorScheme: 'light' })
const page = await context.newPage()
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`))
const shot = (name) => page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: false })
const today = await (async () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})()

await page.goto(BASE)

await step('onboarding', async () => {
  await page.getByPlaceholder('Your name (optional)').fill('Alex')
  await shot('01-onboarding')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: /Work out/ }).click()
  await page.getByRole('button', { name: /Read 10 pages/ }).click()
  await page.getByRole('button', { name: 'Continue with 2' }).click()
  await page.getByRole('button', { name: /Let's begin/ }).click()
  await page.getByText(/, Alex/).waitFor({ timeout: 5000 })
})

await step('dashboard renders', async () => {
  await page.getByText("Today's mission", { exact: true }).waitFor()
  await page.getByText('Consistency calendar').waitFor()
  await shot('02-dashboard')
})

await step('mission: add, prioritise and complete tasks', async () => {
  await page.goto(`${BASE}/mission`)
  const input = page.getByLabel('New mission')
  await input.fill('Finish chapter 3')
  await page.getByRole('tab', { name: 'High' }).click()
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await input.fill('Email Sam')
  await page.getByRole('tab', { name: 'Low' }).click()
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByRole('button', { name: 'Complete Finish chapter 3' }).click()
  await page.getByRole('button', { name: 'Complete Read 10 pages' }).click()
  await page.getByText(/2 of \d+ done/).waitFor()
  await shot('03-mission')
})

await step('habits: create habit and toggle a past day', async () => {
  await page.goto(`${BASE}/habits`)
  await page.getByRole('button', { name: 'New habit' }).click()
  await page.getByPlaceholder('e.g. Morning stretch').fill('Code 30 min')
  await page.getByRole('button', { name: 'Create habit' }).click()
  await page.getByText('Code 30 min').waitFor()
  const pastDay = page.locator('button[aria-label^="Code 30 min on"]:not([disabled])').first()
  await pastDay.click()
  await shot('04-habits')
})

await step('persistence after reload', async () => {
  await page.reload()
  await page.getByText('Code 30 min').waitFor()
  await page.goto(`${BASE}/mission`)
  await page.getByText('Finish chapter 3').waitFor()
  assert(await page.getByRole('button', { name: 'Undo Finish chapter 3' }).isVisible(), 'completed task should stay completed')
})

await step('skip a habit day without breaking the streak', async () => {
  await page.goto(`${BASE}/habits`)
  const card = page.locator('div.rounded-3xl', { hasText: 'Code 30 min' }).first()
  await card.getByRole('button', { name: 'Skip today' }).click()
  await card.getByRole('button', { name: 'Skipped', exact: true }).waitFor()
  await page.goto(`${BASE}/mission`)
  await page.getByText('Skipped today · rest').waitFor()
  await page.getByRole('button', { name: 'Undo skip for Code 30 min' }).waitFor()
})

await step('habit reminder nudges and can be completed', async () => {
  await page.goto(`${BASE}/habits`)
  await page.getByRole('button', { name: 'New habit' }).click()
  await page.getByPlaceholder('e.g. Morning stretch').fill('Drink water')
  await page.getByRole('switch', { name: 'Daily reminder' }).click()
  await page.getByLabel('Reminder time').fill(await currentHHMM())
  await page.getByRole('button', { name: 'Create habit' }).click()
  const reminder = page.getByRole('status').filter({ hasText: 'Time for Drink water' })
  await reminder.waitFor({ timeout: 20000 })
  await shot('04b-reminder')
  await reminder.getByRole('button', { name: 'Mark Drink water done' }).click()
  await reminder.waitFor({ state: 'detached' })
  await page.getByText('Drink water — done').waitFor()
})

await step('focus timer runs, survives reload, and pauses', async () => {
  await page.goto(`${BASE}/focus`)
  await page.getByLabel('Focus intention').fill('Deep work')
  await page.getByRole('button', { name: 'Start' }).click()
  await page.waitForTimeout(2200)
  const t1 = await page.getByRole('timer').textContent()
  assert(t1 && t1 < '25:00' && t1 >= '24:50', `timer should count down, got ${t1}`)
  await shot('05-focus')
  await page.reload()
  await page.waitForTimeout(1200)
  const t2 = await page.getByRole('timer').textContent()
  assert(t2 && t2 < t1, `timer should keep running after reload (${t1} → ${t2})`)
  await page.getByRole('button', { name: 'Pause' }).click()
  await page.getByRole('button', { name: 'Sounds & music' }).click()
  await page.getByRole('button', { name: /Rain/ }).click()
  await page.getByRole('tab', { name: /Online/ }).click()
  await page.getByText('Groove Salad').waitFor()
  await shot('06-sounds')
  await page.getByRole('tab', { name: /Ambient/ }).click()
  await page.getByRole('button', { name: /Rain/ }).click()
  await page.keyboard.press('Escape')
})

await step('arrows adjust focus and timer lengths', async () => {
  await page.goto(`${BASE}/focus`)
  await page.getByRole('button', { name: 'Reset timer' }).click()
  const timer = page.getByRole('timer')
  await page.getByRole('button', { name: 'Add 1 minute' }).click()
  await page.getByRole('button', { name: 'Add 1 minute' }).click()
  await waitText(timer, '27:00', 'up arrow should add minutes')
  await page.getByRole('button', { name: 'Remove 1 minute' }).click()
  await waitText(timer, '26:00', 'down arrow should remove a minute')
  await page.locator('body').click({ position: { x: 5, y: 400 } })
  await page.keyboard.press('Shift+ArrowDown')
  await waitText(timer, '21:00', 'Shift+↓ should remove 5 minutes')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  await waitText(timer, '25:00', 'keyboard ↑ should add minutes')
  await page.reload()
  await waitText(page.getByRole('timer'), '25:00', 'adjusted length should persist')

  await page.goto(`${BASE}/timer`)
  await page.getByRole('button', { name: '5m', exact: true }).click()
  await page.getByRole('button', { name: 'Add 1 minute' }).click()
  await page.getByText('06:00').waitFor()
  await page.getByRole('spinbutton', { name: 'Timer length' }).focus()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.getByText('04:00').waitFor()
  await shot('07b-timer-arrows')
})

await step('alarm rings, snoozes and stops', async () => {
  await page.goto(`${BASE}/timer`)
  await page.getByRole('button', { name: 'Set an alarm' }).click()
  await page.getByLabel('Alarm time').fill(await currentHHMM())
  await page.getByPlaceholder(/Wake up/).fill('Study time')
  await page.getByRole('button', { name: 'Set alarm' }).click()
  const dialog = page.getByRole('alertdialog')
  await dialog.waitFor({ timeout: 5000 })
  await dialog.getByText('Study time').waitFor()
  await shot('07c-alarm-ringing')
  await dialog.getByRole('button', { name: /Snooze/ }).click()
  await dialog.waitFor({ state: 'detached' })
  await page.getByText('(snoozed)').waitFor()
  // One-time alarm switches itself off after ringing.
  assert(!(await page.getByRole('switch', { name: /Alarm .* on/ }).isVisible()), 'one-time alarm should switch off after ringing')
  await shot('07d-alarms')
})

await step('countdown rings until stopped', async () => {
  await page.goto(`${BASE}/timer`)
  await page.getByLabel('Custom minutes').fill('0.05')
  await page.getByLabel('Custom minutes').press('Enter')
  await page.getByRole('button', { name: 'Start' }).nth(1).click()
  const dialog = page.getByRole('alertdialog')
  await dialog.getByText("Time's up").waitFor({ timeout: 8000 })
  await dialog.getByRole('button', { name: 'Stop' }).click()
  await dialog.waitFor({ state: 'detached' })
})

await step('stopwatch logs a session', async () => {
  await page.goto(`${BASE}/timer`)
  await page.getByLabel('Activity name').first().fill('Reading')
  await page.getByRole('button', { name: 'Start' }).first().click()
  await page.waitForTimeout(1600)
  await page.getByRole('button', { name: 'Save session' }).click()
  await page.getByText(/Saved \d+s/).waitFor()
  await page.locator('li', { hasText: 'Reading' }).first().waitFor()
  await shot('07-timer')
})

await step('workout: complete today or see rest day', async () => {
  await page.goto(`${BASE}/workouts`)
  await page.getByText('Weekly plan').waitFor()
  const labels = await page.locator('button[aria-label^="Complete "]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
  for (const label of labels) {
    await page.getByRole('button', { name: label, exact: true }).click()
    await page.getByRole('button', { name: label.replace('Complete', 'Undo'), exact: true }).waitFor()
  }
  if (labels.length > 0) await page.getByText('Mark as not done').waitFor()
  await shot('08-workouts')
})

await step('day counter', async () => {
  await page.goto(`${BASE}/counters`)
  await page.getByRole('button', { name: 'Start a counter' }).click()
  await page.getByPlaceholder(/No sugar/).fill('No sugar')
  const start = new Date(Date.now() - 16 * 86400000)
  const startKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
  await page.getByLabel('Started on').fill(startKey)
  await page.getByRole('button', { name: 'Start counting' }).click()
  await page.getByText('17', { exact: true }).waitFor()
  await shot('09-counters')
})

await step('diary entry autosaves and persists', async () => {
  await page.goto(`${BASE}/diary/${today}`)
  await page.getByRole('radio', { name: /Good/ }).click()
  await page.getByLabel('Diary entry').fill('Today was calm and productive.')
  await page.locator('span[aria-live="polite"]', { hasText: 'Saved' }).waitFor({ timeout: 5000 })
  await page.reload()
  const value = await page.getByLabel('Diary entry').inputValue()
  assert(value === 'Today was calm and productive.', `diary text should persist, got "${value}"`)
})

await step('diary passcode encrypts and locks', async () => {
  await page.goto(`${BASE}/settings`)
  await page.getByRole('button', { name: 'Set passcode' }).click()
  await page.getByLabel('New passcode').fill('blue-river-42')
  await page.getByLabel('Confirm passcode').fill('blue-river-42')
  await page.getByRole('button', { name: 'Save passcode' }).click()
  await page.getByText('Entries are encrypted with AES-256-GCM.').waitFor()
  const raw = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open('elvora')
        req.onsuccess = () => {
          const tx = req.result.transaction('diary', 'readonly')
          const all = tx.objectStore('diary').getAll()
          all.onsuccess = () => resolve(all.result)
        }
      }),
  )
  assert(raw.length === 1 && raw[0].enc && !raw[0].content, 'stored entry should be encrypted')
  assert(!JSON.stringify(raw).includes('calm and productive'), 'plaintext must not be stored')
  await page.reload()
  await page.goto(`${BASE}/diary`)
  await page.getByText('Your diary is locked').waitFor()
  await page.getByLabel('Passcode').fill('wrong-code')
  await page.getByRole('button', { name: 'Unlock' }).click()
  await page.getByText("That passcode didn't match").waitFor()
  await shot('10-diary-locked')
  await page.getByLabel('Passcode').fill('blue-river-42')
  await page.getByRole('button', { name: 'Unlock' }).click()
  await page.getByText('Today was calm and productive.').waitFor()
  await shot('11-diary')
})

await step('evening reflection creates tomorrow missions', async () => {
  await page.goto(`${BASE}/reflect`)
  // A full page load locks the diary again (the key lives only in memory).
  await page.getByLabel('Passcode').fill('blue-river-42')
  await page.getByRole('button', { name: 'Unlock' }).click()
  await page.getByText('Finish chapter 3').first().waitFor()
  await shot('12-reflect-summary')
  await page.getByRole('button', { name: 'Begin' }).click()
  await page.getByRole('button', { name: 'Insert from today' }).click()
  await page.getByLabel('2. What challenges did I face?').fill('Got distracted after lunch.')
  await page.getByLabel('3. What do I want to achieve tomorrow?').fill('Outline chapter 4\nGo for a 20-minute walk')
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByText('Outline chapter 4').waitFor()
  await page.getByText('Email Sam').waitFor()
  await page.getByLabel('Email Sam').check().catch(() => page.locator('label', { hasText: 'Email Sam' }).locator('input').check())
  await shot('13-reflect-plan')
  await page.getByRole('button', { name: 'Save reflection' }).click()
  await page.getByText('Reflection saved').waitFor()
  await page.getByRole('button', { name: "See tomorrow's mission" }).click()
  await page.getByText('Outline chapter 4').waitFor()
  await page.getByText('Go for a 20-minute walk').waitFor()
  await page.getByText('Email Sam').waitFor()
  await shot('14-tomorrow')
})

await step('carry forward from earlier days', async () => {
  const y = new Date(Date.now() - 86400000)
  const yKey = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`
  await page.goto(`${BASE}/mission?date=${yKey}`)
  await page.getByLabel('New mission').fill('Old unfinished task')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByText('Old unfinished task').waitFor()
  await page.goto(`${BASE}/mission`)
  await page.getByText(/1 unfinished/).waitFor()
  await page.getByRole('button', { name: 'Review' }).click()
  await page.getByRole('button', { name: 'Select all' }).click()
  await page.getByRole('button', { name: 'Bring to today' }).click()
  await page.getByText('Carried forward').waitFor()
})

await step('weekly review summarises the week', async () => {
  await page.goto(`${BASE}/review`)
  await page.getByText('Habit consistency').waitFor()
  await page.getByRole('table').getByText('Code 30 min').waitFor()
  await page.getByText('Insights').waitFor()
  await page.getByText(/strongest day this week/).waitFor()
  await shot('14b-review')
  await page.getByRole('button', { name: 'Previous week' }).click()
  await page.getByRole('button', { name: 'Last week' }).waitFor()
})

await step('dark mode + mobile layout', async () => {
  await page.goto(BASE)
  await page.getByRole('button', { name: 'Switch to dark mode' }).click()
  await page.waitForTimeout(400)
  assert(await page.evaluate(() => document.documentElement.classList.contains('dark')), 'dark class applied')
  await shot('15-dashboard-dark')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await page.waitForTimeout(500)
  assert(await page.evaluate(() => document.documentElement.classList.contains('dark')), 'dark mode persisted')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  assert(overflow <= 1, `no horizontal scroll on mobile (overflow ${overflow}px)`)
  await shot('16-mobile-dashboard')
  await page.goto(`${BASE}/mission`)
  await page.waitForTimeout(400)
  await shot('17-mobile-mission')
  await page.goto(`${BASE}/review`)
  await page.waitForTimeout(500)
  const reviewOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  assert(reviewOverflow <= 1, `review page should not scroll sideways on mobile (${reviewOverflow}px)`)
  await shot('17b-mobile-review')
  await page.getByRole('button', { name: 'More', exact: true }).click()
  await page.waitForTimeout(400)
  await shot('18-mobile-more')
})

await step('works offline after first load', async () => {
  await page.evaluate(() => navigator.serviceWorker.ready)
  await context.setOffline(true)
  await page.goto(`${BASE}/habits`)
  await page.getByText('Code 30 min').waitFor({ timeout: 5000 })
  await page.goto(`${BASE}/focus`)
  await page.getByRole('timer').waitFor()
  await context.setOffline(false)
})

console.log(results.join('\n'))
const relevant = errors.filter((e) => !/somafm|youtube|ERR_INTERNET_DISCONNECTED|net::/i.test(e))
console.log(relevant.length ? `\nBrowser errors:\n${relevant.join('\n')}` : '\nNo browser errors.')
await browser.close()
process.exit(results.some((r) => r.startsWith('FAIL')) || relevant.length ? 1 : 0)
