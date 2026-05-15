# 📖 StealthBrowser — Complete User Guide

> Everything you need to know: how the browser works, how sessions are saved, how to automate tasks step by step.

---

## Table of Contents

1. [How the Browser Works](#1-how-the-browser-works)
2. [Staying Logged In (Persistent Profiles)](#2-staying-logged-in-persistent-profiles)
3. [Your First Automation — Step by Step](#3-your-first-automation--step-by-step)
4. [Writing Scripts](#4-writing-scripts)
5. [Common Automation Recipes](#5-common-automation-recipes)
6. [Scheduling with Cron](#6-scheduling-with-cron)
7. [Understanding Live Logs](#7-understanding-live-logs)
8. [Anti-Detect Explained](#8-anti-detect-explained)
9. [Tips & Best Practices](#9-tips--best-practices)

---

## 1. How the Browser Works

StealthBrowser runs **Playwright Chromium** under the hood — the same browser engine as Chrome, but controlled by code.

### Two modes of operation

| Mode | What it does | Use when |
|---|---|---|
| **Ephemeral** *(default)* | Fresh browser every run — no memory, no cookies | Public scraping, one-off tasks |
| **Persistent Profile** | Browser remembers cookies/login between runs | Sites requiring login, repeated tasks |

### What happens when you run a task

```
You click ▶ Run
        │
        ▼
StealthBrowser launches a Chromium browser
        │
        ▼
Your script runs inside it
(page.goto, page.click, page.fill, etc.)
        │
        ▼
Script finishes → browser closes
  • Ephemeral mode: all cookies deleted
  • Persistent mode: cookies SAVED to disk ✅
        │
        ▼
Logs stream to your dashboard in real time
```

---

## 2. Staying Logged In (Persistent Profiles)

This is the most important feature for real automation.

### The problem
Without profiles, every task run starts fresh — like opening an incognito window. The site asks you to login every single time.

### The solution: Profiles
A **profile** is a folder saved on the server that stores:
- 🍪 **Cookies** — login tokens, session IDs
- 💾 **localStorage** — user preferences, auth tokens
- 🗄️ **IndexedDB** — offline data, cached data
- 🔐 **Session storage** — temporary auth state

When you assign a profile to a task, the browser loads all of this from disk before running — so the site sees you as already logged in.

### Setting up a profile (Step by Step)

#### Step 1 — Create a profile via API
```bash
curl -X POST http://localhost:3001/api/profiles \
  -H "Content-Type: application/json" \
  -d '{"name": "Twitter Account", "description": "My main Twitter login"}'
```
Response:
```json
{
  "data": { "id": "abc-123-...", "name": "Twitter Account" },
  "message": "Profile created. Use this profileId in your tasks to stay logged in."
}
```

#### Step 2 — Write a "login once" script
```javascript
// Script: twitter-login-setup
// Run this ONCE to save your login to the profile

await page.goto('https://twitter.com/login');

// Fill in credentials
await page.fill('input[name="text"]', 'your_username');
await page.click('[data-testid="LoginForm_Login_Button"]');
await page.waitForTimeout(1000);

await page.fill('input[name="password"]', 'your_password');
await page.click('[data-testid="LoginForm_Login_Button"]');

// Wait for login to complete
await page.waitForURL('**/home', { timeout: 15000 });
log.success('Logged in! Session saved to profile.');

// At this point, all cookies are saved to the profile folder on disk.
// Next time you run any task with this profileId, you'll already be logged in.
```

#### Step 3 — Run the login script WITH your profileId
```bash
curl -X POST http://localhost:3001/api/tasks/YOUR_TASK_ID/run \
  -H "Content-Type: application/json" \
  -d '{"profileId": "abc-123-..."}'
```

#### Step 4 — All future tasks use the same profileId
```javascript
// Script: twitter-post-daily
// This runs with the same profileId — already logged in!

await page.goto('https://twitter.com/home');
// No login needed — we're already in ✅

const name = await page.textContent('[data-testid="UserName"]');
log.success(`Logged in as: ${name}`);

// Now do your automation...
await page.click('[data-testid="SideNav_NewTweet_Button"]');
await page.fill('.public-DraftEditor-content', 'Automated tweet!');
// etc.
```

---

## 3. Your First Automation — Step by Step

Let's automate something real from scratch: **scraping the top posts from Hacker News every day**.

### Step 1 — Open StealthBrowser
Go to `http://localhost:5173`

---

### Step 2 — Create a Script

1. Click **Scripts** in the left sidebar
2. Click **+ New Script** (or the `+` button at top)
3. Fill in:
   - **Name:** `HackerNews Top Stories`
   - **Description:** `Scrapes top 10 stories from HN daily`
4. Replace the code with:

```javascript
// Scrape top 10 stories from Hacker News
log.info('Starting HackerNews scraper...');

await page.goto('https://news.ycombinator.com', {
  waitUntil: 'domcontentloaded'
});

log.info('Page loaded, extracting stories...');

// Extract story titles, links, and scores
const stories = await page.$$eval('.athing', (rows) => {
  return rows.slice(0, 10).map(row => {
    const titleEl  = row.querySelector('.titleline > a');
    const scoreEl  = row.nextElementSibling?.querySelector('.score');
    return {
      title: titleEl?.innerText || 'N/A',
      url:   titleEl?.href     || 'N/A',
      score: scoreEl?.innerText || '0 points',
    };
  });
});

log.success(`Found ${stories.length} stories:`);
stories.forEach((s, i) => {
  log.info(`${i + 1}. [${s.score}] ${s.title}`);
  log.info(`   → ${s.url}`);
});

log.success('Done!');
```

5. Click **Create Script** ✅

---

### Step 3 — Create a Task

1. Click **Tasks** in the left sidebar
2. Click **+ New Task**
3. Fill in:
   - **Name:** `Daily HN Scrape`
   - **Script:** select `HackerNews Top Stories`
   - **Cron Expression:** `0 9 * * *` *(runs every day at 9 AM)*
4. Click **Create Task** ✅

---

### Step 4 — Run it now (to test)

1. Find your task in the list
2. Click the **▶ Run Now** button
3. Switch to **Dashboard** — watch the Live Output panel
4. You'll see logs streaming in real time:
   ```
   08:05:01  INFO  Starting HackerNews scraper...
   08:05:02  INFO  Page loaded, extracting stories...
   08:05:03  SUCCESS  Found 10 stories:
   08:05:03  INFO  1. [342 points] Some Cool Article
   08:05:03  INFO     → https://example.com/article
   ...
   08:05:04  SUCCESS  Done!
   ```

---

### Step 5 — Let it run on schedule

The cron `0 9 * * *` means it will automatically run every morning at 9 AM. No action needed — StealthBrowser handles it.

You can check **Logs** anytime to see past runs.

---

## 4. Writing Scripts

### Available globals

Every script automatically gets these variables — no imports needed:

```javascript
// ── page ─────────────────────────────────────────────────────────────────────
// A Playwright Page object (the browser tab)
// Full docs: https://playwright.dev/docs/api/class-page

await page.goto('https://example.com');          // navigate
await page.click('#submit-button');              // click element
await page.fill('input[name="email"]', 'a@b.c'); // type into input
await page.selectOption('select#country', 'US'); // select dropdown
await page.check('input[type="checkbox"]');      // check checkbox
await page.screenshot({ path: '/tmp/ss.png' }); // take screenshot
await page.waitForSelector('.loaded');           // wait for element
await page.waitForTimeout(2000);                 // wait 2 seconds
await page.waitForNavigation();                  // wait for page load

const text  = await page.textContent('h1');      // read text
const value = await page.inputValue('#email');   // read input value
const html  = await page.content();              // get full HTML
const title = await page.title();                // get page title
const url   = page.url();                        // current URL

// ── log ──────────────────────────────────────────────────────────────────────
// Stream messages to the dashboard in real time

log('hello world');              // blue info message
log.info('blue info message');
log.success('green success');
log.warn('yellow warning');
log.error('red error');

// ── sleep ─────────────────────────────────────────────────────────────────────
await sleep(1000);  // wait 1 second (same as page.waitForTimeout)
await sleep(3000);  // wait 3 seconds

// ── console ──────────────────────────────────────────────────────────────────
console.log('same as log.info');
console.warn('same as log.warn');
console.error('same as log.error');

// ── fetch ─────────────────────────────────────────────────────────────────────
// Native Node.js fetch — use for API calls without opening a browser page
const res  = await fetch('https://api.example.com/data');
const json = await res.json();
log.info(JSON.stringify(json));
```

---

### CSS Selectors Cheat Sheet

Finding elements is the core of any automation:

```javascript
// By ID
await page.click('#submit');
await page.click('#login-button');

// By class
await page.click('.btn-primary');
await page.fill('.search-input', 'query');

// By element type
await page.click('button');
await page.fill('input', 'text');
await page.click('a');

// By attribute
await page.click('[type="submit"]');
await page.fill('[name="email"]', 'user@example.com');
await page.click('[data-testid="login-btn"]');
await page.fill('[placeholder="Enter email"]', 'user@example.com');

// By text content
await page.click('text=Sign In');
await page.click('button:has-text("Submit")');
await page.click('a:has-text("Click here")');

// Combining selectors
await page.click('form#login input[name="password"]');
await page.click('.modal button.btn-primary');

// XPath (when CSS doesn't work)
await page.click('xpath=//button[contains(text(),"Login")]');

// Get multiple elements
const items = await page.$$eval('.product-title', els => els.map(e => e.textContent));
```

---

### Waiting Strategies

Never use fixed sleeps if you can wait for something specific:

```javascript
// ✅ Good — wait for an element to appear
await page.waitForSelector('.dashboard', { timeout: 10000 });

// ✅ Good — wait for URL to change after login
await page.waitForURL('**/dashboard**');

// ✅ Good — wait for network to settle
await page.goto('https://example.com', { waitUntil: 'networkidle' });

// ✅ Good — wait for text to appear
await page.waitForSelector('text=Welcome back');

// ✅ Good — wait for element to disappear (loading spinner)
await page.waitForSelector('.loading-spinner', { state: 'hidden' });

// ⚠️ OK as fallback — fixed wait
await sleep(2000);
```

---

## 5. Common Automation Recipes

### 📧 Login and scrape private data

```javascript
// Step 1: Login (run once with your profileId to save session)
await page.goto('https://app.example.com/login');
await page.fill('#email',    'you@example.com');
await page.fill('#password', 'yourpassword');
await page.click('button[type="submit"]');
await page.waitForURL('**/dashboard');
log.success('Logged in and session saved!');
```

```javascript
// Step 2: Subsequent runs — already logged in via profileId
await page.goto('https://app.example.com/dashboard');

// Scrape your private data
const balance = await page.textContent('.account-balance');
log.success(`Balance: ${balance}`);

const transactions = await page.$$eval('.transaction-row', rows =>
  rows.map(r => ({
    date:   r.querySelector('.date')?.innerText,
    amount: r.querySelector('.amount')?.innerText,
    desc:   r.querySelector('.description')?.innerText,
  }))
);
log.info(JSON.stringify(transactions, null, 2));
```

---

### 📋 Fill and submit a form

```javascript
await page.goto('https://example.com/contact');

await page.fill('input[name="name"]',    'John Doe');
await page.fill('input[name="email"]',   'john@example.com');
await page.fill('input[name="phone"]',   '+1234567890');
await page.fill('textarea[name="msg"]',  'Hello, this is automated.');
await page.selectOption('select[name="subject"]', 'Support');
await page.check('input[name="agree"]');

await page.click('button[type="submit"]');
await page.waitForSelector('.success-message');

const confirmation = await page.textContent('.success-message');
log.success(`Form submitted: ${confirmation}`);
```

---

### 🛒 Monitor a product price

```javascript
await page.goto('https://www.amazon.com/dp/PRODUCT_ID');

// Wait for price to load
await page.waitForSelector('.a-price-whole', { timeout: 10000 });

const price = await page.textContent('.a-price-whole');
const priceNum = parseFloat(price.replace(/[^0-9.]/g, ''));

log.info(`Current price: $${priceNum}`);

if (priceNum < 50) {
  log.success(`🎉 PRICE ALERT! Price dropped to $${priceNum}`);
  // Add notification logic here (email API, webhook, etc.)
} else {
  log.warn(`Price is $${priceNum} — not on sale yet`);
}
```

---

### 📊 Scrape a table of data

```javascript
await page.goto('https://example.com/data-table');
await page.waitForSelector('table');

const rows = await page.$$eval('table tbody tr', rows =>
  rows.map(row => {
    const cells = [...row.querySelectorAll('td')];
    return cells.map(c => c.innerText.trim());
  })
);

log.success(`Scraped ${rows.length} rows`);
rows.forEach((row, i) => {
  log.info(`Row ${i + 1}: ${row.join(' | ')}`);
});
```

---

### 📸 Take a screenshot of a page

```javascript
await page.goto('https://news.ycombinator.com');
await page.waitForLoadState('networkidle');

await page.screenshot({
  path: '/tmp/screenshot.png',
  fullPage: true   // capture entire scrollable page
});

log.success('Screenshot saved to /tmp/screenshot.png');
```

---

### 🔁 Loop through multiple pages

```javascript
const baseUrl = 'https://quotes.toscrape.com/page/';
const allQuotes = [];

for (let pageNum = 1; pageNum <= 5; pageNum++) {
  log.info(`Scraping page ${pageNum}...`);

  await page.goto(`${baseUrl}${pageNum}/`);
  await page.waitForSelector('.quote');

  const quotes = await page.$$eval('.quote', els =>
    els.map(e => ({
      text:   e.querySelector('.text')?.innerText,
      author: e.querySelector('.author')?.innerText,
    }))
  );

  allQuotes.push(...quotes);
  log.info(`Page ${pageNum}: got ${quotes.length} quotes`);

  await sleep(1000); // be polite — don't hammer the server
}

log.success(`Total: ${allQuotes.length} quotes collected`);
allQuotes.forEach(q => log.info(`"${q.text}" — ${q.author}`));
```

---

### ⌨️ Handle popups, dialogs, modals

```javascript
// Accept a browser alert/confirm dialog automatically
page.on('dialog', async dialog => {
  log.warn(`Dialog: ${dialog.message()}`);
  await dialog.accept();  // or dialog.dismiss()
});

await page.goto('https://example.com');
await page.click('#show-alert');
```

---

### 🍪 Check if already logged in

```javascript
// Smart login: only login if session expired
await page.goto('https://example.com');

// Check if we're already on the dashboard
const isLoggedIn = await page.$('.user-dashboard') !== null;

if (isLoggedIn) {
  log.success('Already logged in! Skipping login step.');
} else {
  log.info('Not logged in, logging in now...');
  await page.goto('https://example.com/login');
  await page.fill('#email', 'you@example.com');
  await page.fill('#password', 'yourpassword');
  await page.click('[type="submit"]');
  await page.waitForURL('**/dashboard');
  log.success('Login complete. Session saved.');
}

// Continue with your task...
```

---

## 6. Scheduling with Cron

Set a **Cron Expression** when creating a task to run it automatically.

### Cron format
```
┌──────── minute       (0–59)
│  ┌───── hour         (0–23)
│  │  ┌── day of month (1–31)
│  │  │  ┌─ month      (1–12)
│  │  │  │  ┌ day of week (0–7, both 0 and 7 = Sunday)
│  │  │  │  │
*  *  *  *  *
```

### Common schedules

| Expression | Meaning |
|---|---|
| `* * * * *` | Every minute |
| `*/5 * * * *` | Every 5 minutes |
| `*/15 * * * *` | Every 15 minutes |
| `0 * * * *` | Every hour on the hour |
| `0 9 * * *` | Every day at 9:00 AM |
| `0 9 * * 1-5` | Weekdays at 9:00 AM |
| `0 9 * * 1` | Every Monday at 9:00 AM |
| `0 0 * * *` | Every day at midnight |
| `0 9,17 * * *` | Daily at 9 AM and 5 PM |
| `*/30 9-17 * * 1-5` | Every 30 min during business hours |
| `0 0 1 * *` | First day of every month |
| `0 0 * * 0` | Every Sunday at midnight |

> 💡 Test your cron expressions: **https://crontab.guru**

---

## 7. Understanding Live Logs

Every script has access to the `log` function which streams messages to your dashboard in real time.

### Log levels

| Level | Color | Use for |
|---|---|---|
| `log.info()` | 🔵 Blue | General progress messages |
| `log.success()` | 🟢 Green | Task completed, data found, goals achieved |
| `log.warn()` | 🟡 Yellow | Non-critical issues, retries, skipped items |
| `log.error()` | 🔴 Red | Errors, failures, things that went wrong |

### Good logging practice

```javascript
// ✅ Good — log progress at each key step
log.info('Starting price monitor...');
await page.goto('https://shop.example.com/product');
log.info('Page loaded');

const price = await page.textContent('.price');
log.info(`Current price: ${price}`);

if (parseFloat(price) < 30) {
  log.success(`🎉 Price alert! Now only ${price}`);
} else {
  log.warn(`Price is ${price} — no discount yet`);
}

log.success('Done ✓');
```

---

## 8. Anti-Detect Explained

StealthBrowser applies these protections on every launch to avoid detection:

### What websites detect
Sites use "fingerprinting" to identify and block bots:
- Is `navigator.webdriver` set? (tells them it's automated)
- What's the user agent? (is it a real browser?)
- Does canvas drawing look identical every time?
- Does `navigator.plugins` have entries?
- What timezone/locale is set?

### What we do about it

| Detection Method | Our Defense |
|---|---|
| `navigator.webdriver = true` | We set it to `false` |
| Automation flags in Chrome args | `--disable-blink-features=AutomationControlled` |
| Blank plugin list | We inject a fake PluginArray |
| Static canvas fingerprint | We add tiny random noise to every canvas draw |
| Static user agent | We rotate from a pool of real browser UAs |
| Static viewport | We randomize viewport per session |
| Static timezone | We randomize to a realistic timezone |
| `hardwareConcurrency` giveaway | We spoof to 4/8/16 (common values) |

### When anti-detect is not enough
Some sites use advanced services (Cloudflare, DataDome, PerimeterX). Options:
1. **Use a real residential proxy** — set in Settings → Proxy URL
2. **Slow down** — add `await sleep(2000)` between actions to mimic human speed
3. **Use persistent profiles** — a profile that has browsed normally looks more legitimate

---

## 9. Tips & Best Practices

### ✅ Always do

```javascript
// Wait for elements before interacting
await page.waitForSelector('#login-btn', { timeout: 10000 });
await page.click('#login-btn');

// Use try/catch for critical operations
try {
  await page.click('#accept-cookies');
} catch (e) {
  log.info('No cookie banner — skipping');
}

// Check what you expect before proceeding
const loggedIn = await page.$('[data-user]');
if (!loggedIn) {
  log.error('Login failed!');
  return;
}
```

### ⚠️ Avoid

```javascript
// ❌ Don't assume elements load instantly
await page.click('#result');  // might not exist yet

// ✅ Wait first
await page.waitForSelector('#result');
await page.click('#result');

// ❌ Don't scrape too fast — sites will ban you
for (const url of urls) {
  await page.goto(url);
  // instant loop = bot-like behavior
}

// ✅ Add realistic delays
for (const url of urls) {
  await page.goto(url);
  await sleep(1500 + Math.random() * 2000); // 1.5–3.5 second delay
}
```

### 💡 Pro tips

1. **Use profiles for any site requiring login** — create one profile per account
2. **Test scripts manually first** — run once and watch the logs before scheduling
3. **Keep scripts focused** — one script = one job. Don't combine unrelated tasks
4. **Log everything** — more logs = easier debugging when things break
5. **Handle errors gracefully** — wrap risky operations in try/catch and log errors
6. **Check if logged in at the start** — don't assume the profile is still valid, cookies expire

---

## 📁 Where data is stored

```
backend/data/
├── stealth.db          ← SQLite database (scripts, tasks, logs)
└── profiles/
    ├── profile-id-1/   ← Saved browser session (cookies, storage)
    │   ├── _meta.json  ← Profile name and description
    │   ├── Default/    ← Chromium profile data
    │   └── ...
    └── profile-id-2/
        └── ...
```

Profiles are just folders. You can back them up, move them, or delete them.

---

*Questions? Open an issue at [github.com/mraktrader7/stealth-browser](https://github.com/mraktrader7/stealth-browser)*
