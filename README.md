# 🕵️ StealthBrowser

A personal web automation platform with an **anti-detect browser** that bypasses bot detection and CAPTCHAs. Write automation scripts in a VS Code–style editor, run them on a schedule, and watch live logs stream to your dashboard.

![StealthBrowser Dashboard](https://via.placeholder.com/900x500/1e293b/38bdf8?text=StealthBrowser+Dashboard)

---

## ✨ Features

| Feature | Description |
|---|---|
| 🕵️ **Anti-Detect Browser** | Playwright + stealth plugin — randomized fingerprints, user agents, viewports |
| 📝 **Script Editor** | Monaco Editor (VS Code in browser) with JavaScript |
| ⏰ **Task Scheduler** | Run scripts now or on a cron schedule |
| 📡 **Live Logs** | Real-time log streaming via Socket.IO |
| 🖼️ **Screenshots** | Capture page screenshots on demand |
| 🗄️ **SQLite Storage** | Zero-setup persistent storage |
| 🐳 **Docker Ready** | One command to run everything |

---

## 🏗️ Architecture

```
stealth-browser/
├── backend/                  # Node.js + Express + Playwright
│   ├── src/
│   │   ├── index.js          # Server entry point + Socket.IO
│   │   ├── db/index.js       # SQLite setup (tasks, scripts, logs)
│   │   ├── routes/
│   │   │   ├── scripts.js    # CRUD API for automation scripts
│   │   │   ├── tasks.js      # Task management + execution
│   │   │   ├── browser.js    # Browser session management
│   │   │   └── logs.js       # Log retrieval
│   │   └── services/
│   │       ├── browser.service.js   # Anti-detect browser engine
│   │       └── executor.service.js  # Script sandbox runner
│   └── Dockerfile
├── frontend/                 # React + Vite + Tailwind CSS
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx  # Overview + stats
│   │   │   ├── Scripts.jsx    # Script editor
│   │   │   ├── Tasks.jsx      # Task manager
│   │   │   ├── Logs.jsx       # Log viewer
│   │   │   └── Settings.jsx   # Configuration
│   │   ├── components/
│   │   │   ├── Sidebar.jsx    # Navigation
│   │   │   └── LogPanel.jsx   # Real-time log panel
│   │   ├── hooks/
│   │   │   └── useSocket.js   # Socket.IO hook
│   │   └── utils/
│   │       └── api.js         # Axios API client
│   └── Dockerfile
└── docker-compose.yml
```

---

## 🚀 Quick Start

### Option 1: Docker (Recommended)

```bash
git clone https://github.com/YOUR_USERNAME/stealth-browser.git
cd stealth-browser
docker-compose up --build
```

Open: **http://localhost:5173**

---

### Option 2: Manual Setup

**Prerequisites:** Node.js 18+, npm

#### Backend
```bash
cd backend
npm install
npx playwright install chromium
cp .env.example .env
mkdir -p data
npm run dev
```

#### Frontend (new terminal)
```bash
cd frontend
npm install
npm run dev
```

Open: **http://localhost:5173**

---

## 📖 Usage

### 1. Write a Script

Go to **Scripts → New Script**. Scripts are plain JavaScript with these globals injected:

```javascript
// Available globals in your script:
// page    — Playwright Page object (anti-detect browser)
// browser — Playwright Browser object
// log(msg, level) — Stream log to dashboard ('info'|'warn'|'error'|'success')

// Example: Scrape a page title
await page.goto('https://example.com');
const title = await page.title();
log(`Page title: ${title}`, 'success');

// Example: Fill a form
await page.goto('https://httpbin.org/forms/post');
await page.fill('input[name="custname"]', 'John Doe');
await page.click('button[type="submit"]');
log('Form submitted!', 'success');

// Example: Extract data
await page.goto('https://quotes.toscrape.com');
const quotes = await page.$$eval('.quote .text', els => els.map(e => e.textContent));
log(JSON.stringify(quotes.slice(0, 3)), 'info');
```

### 2. Create a Task

Go to **Tasks → New Task**:
- Pick a script
- Optionally set a **cron expression** for scheduling:
  - `*/5 * * * *` — every 5 minutes
  - `0 9 * * 1-5` — weekdays at 9 AM
  - `0 0 * * *` — daily at midnight

### 3. Run & Monitor

Hit ▶ **Run Now** — logs stream live to the dashboard and Logs page.

---

## 🛡️ Anti-Detect Features

The browser service automatically applies:

| Feature | Details |
|---|---|
| **Stealth Plugin** | Patches 10+ browser fingerprint leaks |
| **Random User Agent** | Rotates from pool of real Chrome/Firefox UAs |
| **Random Viewport** | 1366×768 to 1920×1080 |
| **Random Locale** | en-US, en-GB, en-CA, en-AU |
| **Random Timezone** | US + Europe timezones |
| **Canvas Noise** | Subtle canvas fingerprint randomization |
| **Hardware Spoof** | navigator.hardwareConcurrency + deviceMemory |
| **WebDriver Removal** | navigator.webdriver = false |
| **Plugin Spoof** | Fake plugin list to mimic real browser |

---

## 🔌 API Reference

### Scripts
| Method | Path | Description |
|---|---|---|
| GET | `/api/scripts` | List all scripts |
| POST | `/api/scripts` | Create script |
| GET | `/api/scripts/:id` | Get script |
| PUT | `/api/scripts/:id` | Update script |
| DELETE | `/api/scripts/:id` | Delete script |

### Tasks
| Method | Path | Description |
|---|---|---|
| GET | `/api/tasks` | List all tasks |
| POST | `/api/tasks` | Create task |
| POST | `/api/tasks/:id/run` | Run task now |
| POST | `/api/tasks/:id/stop` | Stop task |
| DELETE | `/api/tasks/:id` | Delete task |

### Browser
| Method | Path | Description |
|---|---|---|
| POST | `/api/browser/launch` | Launch browser session |
| GET | `/api/browser/sessions` | List active sessions |
| POST | `/api/browser/screenshot` | Take screenshot |
| POST | `/api/browser/close/:id` | Close session |

### Logs
| Method | Path | Description |
|---|---|---|
| GET | `/api/logs` | Get logs (paginated) |
| DELETE | `/api/logs` | Clear all logs |

### Socket.IO Events
| Event | Direction | Payload |
|---|---|---|
| `log` | Server → Client | `{ taskId, level, message, timestamp }` |
| `task_status` | Server → Client | `{ taskId, status }` |
| `subscribe:task` | Client → Server | `taskId` |

---

## ⚙️ Configuration

Edit `backend/.env`:
```env
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
DB_PATH=./data/stealth.db
```

---

## 🛠️ Tech Stack

- **Backend:** Node.js, Express, Socket.IO, Playwright, playwright-extra, better-sqlite3, node-cron
- **Frontend:** React 18, Vite, Tailwind CSS, Monaco Editor, Socket.IO Client, Axios
- **Browser Engine:** Chromium (via Playwright) + puppeteer-extra-plugin-stealth
- **Database:** SQLite
- **Container:** Docker + docker-compose

---

## 📝 License

MIT — use it however you want.
