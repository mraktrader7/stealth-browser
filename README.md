# 🕵️ StealthBrowser

> A personal web automation platform powered by an **anti-detect browser** that bypasses bot detection, CAPTCHAs, and fingerprinting. Write JavaScript automation scripts in a VS Code–style editor, schedule them with cron, and watch real-time logs stream to your dashboard.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)
![Playwright](https://img.shields.io/badge/playwright-1.40-orange.svg)
![React](https://img.shields.io/badge/react-18-61dafb.svg)

---

## 📸 Screenshots

| Dashboard | Script Editor | Task Manager |
|---|---|---|
| Stats overview & quick actions | Monaco (VS Code) editor | Run now / schedule / live logs |

---

## ✨ Features

| Feature | Description |
|---|---|
| 🕵️ **Anti-Detect Browser** | Playwright + stealth plugin — randomized fingerprints, user agents, viewports, canvas noise |
| 📝 **Script Editor** | Monaco Editor (VS Code in browser) with full JavaScript support |
| ⏰ **Task Scheduler** | Run scripts instantly or set a cron schedule (e.g. every 5 min, daily, weekdays) |
| 📡 **Live Log Streaming** | Real-time logs via Socket.IO — watch your script execute live |
| 🖼️ **Screenshots** | Capture full-page screenshots on demand from browser sessions |
| 🗄️ **Zero-Setup DB** | SQLite — no external database required |
| 🐳 **Docker Ready** | `docker-compose up --build` and you're running |
| 🔌 **REST API** | Full API for scripts, tasks, browser sessions, and logs |

---

## 🏗️ Architecture

```
stealth-browser/
├── backend/                        # Node.js API server
│   ├── src/
│   │   ├── index.js                # Express + Socket.IO entry point
│   │   ├── db/
│   │   │   └── index.js            # SQLite schema + queries (scripts, tasks, logs)
│   │   ├── routes/
│   │   │   ├── scripts.js          # CRUD: automation scripts
│   │   │   ├── tasks.js            # Task management + run/stop
│   │   │   ├── browser.js          # Browser session API
│   │   │   └── logs.js             # Log retrieval + clear
│   │   └── services/
│   │       ├── browser.service.js  # Anti-detect browser engine (Playwright + stealth)
│   │       └── executor.service.js # JS script runner (vm sandbox)
│   ├── Dockerfile
│   ├── package.json
│   └── .env.example
│
├── frontend/                       # React web app
│   ├── src/
│   │   ├── App.jsx                 # Router + Socket context
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx       # Stats + quick actions
│   │   │   ├── Scripts.jsx         # Script list + Monaco editor
│   │   │   ├── Tasks.jsx           # Task manager
│   │   │   ├── Logs.jsx            # Paginated + filtered logs
│   │   │   └── Settings.jsx        # Config (URL, headless, timeout)
│   │   ├── components/
│   │   │   ├── Sidebar.jsx         # Navigation sidebar
│   │   │   └── LogPanel.jsx        # Real-time log panel
│   │   ├── hooks/
│   │   │   └── useSocket.js        # Socket.IO hook (live logs)
│   │   └── utils/
│   │       └── api.js              # Axios API client
│   ├── Dockerfile
│   ├── nginx.conf
│   └── package.json
│
├── docker-compose.yml
├── .gitignore
└── README.md
```

---

## 🚀 Quick Start

### Option 1: Docker (Recommended — one command)

```bash
git clone https://github.com/mraktrader7/stealth-browser.git
cd stealth-browser
docker-compose up --build
```

Open **http://localhost:5173** 🎉

---

### Option 2: Manual Setup (Local Dev)

**Requirements:** Node.js 18+, npm 9+

#### Step 1 — Clone
```bash
git clone https://github.com/mraktrader7/stealth-browser.git
cd stealth-browser
```

#### Step 2 — Backend
```bash
cd backend
npm install
npx playwright install chromium
cp .env.example .env
mkdir -p data
npm run dev
```
Backend runs at: **http://localhost:3001**

#### Step 3 — Frontend (open a new terminal)
```bash
cd frontend
npm install
npm run dev
```
Frontend runs at: **http://localhost:5173**

---

## 📖 How to Use

### 1. 📝 Write a Script

Navigate to **Scripts → New Script**.

Scripts are plain JavaScript. These globals are injected automatically:

| Global | Type | Description |
|---|---|---|
| `page` | `PlaywrightPage` | Anti-detect browser page — use like Playwright |
| `browser` | `PlaywrightBrowser` | The browser instance |
| `log(msg, level)` | `function` | Stream a log line to the dashboard |

**Available log levels:** `'info'` (default) · `'warn'` · `'error'` · `'success'`

---

### 🧪 Script Examples

#### Example 1 — Scrape a page title
```javascript
await page.goto('https://example.com');
const title = await page.title();
log(`Page title: ${title}`, 'success');
```

#### Example 2 — Fill and submit a form
```javascript
await page.goto('https://httpbin.org/forms/post');
await page.fill('input[name="custname"]', 'John Doe');
await page.fill('input[name="custtel"]', '555-1234');
await page.click('button[type="submit"]');
log('Form submitted!', 'success');
```

#### Example 3 — Scrape multiple items
```javascript
await page.goto('https://quotes.toscrape.com');
const quotes = await page.$$eval('.quote', els =>
  els.map(el => ({
    text: el.querySelector('.text').textContent,
    author: el.querySelector('.author').textContent
  }))
);
quotes.slice(0, 5).forEach(q => {
  log(`"${q.text}" — ${q.author}`, 'info');
});
log(`Scraped ${quotes.length} quotes total`, 'success');
```

#### Example 4 — Take a screenshot
```javascript
await page.goto('https://news.ycombinator.com');
const screenshot = await page.screenshot({ path: 'hn.png' });
log('Screenshot taken!', 'success');
```

#### Example 5 — Login to a site
```javascript
await page.goto('https://the-internet.herokuapp.com/login');
await page.fill('#username', 'tomsmith');
await page.fill('#password', 'SuperSecretPassword!');
await page.click('button[type="submit"]');
await page.waitForSelector('.flash.success');
const msg = await page.$eval('.flash.success', el => el.textContent.trim());
log(msg, 'success');
```

#### Example 6 — Extract a table to JSON
```javascript
await page.goto('https://the-internet.herokuapp.com/tables');
const rows = await page.$$eval('#table1 tbody tr', trs =>
  trs.map(tr => {
    const cells = tr.querySelectorAll('td');
    return {
      lastName: cells[0]?.textContent,
      firstName: cells[1]?.textContent,
      email: cells[2]?.textContent,
    };
  })
);
log(JSON.stringify(rows, null, 2), 'info');
```

#### Example 7 — Wait for dynamic content (SPA)
```javascript
await page.goto('https://jsonplaceholder.typicode.com');
await page.waitForLoadState('networkidle');
const h1 = await page.$eval('h1', el => el.textContent);
log(`H1: ${h1}`, 'success');
```

---

### 2. ⏰ Schedule a Task

Go to **Tasks → New Task**:
1. Give it a name
2. Pick a script
3. (Optional) Add a **cron expression** for recurring runs

**Common cron expressions:**

| Cron | Meaning |
|---|---|
| `* * * * *` | Every minute |
| `*/5 * * * *` | Every 5 minutes |
| `0 * * * *` | Every hour |
| `0 9 * * *` | Every day at 9:00 AM |
| `0 9 * * 1-5` | Weekdays at 9:00 AM |
| `0 0 * * 0` | Every Sunday midnight |
| `0 9,17 * * *` | Daily at 9 AM and 5 PM |

Leave cron blank for manual-only execution.

---

### 3. ▶️ Run & Monitor

- Hit **▶ Run Now** on any task
- Switch to **Logs** to see real-time output
- Each `log()` call in your script streams instantly to the dashboard
- Status badge updates live: `pending → running → completed / failed`

---

## 🛡️ Anti-Detect Details

The browser engine automatically randomizes these on every launch:

| Signal | What's Spoofed |
|---|---|
| **User Agent** | Rotates from 7 real Chrome/Firefox UAs |
| **Viewport** | Random from 6 common resolutions (1366–1920px) |
| **Locale** | en-US, en-GB, en-CA, en-AU |
| **Timezone** | 7 real US + European timezones |
| **Canvas fingerprint** | Subtle pixel-level noise on every render |
| **Hardware concurrency** | 2 / 4 / 8 / 16 cores |
| **Device memory** | 4 / 8 / 16 GB |
| **navigator.webdriver** | Forced to `false` |
| **Plugins** | Fake realistic plugin list |
| **Platform** | Win32 (configurable) |
| **Stealth plugin** | Patches 10+ known Playwright/Puppeteer leaks |

---

## 🔌 REST API Reference

### Health
```
GET  /api/health
```

### Scripts
```
GET    /api/scripts           List all scripts
POST   /api/scripts           Create script  { name, content, description }
GET    /api/scripts/:id       Get script by ID
PUT    /api/scripts/:id       Update script
DELETE /api/scripts/:id       Delete script
```

### Tasks
```
GET    /api/tasks             List all tasks
POST   /api/tasks             Create task  { name, script_id, cron_expression? }
GET    /api/tasks/:id         Get task + logs
POST   /api/tasks/:id/run     Run task immediately
POST   /api/tasks/:id/stop    Stop running task
DELETE /api/tasks/:id         Delete task
```

### Browser Sessions
```
POST   /api/browser/launch           Launch browser  { headless?, proxy?, fingerprint? }
GET    /api/browser/sessions         List active sessions
POST   /api/browser/screenshot       Take screenshot  { pageId }
POST   /api/browser/close/:sessionId Close session
```

### Logs
```
GET    /api/logs              Get logs (params: page, limit, task_id, level)
DELETE /api/logs              Clear all logs
```

---

## 📡 Socket.IO Events

Connect to `http://localhost:3001` with Socket.IO:

```javascript
import { io } from 'socket.io-client'
const socket = io('http://localhost:3001')

// Subscribe to a specific task
socket.emit('subscribe:task', taskId)

// Receive live logs
socket.on('log', ({ taskId, level, message, timestamp }) => {
  console.log(`[${level}] ${message}`)
})

// Receive status updates
socket.on('task_status', ({ taskId, status }) => {
  console.log(`Task ${taskId} is now: ${status}`)
})
```

---

## ⚙️ Environment Variables

`backend/.env`:
```env
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
DB_PATH=./data/stealth.db
```

---

## 🐳 Docker

```bash
# Build and start both services
docker-compose up --build

# Run in background
docker-compose up -d

# Stop
docker-compose down

# View logs
docker-compose logs -f backend
docker-compose logs -f frontend
```

Services:
- **Frontend** → http://localhost:5173
- **Backend API** → http://localhost:3001
- **Health check** → http://localhost:3001/api/health

---

## 🛠️ Tech Stack

### Backend
| Package | Purpose |
|---|---|
| `express` | HTTP server + REST API |
| `socket.io` | Real-time WebSocket log streaming |
| `playwright` | Browser automation |
| `playwright-extra` | Plugin system for Playwright |
| `puppeteer-extra-plugin-stealth` | Anti-detect patches |
| `better-sqlite3` | Fast SQLite database |
| `node-cron` | Cron-based task scheduling |
| `uuid` | Unique IDs for sessions/tasks |

### Frontend
| Package | Purpose |
|---|---|
| `react` + `react-dom` | UI framework |
| `vite` | Build tool + dev server |
| `tailwindcss` | Utility-first CSS (dark theme) |
| `@monaco-editor/react` | VS Code editor in the browser |
| `socket.io-client` | Real-time log streaming |
| `axios` | HTTP API client |
| `react-router-dom` | Client-side routing |
| `lucide-react` | Icons |

---

## 📂 Database Schema

```sql
-- Scripts: your saved automation scripts
CREATE TABLE scripts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  description TEXT,
  created_at TEXT,
  updated_at TEXT
);

-- Tasks: named jobs that run a script
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  script_id TEXT,
  status TEXT DEFAULT 'pending',   -- pending|running|completed|failed|stopped
  cron_expression TEXT,
  last_run TEXT,
  next_run TEXT,
  result TEXT,
  created_at TEXT
);

-- Logs: output lines from script runs
CREATE TABLE logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT,
  level TEXT DEFAULT 'info',       -- info|warn|error|success
  message TEXT,
  timestamp TEXT
);
```

---

## 🔧 Troubleshooting

### Playwright browser not found
```bash
cd backend && npx playwright install chromium
```

### Port already in use
```bash
# Change port in backend/.env
PORT=3002
# And update frontend/src/utils/api.js baseURL
```

### Docker: browser crashes (sandbox)
The Dockerfile uses the official Playwright Docker image which includes all dependencies. If running outside Docker, install system deps:
```bash
npx playwright install-deps chromium
```

### CORS error in browser
Make sure `CORS_ORIGIN` in `backend/.env` matches your frontend URL exactly (including port).

---

## 🗺️ Roadmap

- [ ] Proxy management UI (add/test/rotate proxies per task)
- [ ] Script templates library (login, scrape, form fill, etc.)
- [ ] Export scraped data to CSV / JSON
- [ ] Email/webhook notifications on task completion
- [ ] Multi-browser support (Firefox, WebKit)
- [ ] Visual script builder (no-code mode)
- [ ] Team sharing / multi-user support

---

## 📝 License

MIT — free to use, modify, and distribute.

---

## 🙏 Credits

Built with [Playwright](https://playwright.dev/), [playwright-extra](https://github.com/berstend/puppeteer-extra), and [puppeteer-extra-plugin-stealth](https://github.com/berstend/puppeteer-extra/tree/master/packages/puppeteer-extra-plugin-stealth).
