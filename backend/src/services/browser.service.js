'use strict';

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { v4: uuidv4 } = require('uuid');

// Apply stealth plugin
chromium.use(StealthPlugin());

// ─── Profile storage ──────────────────────────────────────────────────────────
// Each "profile" is a folder on disk that stores cookies, localStorage,
// IndexedDB, service workers — essentially a persistent browser identity.
// Re-using the same profile folder = stay logged in across task runs.

const PROFILES_DIR = process.env.PROFILES_DIR
  || path.join(__dirname, '../../data/profiles');

if (!fs.existsSync(PROFILES_DIR)) {
  fs.mkdirSync(PROFILES_DIR, { recursive: true });
}

function getProfilePath(profileId) {
  return path.join(PROFILES_DIR, profileId);
}

function listProfiles() {
  if (!fs.existsSync(PROFILES_DIR)) return [];
  return fs.readdirSync(PROFILES_DIR)
    .filter(name => {
      const p = path.join(PROFILES_DIR, name);
      return fs.statSync(p).isDirectory();
    })
    .map(name => {
      const p = path.join(PROFILES_DIR, name);
      const stat = fs.statSync(p);
      const metaFile = path.join(p, '_meta.json');
      let meta = {};
      try { meta = JSON.parse(fs.readFileSync(metaFile, 'utf8')); } catch (_) {}
      return {
        id: name,
        name: meta.name || name,
        description: meta.description || '',
        createdAt: stat.birthtime,
        updatedAt: stat.mtime,
        size: getFolderSize(p),
      };
    });
}

function createProfile(profileId, meta = {}) {
  const profilePath = getProfilePath(profileId);
  fs.mkdirSync(profilePath, { recursive: true });
  fs.writeFileSync(
    path.join(profilePath, '_meta.json'),
    JSON.stringify({ ...meta, createdAt: new Date().toISOString() }, null, 2)
  );
  return profilePath;
}

function deleteProfile(profileId) {
  const profilePath = getProfilePath(profileId);
  if (fs.existsSync(profilePath)) {
    fs.rmSync(profilePath, { recursive: true, force: true });
  }
}

function getFolderSize(dirPath) {
  let total = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dirPath, e.name);
      if (e.isDirectory()) total += getFolderSize(full);
      else total += fs.statSync(full).size;
    }
  } catch (_) {}
  return total;
}

// ─── Fingerprint helpers ──────────────────────────────────────────────────────

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1680, height: 1050 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 800 },
];

