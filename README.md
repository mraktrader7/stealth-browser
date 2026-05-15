# 🕵️ StealthBrowser

**A personal web automation platform with an anti-detect browser that bypasses bot detection and CAPTCHAs.**

Write automation scripts in a VS Code–style editor, run them on a schedule, and watch live logs stream to your dashboard in real time.

---

## 📸 Screenshots

### Dashboard
> Stats, live log stream, quick actions — all in one view.

![Dashboard](https://placehold.co/900x500/0f172a/38bdf8?text=Dashboard+%7C+StealthBrowser)

### Script Editor
> Monaco Editor (VS Code in the browser) with JavaScript syntax highlighting and a ready-to-run template.

![Scripts](https://placehold.co/900x500/0f172a/38bdf8?text=Scripts+%7C+Monaco+Editor)

### Task Manager
> Create tasks, assign scripts, set cron schedules, run/stop with one click.

![Tasks](https://placehold.co/900x500/0f172a/38bdf8?text=Tasks+%7C+Scheduler)

---

## ✨ Features

| Feature | Description |
|---|---|
| 🕵️ **Anti-Detect Browser** | Playwright + stealth plugin — randomized fingerprints, user agents, viewports, canvas noise |
| 📝 **Monaco Script Editor** | VS Code in browser — JS syntax highlighting, autocomplete |
| ⏰ **Task Scheduler** | Run scripts immediately or on a cron schedule |
| 📡 **Live Log Streaming** | Real-time logs via Socket.IO — color-coded by level |
| 🖼️ **Screenshot API** | Capture page screenshots on demand |
| 🗄️ **SQLite Storage** | Zero-setup persistent storage for scripts, tasks, logs |
| 🐳 **Docker Ready** | One command to run everything |
| 🔌 **REST API** | Full API to control everything programmatically |

---

## 🏗️ Architecture

```
stealth-browser/
├── backend/                        # Node.js + Express + Playwright
│   ├── src/
│   │   ├── index.js                # HTTP Server + Socket.IO
│   │   ├── db/
│   │   │   └── index.js            # SQLite (scripts, tasks, logs)
│   │   ├── routes/
│   │   │   ├── scripts.js          # CRUD API for automation scripts
│   │   │   ├── tasks.js            # Task management + execution trigger
│   │   │   ├── browser.js          # Browser session management
│   │   │   └── logs.js             # Log retrieval + pagination
│   │   └── services/
│   │       ├── browser.service.js  # 🕵️ Anti-detect browser engine
│   │       └── executor.service.js # JS sandbox runner (vm module)
│   └── Dockerfile
├── frontend/                       # React 18 + Vite + Tailwind CSS
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx       # Overview, stats, live logs
│   │   │   ├── Scripts.jsx         # Script list + Monaco editor
│   │   │   ├── Tasks.jsx           # Task manager + run/stop controls
│   │   │   ├── Logs.jsx            # Filterable log history
│   │   │   └── Settings.jsx        # Config panel
│   │   ├── components/
│   │   │   ├── Sidebar.jsx         # Navigation + connection status
│   │   │   └── LogPanel.jsx        # Real-time Socket.IO log panel
│   │   ├── hooks/
│   │   │   └── useSocket.js        # Socket.IO React hook
│   │   └── utils/
│   │       └── api.js              # Axios API client
│   └── Dockerfile
└── docker-compose.yml
```

---

## 🚀 Quick Start

### Option 1: Docker (Recommended — no setup needed)

```bash
git clone https://github.com/mraktrader7/stealth-browser.git
cd stealth-browser
docker-compose up --build
```

Open your browser: **http://localhost:5173**

---

### Option 2: Manual (Development)

**Requirements:** Node.js 18+, npm

#### Step 1 — Backend
```bash
cd backend
npm install
npx playwright install chromium
cp .env.example .env
mkdir -p data
npm run dev
# ✅ Backend running on http://localhost:3001
```

#### Step 2 — Frontend (new terminal)
```bash
cd frontend
npm install
npm run dev
# ✅ Frontend running on http://localhost:5173
```

Open: **http://localhost:5173** 🎉

---

## 📖 How to Use

### 1️⃣ Write a Script

Go to **Scripts → + New Script**

Your script is plain JavaScript. These globals are automatically injected:

```javascript
/**
 * Available globals in every script:
 *
 * page    — Playwright Page (anti-detect, stealth mode)
 * browser — Playwright Browser instance
 * log     — Stream logs to the dashboard
 *   log('message')            → info level
 *   log.info('message')       → info (blue)
 *   log.warn('message')       → warn (yellow)
 *   log.error('message')      → error (red)
 *   log.success('message')    → success (green)
 * sleep   — await sleep(ms) helper
 * console — console.log/warn/error (routes to log panel)
 * fetch   — native Node fetch
 */

// ─── Example 1: Scrape page title ───────────────────────────────────────────
await page.goto('https://example.com');
const title = await page.title();
log.success(`Page title: ${title}`);

// ─── Example 2: Fill and submit a form ──────────────────────────────────────
await page.goto('https://httpbin.org/forms/post');
await page.fill('input[name="custname"]', 'John Doe');
await page.fill('input[name="custtel"]', '555-1234');
await page.click('button[type="submit"]');
log.success('Form submitted!');

// ─── Example 3: Scrape multiple items ───────────────────────────────────────
await page.goto('https://quotes.toscrape.com');
const quotes = await page.$$eval('.quote .text', els =>
  els.map(e => e.textContent.trim())
);
log.info(`Found ${quotes.length} quotes`);
quotes.slice(0, 3).forEach((q, i) => log.info(`${i + 1}. ${q}`));

// ─── Example 4: Take a screenshot ────────────────────────────────────────────
await page.goto('https://news.ycombinator.com');
await page.screenshot({ path: '/tmp/hn.png' });
log.success('Screenshot saved to /tmp/hn.png');

// ─── Example 5: Wait for element + extract data ──────────────────────────────
await page.goto('https://jsonplaceholder.typicode.com/todos/1');
const body = await page.textContent('pre');
const todo = JSON.parse(body);
log.success(`Todo: ${todo.title} (completed: ${todo.completed})`);
```

---

### 2️⃣ Create a Task

Go to **Tasks → + New Task**:

| Field | Description |
|---|---|
| **Name** | A label for this task |
| **Script** | Pick one of your saved scripts |
| **Cron Expression** | *(optional)* Schedule when it runs automatically |

**Cron expression examples:**
```
*/5 * * * *      → every 5 minutes
0 * * * *        → every hour
0 9 * * 1-5      → weekdays at 9:00 AM
0 0 * * *        → every day at midnight
0 9 * * 1        → every Monday at 9 AM
*/30 9-17 * * 1-5 → every 30 min during business hours
```

---

### 3️⃣ Run & Monitor

| Action | How |
|---|---|
| **Run now** | Click ▶ on any task |
| **Stop** | Click ⏹ on a running task |
| **Live logs** | Watch the log panel on Dashboard or Logs page |
| **History** | All past logs stored in SQLite, viewable in Logs page |

---

## 🛡️ Anti-Detect Capabilities

The browser service automatically applies all these protections on every launch:

| Protection | Details |
|---|---|
| **Stealth Plugin** | `puppeteer-extra-plugin-stealth` — patches 10+ fingerprint leaks |
| **User Agent Rotation** | Randomly picks from pool of real Chrome & Firefox UAs |
| **Viewport Randomization** | 1366×768 → 1920×1080, changes every session |
| **Locale Randomization** | en-US, en-GB, en-CA, en-AU |
| **Timezone Spoofing** | Random US + Europe timezones |
| **Canvas Noise** | Subtle randomization prevents canvas fingerprinting |
| **Hardware Spoofing** | navigator.hardwareConcurrency + navigator.deviceMemory |
| **WebDriver Removal** | navigator.webdriver = false |
| **Plugin List Spoof** | Fake PluginArray to mimic real browser |
| **Language Headers** | Randomized Accept-Language HTTP headers |
| **Automation Flag Disabled** | `--disable-blink-features=AutomationControlled` |

---

## 🔌 REST API Reference

### Health
```
GET  /api/health
```

### Scripts
```
GET    /api/scripts          → list all scripts
POST   /api/scripts          → create script { name, description, content }
GET    /api/scripts/:id      → get one script
PUT    /api/scripts/:id      → update script
DELETE /api/scripts/:id      → delete script
```

### Tasks
```
GET    /api/tasks            → list all tasks
POST   /api/tasks            → create task { name, script_id, cron_expression? }
GET    /api/tasks/:id        → get task + logs
POST   /api/tasks/:id/run    → run immediately
POST   /api/tasks/:id/stop   → stop running task
DELETE /api/tasks/:id        → delete task
```

### Browser Sessions
```
POST   /api/browser/launch              → launch { headless?, proxy? }
GET    /api/browser/sessions            → list active sessions
POST   /api/browser/screenshot          → { pageId }
POST   /api/browser/close/:sessionId    → close session
```

### Logs
```
GET    /api/logs             → get logs { page, limit, task_id?, level? }
DELETE /api/logs             → clear all logs
```

### Socket.IO Events

| Event | Direction | Payload |
|---|---|---|
| `log` | Server → Client | `{ task_id, level, message, timestamp }` |
| `log:global` | Server → Client | Same as above (all tasks) |
| `task:status` | Server → Client | `{ taskId, status, result?, error? }` |
| `subscribe:task` | Client → Server | `taskId` — join a task room for targeted logs |
| `unsubscribe:task` | Client → Server | `taskId` — leave a task room |

---

## ⚙️ Environment Configuration

`backend/.env`:
```env
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
DB_PATH=./data/stealth.db
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Node.js 18, Express 4, Socket.IO 4 |
| **Browser Engine** | Playwright + playwright-extra + puppeteer-extra-plugin-stealth |
| **Script Sandbox** | Node.js `vm` module |
| **Task Scheduling** | node-cron |
| **Database** | SQLite via better-sqlite3 |
| **Frontend** | React 18, Vite 5, Tailwind CSS 3 |
| **Code Editor** | Monaco Editor (@monaco-editor/react) |
| **HTTP Client** | Axios |
| **Real-time** | Socket.IO Client |
| **Container** | Docker + docker-compose |

---

## 🔧 Troubleshooting

### Backend won't start
```bash
# Make sure data directory exists
mkdir -p backend/data

# Reinstall playwright browser
cd backend && npx playwright install chromium
```

### Frontend CSS errors
```bash
# Clear node_modules and reinstall
cd frontend && rm -rf node_modules && npm install
```

### Port already in use
```bash
# Kill processes on the ports
kill $(lsof -ti:3001) && kill $(lsof -ti:5173)
```

### Browser crashes in Docker
The Docker image uses the official Playwright base image which includes all required system dependencies. If running manually, install deps:
```bash
npx playwright install-deps chromium
```

---

## 📁 Project Structure (Full)

```
stealth-browser/
├── README.md
├── .gitignore
├── docker-compose.yml
├── backend/
│   ├── .env
│   ├── .env.example
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── index.js                 # Entry: Express + Socket.IO + graceful shutdown
│       ├── db/
│       │   └── index.js             # SQLite schema + query helpers
│       ├── routes/
│       │   ├── scripts.js           # CRUD /api/scripts
│       │   ├── tasks.js             # Task mgmt /api/tasks
│       │   ├── browser.js           # Session mgmt /api/browser
│       │   └── logs.js              # Logs /api/logs
│       └── services/
│           ├── browser.service.js   # BrowserService (anti-detect)
│           └── executor.service.js  # ExecutorService (VM sandbox)
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    ├── package.json
    ├── vite.config.js
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── index.html
    └── src/
        ├── main.jsx                 # React entry
        ├── App.jsx                  # Router + layout
        ├── index.css                # Tailwind + custom components
        ├── pages/
        │   ├── Dashboard.jsx        # Stats + live logs + quick actions
        │   ├── Scripts.jsx          # Script list + Monaco editor
        │   ├── Tasks.jsx            # Task cards + scheduler
        │   ├── Logs.jsx             # Full log history + filters
        │   └── Settings.jsx         # Config + preferences
        ├── components/
        │   ├── Sidebar.jsx          # Nav sidebar
        │   └── LogPanel.jsx         # Real-time log panel
        ├── hooks/
        │   └── useSocket.js         # Socket.IO hook
        └── utils/
            └── api.js               # Axios API client
```

---

## 📝 License

MIT — do whatever you want with it.

---

> Built with ❤️ using Playwright, React, and Node.js
