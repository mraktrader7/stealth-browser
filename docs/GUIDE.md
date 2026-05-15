# 📖 StealthBrowser — Complete User Guide

> Everything you need to know: how the browser works, how sessions are saved, how to automate tasks step by step.

---

## Table of Contents

1. [How the Browser Works](#1-how-the-browser-works)
2. [Staying Logged In (Persistent Profiles)](#2-staying-logged-in-persistent-profiles)
3. [Your First Automation — Step by Step](#3-your-first-automation--step-by-step)
4. [Writing Scripts](#4-writing-scripts)
5. [🧪 Script Playground — Visual Builder](#5-script-playground--visual-builder)
6. [Common Automation Recipes](#6-common-automation-recipes)
7. [Scheduling with Cron](#7-scheduling-with-cron)
8. [Understanding Live Logs](#8-understanding-live-logs)
9. [Anti-Detect Explained](#9-anti-detect-explained)
10. [Tips & Best Practices](#10-tips--best-practices)
11. [🔒 Script Sandbox (isolated-vm)](#11-script-sandbox-isolated-vm)
12. [⚙️ Task Queue & Retries (BullMQ)](#12-task-queue--retries-bullmq)
13. [📋 Structured Logs — Filters & Line Numbers](#13-structured-logs--filters--line-numbers)

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

---

## 5. Script Playground — Visual Builder

The **Playground** is a visual, no-typing-required way to build automation workflows.
Instead of writing JavaScript, you build a list of steps — each step is one browser action.
When you're done, click **Generate & Insert Code** and the JavaScript appears in the Code editor.

### How to open it

1. Click **Scripts** in the sidebar
2. Select (or create) a script
3. Click the **Playground** tab next to the Code tab

---

### Workflow

```
┌─────────────────────────────────────────────────────────────┐
│  Scripts page                                               │
│  ┌───────────────┐   ┌──────────────────────────────────┐  │
│  │ Script list   │   │  [ Code ]  [ 🪄 Playground ]      │  │
│  │               │   │                                   │  │
│  │  my-script    │   │  Step 1: Go to URL                │  │
│  │  login-flow   │   │  ┌─────────────────────────────┐  │  │
│  │  scraper      │   │  │ Action:  Go to URL           │  │  │
│  │               │   │  │ URL:     https://example.com │  │  │
│  │  [+ New]      │   │  │ Comment: Open the site       │  │  │
│  └───────────────┘   │  └─────────────────────────────┘  │  │
│                      │                                   │  │
│                      │  Step 2: Click Element            │  │
│                      │  ┌─────────────────────────────┐  │  │
│                      │  │ Action:  Click               │  │  │
│                      │  │ Target:  [CSS] button.login  │  │  │
│                      │  │ Comment: Click login button  │  │  │
│                      │  └─────────────────────────────┘  │  │
│                      │                                   │  │
│                      │  [+ Add Step]  [🪄 Generate Code] │  │
│                      └──────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

### Available Actions

| Group      | Action               | What it does                           |
|------------|----------------------|----------------------------------------|
| Navigation | Go to URL            | `page.goto(url)`                       |
| Navigation | Go Back              | `page.goBack()`                        |
| Navigation | Reload Page          | `page.reload()`                        |
| Navigation | Wait for URL         | `page.waitForURL(pattern)`             |
| Mouse      | Click Element        | `page.click(selector)`                 |
| Mouse      | Double Click         | `page.dblclick(selector)`              |
| Mouse      | Hover Element        | `page.hover(selector)`                 |
| Mouse      | Scroll To Element    | Scrolls element into viewport          |
| Mouse      | Scroll Page          | `window.scrollBy(0, px)`               |
| Input      | Type into Input      | `page.fill(selector, value)`           |
| Input      | Press Key            | `page.press(selector, key)`            |
| Input      | Select Dropdown      | `page.selectOption(selector, value)`   |
| Input      | Check / Uncheck      | `page.check/uncheck(selector)`         |
| Input      | Clear Input          | Clears the field                       |
| Input      | Upload File          | `page.setInputFiles(selector, path)`   |
| Wait       | Wait for Element     | `page.waitForSelector(selector)`       |
| Wait       | Wait Until Hidden    | Waits until element disappears         |
| Wait       | Sleep (ms)           | `await sleep(ms)`                      |
| Wait       | Wait Network Idle    | `page.waitForLoadState('networkidle')` |
| Data       | Read Text            | `page.textContent(selector)` + log     |
| Data       | Get Attribute        | `page.getAttribute(selector, attr)`    |
| Data       | Take Screenshot      | `page.screenshot({path})`              |
| Data       | Log Message          | `log.info(message)`                    |

---

### Targeting Elements — Selector Methods

Every step that acts on an element asks *how* to find that element.
You pick the method from a dropdown, then enter just the relevant value.

| Method          | You enter              | Builds this Playwright selector                 | Best for                        |
|-----------------|------------------------|-------------------------------------------------|---------------------------------|
| **CSS**         | `.btn-primary`         | `.btn-primary`                                  | Anything with a class or tag    |
| **ID**          | `login-btn`            | `#login-btn`                                    | Elements with a known `id`      |
| **Text Content**| `Sign In`              | `text=Sign In`                                  | Buttons, links, labels          |
| **data-testid** | `submit-button`        | `[data-testid="submit-button"]`                 | React / Next.js apps            |
| **Placeholder** | `Enter your email`     | `[placeholder="Enter your email"]`              | Input fields                    |
| **XPath**       | `//button[text()="Go"]`| `xpath=//button[text()="Go"]`                   | Complex or deeply nested HTML   |
| **ARIA Role**   | `button:Submit`        | `role=button[name="Submit"]`                    | Accessible apps, testing        |

> 💡 **Tip:** The Playground shows a live preview of the built selector as you type, so you always know exactly what will be passed to Playwright.

---

### How to Find the Right Selector

1. **Open DevTools** in any browser (F12)
2. Right-click the element → **Inspect**
3. Look at the element's:
   - `id` attribute → use **ID** method
   - `class` attribute → use **CSS** method with `.classname`
   - `data-testid` attribute → use **data-testid** method
   - visible text → use **Text Content** method
4. Or right-click in DevTools → **Copy** → **Copy selector** (gives you a CSS path)

---

### Step Comments

Every step has an optional **Comment** field.
Comments appear above each line in the generated code as `// Step N: your note`.

```javascript
// Step 1: Open the login page
await page.goto('https://example.com/login', { waitUntil: 'domcontentloaded' });

// Step 2: Enter email address
await page.fill('[placeholder="Enter your email"]', 'user@test.com');

// Step 3: Submit the form
await page.click('text=Sign In');
```

This makes your generated code self-documenting — you know exactly why each line exists.

---

### Quick Start Templates

The Playground offers 4 templates to start from:

| Template        | Steps included                              |
|-----------------|---------------------------------------------|
| 🔐 Login Flow   | goto → fill email → fill password → submit → waitForURL |
| 🔍 Search & Scrape | goto → fill search → press Enter → wait for results → getText |
| 📋 Form Fill    | goto → fill name → fill email → fill message → click submit → waitForSelector |
| 📸 Screenshot   | goto → waitForNetIdle → screenshot → log    |

---

### Reordering Steps

- Use the **↑ / ↓** arrow buttons on each step card to reorder
- Use the small **+** button between cards to insert a step in the middle

---

### Generating Code

When you're happy with your steps:

1. Click **🪄 Generate & Insert Code**
2. The Code tab opens automatically with the generated JavaScript
3. Review and edit as needed
4. Click **Save**

The generated code is fully compatible with the manual editor — it uses the same Playwright API and the same `log`, `sleep`, and `page` globals.

---

## 6. Common Automation Recipes

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

## 7. Scheduling with Cron

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

## 8. Understanding Live Logs

Every script has access to the `log` function which streams messages to your dashboard in real time and persists them to the database with rich metadata.

### Log levels

| Level | Color | Use for |
|---|---|---|
| `log.info()` | 🔵 Blue | General progress messages |
| `log.success()` | 🟢 Green | Task completed, data found, goals achieved |
| `log.warn()` | 🟡 Yellow | Non-critical issues, retries, skipped items |
| `log.error()` | 🔴 Red | Errors, failures, things that went wrong |
| `log.debug()` | ⚪ Grey | Low-level details for troubleshooting |

### Structured log fields

Every log entry now carries:

| Field | Description |
|---|---|
| `level` | `info` \| `warn` \| `error` \| `success` \| `debug` |
| `message` | The log message text |
| `source` | Source file (e.g. `task-<id>.js`) — set automatically |
| `line` | Script line number (set when you call `log.info(msg, lineNum)`) |
| `timestamp` | ISO-8601 datetime |
| `task_id` | UUID of the owning task |

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

### Filtering logs in the UI

The **Logs** page supports multiple filters at once:

| Filter | What it does |
|---|---|
| **Level** | Show only info / warn / error / success / debug |
| **Date** | Show only logs from a specific calendar date (YYYY-MM-DD picker) |
| **Task ID** | Show logs for one specific task |
| **Search** | Free-text search inside the message field |

All active filters can be cleared with one click.

### Filtering logs via API

```bash
# Only errors
GET /api/logs?level=error

# Everything from today
GET /api/logs?date=2024-01-15

# Logs from a specific script run (source file)
GET /api/logs?source=task-abc-123.js

# Full-text search
GET /api/logs?search=price+alert

# Combine: errors from today for one task
GET /api/logs?level=error&date=2024-01-15&task_id=<uuid>
```

---

## 9. Anti-Detect Explained

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

## 10. Tips & Best Practices

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
7. **Use retries for flaky sites** — pass `retries: 2` when running tasks via the API
8. **Use log.debug() for verbose output** — keeps info/success clean while still capturing detail
9. **Filter logs by date after a run** — quickly isolate what happened during a specific execution

---

## 11. Script Sandbox (isolated-vm)

Every user script runs inside a **V8 Isolate** using the [isolated-vm](https://github.com/laverdet/isolated-vm) library — this is a significant security and stability improvement over the old Node.js `vm` module.

### What changes for you as a script author?

**Nothing** — your scripts work exactly the same. The same `page`, `log`, `sleep`, `fetch`, and `console` globals are available. The sandbox is transparent.

### What it protects against

| Risk | How isolated-vm handles it |
|---|---|
| Malicious scripts reading server files | Host Node.js heap is completely unreachable from inside the isolate |
| Scripts leaking environment variables | `process`, `require`, `fs` — none of these exist inside the isolate |
| Out-of-memory crash | Each isolate has a hard **128 MB memory cap** |
| Infinite loop freezing the server | The isolate runs in its own V8 context — an infinite loop blocks only that isolate, not the event loop |
| Script timeout bypass | Timeout is enforced at the V8 level, not just Promise.race |

### How bridging works

Since the isolate can't touch Node objects directly, the `page` object is a **proxy**: every call like `await page.goto(url)` sends a message across the isolate boundary to the real Playwright page running in the host process. The result is serialized and returned.

This is why some edge cases differ:
- Return values from page methods are **serialized to JSON** (e.g. `page.evaluate()` returning a complex object will come back as a JSON string — use `JSON.parse()` if needed)
- Methods that return non-serializable objects (like element handles) are not directly usable — use `page.$eval()` or `page.evaluate()` to extract text/attributes instead

### Memory limit

The default cap is **128 MB**. If your script processes very large amounts of data in memory, you may hit this limit. Best practice: stream results via `log.info()` as you go rather than building a giant in-memory array.

---

## 12. Task Queue & Retries (BullMQ)

StealthBrowser uses [BullMQ](https://docs.bullmq.io/) on top of Redis to queue and execute tasks reliably.

### Why a queue?

Without a queue, if the server crashes mid-task or a site is temporarily unavailable, the task is simply lost. With BullMQ:
- Failed tasks can **retry automatically**
- Job state is **persisted in Redis** — a server restart doesn't lose running jobs
- You can **limit concurrency** to avoid overloading the server or getting IP-banned

### Running a task with retries

```bash
curl -X POST http://localhost:3001/api/tasks/<id>/run \
  -H "Content-Type: application/json" \
  -d '{"retries": 3}'
```

This will attempt the task up to **4 times total** (1 initial + 3 retries) with exponential back-off:

| Attempt | Delay before retry |
|---|---|
| 1st try | — |
| 2nd try | 5 seconds |
| 3rd try | 10 seconds |
| 4th try | 20 seconds |

### Concurrency control

By default, **3 tasks run in parallel**. Set the `QUEUE_CONCURRENCY` environment variable to change this:

```env
# backend/.env
QUEUE_CONCURRENCY=5   # allow up to 5 parallel tasks
QUEUE_CONCURRENCY=1   # run tasks one at a time (safest for IP-sensitive sites)
```

### Checking queue status

```bash
curl http://localhost:3001/api/queue/metrics
```

```json
{
  "ready": true,
  "data": {
    "waiting":   2,
    "active":    1,
    "completed": 48,
    "failed":    3,
    "delayed":   0
  }
}
```

### Graceful degradation

If Redis is not running when the server starts, BullMQ logs a warning and the system falls back to **direct in-process execution**. Tasks still run — you just lose retry support and queue persistence. This means you can develop and use StealthBrowser without Redis if you don't need retries.

### When to use retries

| Scenario | Recommended retries |
|---|---|
| Scraping a reliable site | 0 (default) |
| Logging into a flaky site | 1–2 |
| Submitting a form that sometimes times out | 2–3 |
| Critical task that must not be lost | 3–5 |

> ⚠️ Don't use high retry counts for tasks that interact with forms or trigger purchases — retrying could submit the same form multiple times.

---

## 13. Structured Logs — Filters & Line Numbers

Logs in StealthBrowser are structured — each entry has metadata beyond just the message text.

### Log entry structure

```json
{
  "id": 42,
  "task_id": "abc-123-...",
  "level": "success",
  "message": "Price alert! Now $19.99",
  "source": "task-abc-123.js",
  "line": null,
  "timestamp": "2024-01-15T09:05:03.141Z"
}
```

### Source tracking

The `source` field is automatically set to `task-<id>.js` for every log line emitted from a user script. This lets you:
- Filter all logs from a specific script run
- Distinguish script logs from system logs (which have `source: null`)

### Line numbers

You can optionally pass a line number as a second argument to any log call:

```javascript
log.info('Checking price...', 12);   // line 12 in the source
log.error('Login failed', 34);       // line 34
log.success('Done', 56);
```

This is useful when your script is long and you want to quickly locate which line produced a log entry in the Logs page.

> 💡 Future IDE integrations can use line numbers to link log entries directly back to the Monaco editor line.

### Filtering in the Logs page

The Logs page has two rows of filters:

**Row 1 — Level + Date:**
- Click a level badge (all / info / warn / error / success / debug) to filter by severity
- Use the **date picker** to show only logs from a specific day

**Row 2 — Search + Task ID:**
- **Search box** — free-text search inside the `message` field (server-side, works on all pages)
- **Task ID box** — paste a task UUID to see only that task's logs

All filters combine (AND logic). Click **Clear N filters** to reset.

### Filtering via API

```bash
# Errors only, today
GET /api/logs?level=error&date=2024-01-15

# All logs from a script run (by source file)
GET /api/logs?source=task-abc-123.js

# Search for a specific phrase
GET /api/logs?search=Price+alert

# Paginate through many results
GET /api/logs?page=2&limit=100

# Full combination
GET /api/logs?level=warn&date=2024-01-15&task_id=abc-123&search=timeout
```

---

## 📁 Where data is stored

```
backend/data/
├── stealth.db          ← SQLite database (scripts, tasks, logs with line/source columns)
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