// Mobile viewport presets (public API for the task runner)
const MOBILE_PRESETS = {
  'iphone-14':       { width: 390,  height: 844,  deviceScaleFactor: 3, isMobile: true,  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1' },
  'iphone-14-plus':  { width: 428,  height: 926,  deviceScaleFactor: 3, isMobile: true,  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1' },
  'iphone-se':       { width: 375,  height: 667,  deviceScaleFactor: 2, isMobile: true,  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1' },
  'ipad-pro':        { width: 1024, height: 1366, deviceScaleFactor: 2, isMobile: false, userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1' },
  'pixel-7':         { width: 412,  height: 915,  deviceScaleFactor: 2.625, isMobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36' },
  'samsung-s23':     { width: 360,  height: 780,  deviceScaleFactor: 3, isMobile: true,  userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36' },
  'galaxy-tab':      { width: 800,  height: 1280, deviceScaleFactor: 2, isMobile: false, userAgent: 'Mozilla/5.0 (Linux; Android 12; SM-T730) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36' },
};


const LOCALES  = ['en-US', 'en-GB', 'en-CA'];
const TIMEZONES = ['America/New_York', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin'];

function randomFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function buildFingerprint(overrides = {}) {
  return {
    userAgent:          overrides.userAgent          || randomFrom(USER_AGENTS),
    viewport:           overrides.viewport           || randomFrom(VIEWPORTS),
    locale:             overrides.locale             || randomFrom(LOCALES),
    timezoneId:         overrides.timezoneId         || randomFrom(TIMEZONES),
    deviceScaleFactor:  overrides.deviceScaleFactor  || randomFrom([1, 1, 2]),
    hardwareConcurrency:overrides.hardwareConcurrency|| randomFrom([4, 8, 8, 16]),
    deviceMemory:       overrides.deviceMemory       || randomFrom([4, 8, 16]),
    platform:           overrides.platform           || 'Win32',
  };
}

// Init script injected into every page to spoof hardware/canvas
function buildInitScript(fp) {
  return `
  (function() {
    // Remove webdriver flag
    Object.defineProperty(navigator, 'webdriver', { get: () => false });

    // Spoof hardware
    try { Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => ${fp.hardwareConcurrency} }); } catch(e) {}
    try { Object.defineProperty(navigator, 'deviceMemory',        { get: () => ${fp.deviceMemory} }); } catch(e) {}
    try { Object.defineProperty(navigator, 'platform',            { get: () => '${fp.platform}' }); } catch(e) {}

    // Spoof plugin list
    try {
      Object.defineProperty(navigator, 'plugins', { get: () => { const a=[1,2,3]; a.__proto__=PluginArray.prototype; return a; } });
    } catch(e) {}

    // Canvas noise
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(t, ...a) {
      const ctx = orig.call(this, t, ...a);
      if (ctx && t === '2d') {
        const oFill = ctx.fillText.bind(ctx);
        ctx.fillText = function(...args) { ctx.globalAlpha = 0.999 + Math.random()*0.001; return oFill(...args); };
      }
      return ctx;
    };
  })();
  `;
}

// ─── BrowserService ───────────────────────────────────────────────────────────

class BrowserService {
  constructor() {
    /** @type {Map<string, object>} browserId → session info */
    this.browsers = new Map();
    /** @type {Map<string, object>} pageId → page info */
    this.pages = new Map();
  }

  /**
   * Launch a browser instance.
   *
   * @param {object}  opts
   * @param {boolean} [opts.headless=true]
   * @param {string}  [opts.proxy]         "http://user:pass@host:port"
   * @param {string}  [opts.mobilePreset]  one of MOBILE_PRESETS keys (e.g. 'iphone-14')
   * @param {string}  [opts.profileId]     re-use a saved profile (= stay logged in)
   * @param {object}  [opts.fingerprint]   override fingerprint values
   * @param {string}  [opts.browserId]     stable ID (generated if omitted)
   */
  async launch(opts = {}) {
    const {
      headless = true,
      proxy,
      mobilePreset,
      profileId,          // ← KEY: if set, sessions/cookies persist on disk
      fingerprint: fpOverrides = {},
      browserId: reqId,
    } = opts;

    // Apply mobile preset overrides if specified
    const mobileOverrides = mobilePreset && MOBILE_PRESETS[mobilePreset]
      ? MOBILE_PRESETS[mobilePreset]
      : {};

    const browserId  = reqId || uuidv4();
    const fingerprint = buildFingerprint({ ...mobileOverrides, ...fpOverrides });

    const launchOptions = {
      headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        `--lang=${fingerprint.locale}`,
        `--window-size=${fingerprint.viewport.width},${fingerprint.viewport.height}`,
      ],
    };
    if (proxy) launchOptions.proxy = { server: proxy };

    // ── Persistent context (keeps login sessions) ────────────────────────────
    // When profileId is set we use launchPersistentContext which stores all
    // cookies / localStorage / IndexedDB to the profile folder on disk.
    // The next run using the same profileId will be already logged in.

    let browser = null;
    let persistentContext = null;

    if (profileId) {
      const profilePath = getProfilePath(profileId);
      if (!fs.existsSync(profilePath)) {
        createProfile(profileId, { name: profileId });
      }
      console.log(`[BrowserService] Using persistent profile: ${profileId} → ${profilePath}`);

      // launchPersistentContext returns a BrowserContext directly (not a Browser)
      persistentContext = await chromium.launchPersistentContext(profilePath, {
        ...launchOptions,
        userAgent:         fingerprint.userAgent,
        viewport:          fingerprint.viewport,
        locale:            fingerprint.locale,
        timezoneId:        fingerprint.timezoneId,
        deviceScaleFactor: fingerprint.deviceScaleFactor,
        acceptDownloads:   true,
        extraHTTPHeaders:  { 'Accept-Language': `${fingerprint.locale},en;q=0.9` },
      });
      await persistentContext.addInitScript(buildInitScript(fingerprint));
    } else {
      // Ephemeral — no persistence
      browser = await chromium.launch(launchOptions);
    }

    this.browsers.set(browserId, {
      browser,
      persistentContext,
      sessionId: browserId,
      profileId: profileId || null,
      createdAt: new Date(),
      options: { headless, proxy, profileId },
      fingerprint,
    });

    console.log(`[BrowserService] Launched ${profileId ? 'persistent' : 'ephemeral'} browser ${browserId}`);
    return { browserId, fingerprint, profileId: profileId || null };
  }

  /**
   * Open a new page within an existing browser session.
   */
  async newPage(browserId, pageId) {
    const session = this.browsers.get(browserId);
    if (!session) throw new Error(`Browser session not found: ${browserId}`);

    const resolvedPageId = pageId || uuidv4();
    let context;
    let page;

    if (session.persistentContext) {
      // Persistent context: open page directly (context already has storage)
      page = await session.persistentContext.newPage();
      context = session.persistentContext;
    } else {
      // Ephemeral: create a new context with spoofed fingerprint
      const { fingerprint } = session;
      context = await session.browser.newContext({
        userAgent:         fingerprint.userAgent,
        viewport:          fingerprint.viewport,
        locale:            fingerprint.locale,
        timezoneId:        fingerprint.timezoneId,
        deviceScaleFactor: fingerprint.deviceScaleFactor,
        extraHTTPHeaders:  { 'Accept-Language': `${fingerprint.locale},en;q=0.9` },
      });
      await context.addInitScript(buildInitScript(fingerprint));
      page = await context.newPage();
    }

    this.pages.set(resolvedPageId, {
      page,
      pageId: resolvedPageId,
      browserId,
      context,
      createdAt: new Date(),
    });

    return { pageId: resolvedPageId, page };
  }

  getPage(pageId) {
    const s = this.pages.get(pageId);
    if (!s) throw new Error(`Page not found: ${pageId}`);
    return s.page;
  }

  async screenshot(pageId, format = 'png') {
    return this.getPage(pageId).screenshot({ type: format, fullPage: false });
  }

  async closePage(pageId) {
    const s = this.pages.get(pageId);
    if (!s) return;
    try {
      // Don't close persistent context here — it outlives individual pages
      const session = this.browsers.get(s.browserId);
      if (!session || !session.persistentContext) {
        await s.context.close();
      } else {
        await s.page.close();
      }
    } catch (e) { console.warn(`[BrowserService] closePage ${pageId}:`, e.message); }
    this.pages.delete(pageId);
  }

  async closeBrowser(browserId) {
    const s = this.browsers.get(browserId);
    if (!s) return;

    // Close all pages for this browser
    for (const [pid, pd] of this.pages.entries()) {
      if (pd.browserId === browserId) {
        try { await pd.page.close(); } catch (_) {}
        this.pages.delete(pid);
      }
    }

    try {
      if (s.persistentContext) {
        // Closing persistent context saves everything to disk automatically
        await s.persistentContext.close();
      } else if (s.browser) {
        await s.browser.close();
      }
    } catch (e) { console.warn(`[BrowserService] closeBrowser ${browserId}:`, e.message); }

    this.browsers.delete(browserId);
    console.log(`[BrowserService] Closed browser ${browserId}${s.profileId ? ` (profile saved: ${s.profileId})` : ''}`);
  }

  async closeAll() {
    await Promise.allSettled([...this.browsers.keys()].map(id => this.closeBrowser(id)));
  }

  listSessions() {
    return [...this.browsers.entries()].map(([browserId, s]) => ({
      browserId,
      profileId:  s.profileId,
      createdAt:  s.createdAt,
      headless:   s.options.headless,
      hasProxy:   !!s.options.proxy,
      fingerprint: s.fingerprint,
      openPages:  [...this.pages.values()].filter(p => p.browserId === browserId).length,
    }));
  }
}

const browserService = new BrowserService();

// Export profile helpers for use in routes
browserService.listProfiles   = listProfiles;
browserService.createProfile  = createProfile;
browserService.deleteProfile  = deleteProfile;
browserService.getProfilePath = getProfilePath;
browserService.MOBILE_PRESETS = MOBILE_PRESETS;

// ─── Proxy Pool Rotation ───────────────────────────────────────────────────────
// Load proxy pool from PROXY_POOL env var (comma-separated proxy URLs).
// Call browserService.getNextProxy() to get the next proxy in round-robin order.
let _proxyPool = [];
let _proxyIndex = 0;

if (process.env.PROXY_POOL) {
  _proxyPool = process.env.PROXY_POOL.split(',').map(s => s.trim()).filter(Boolean);
  console.log(`[BrowserService] Proxy pool loaded: ${_proxyPool.length} proxies`);
}

browserService.getNextProxy = function() {
  if (_proxyPool.length === 0) return null;
  const proxy = _proxyPool[_proxyIndex % _proxyPool.length];
  _proxyIndex++;
  return proxy;
};

browserService.getProxyPool = function() {
  return { pool: _proxyPool, currentIndex: _proxyIndex % Math.max(_proxyPool.length, 1) };
};

module.exports = browserService;
