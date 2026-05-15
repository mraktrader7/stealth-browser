'use strict';

const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { v4: uuidv4 } = require('uuid');

// Apply stealth plugin to playwright-extra's chromium
chromium.use(StealthPlugin());

// ─── Fingerprint helpers ──────────────────────────────────────────────────────

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0',
];

const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1680, height: 1050 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 800 },
  { width: 1536, height: 864 },
];

const LOCALES = ['en-US', 'en-GB', 'en-CA', 'en-AU'];
const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'America/Denver',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
];

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Build a randomized fingerprint profile
function buildFingerprint(overrides = {}) {
  return {
    userAgent: overrides.userAgent || randomFrom(USER_AGENTS),
    viewport: overrides.viewport || randomFrom(VIEWPORTS),
    locale: overrides.locale || randomFrom(LOCALES),
    timezoneId: overrides.timezoneId || randomFrom(TIMEZONES),
    deviceScaleFactor: overrides.deviceScaleFactor || randomFrom([1, 1, 1, 2]),
    hardwareConcurrency: overrides.hardwareConcurrency || randomFrom([2, 4, 4, 8, 8, 16]),
    deviceMemory: overrides.deviceMemory || randomFrom([4, 8, 8, 16]),
    platform: overrides.platform || 'Win32',
  };
}

// Inject canvas and WebGL noise scripts into the page
const ANTI_DETECT_INIT_SCRIPT = `
  // Randomize canvas fingerprint slightly
  (function() {
    const origGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      const ctx = origGetContext.call(this, type, ...args);
      if (ctx && (type === '2d')) {
        const origFillText = ctx.fillText.bind(ctx);
        ctx.fillText = function(...fArgs) {
          ctx.globalAlpha = 0.999 + Math.random() * 0.001;
          return origFillText(...fArgs);
        };
      }
      return ctx;
    };
  })();

  // Spoof hardware concurrency
  Object.defineProperty(navigator, 'hardwareConcurrency', {
    get: () => __HARDWARE_CONCURRENCY__,
  });

  // Spoof device memory
  try {
    Object.defineProperty(navigator, 'deviceMemory', {
      get: () => __DEVICE_MEMORY__,
    });
  } catch(e) {}

  // Remove webdriver artifacts
  Object.defineProperty(navigator, 'webdriver', { get: () => false });

  // Spoof platform
  Object.defineProperty(navigator, 'platform', { get: () => '__PLATFORM__' });

  // Prevent language/plugin leaks
  Object.defineProperty(navigator, 'plugins', {
    get: () => {
      const arr = [1, 2, 3];
      arr.__proto__ = PluginArray.prototype;
      return arr;
    },
  });
`;

// ─── BrowserService ───────────────────────────────────────────────────────────

class BrowserService {
  constructor() {
    /** @type {Map<string, { browser: import('playwright').Browser, sessionId: string, createdAt: Date, options: object }>} */
    this.browsers = new Map();

    /** @type {Map<string, { page: import('playwright').Page, sessionId: string, browserId: string }>} */
    this.pages = new Map();
  }

  /**
   * Launch a new browser instance.
   * @param {object} options
   * @param {boolean} [options.headless=true]
   * @param {string}  [options.proxy]              e.g. "http://user:pass@host:port"
   * @param {object}  [options.fingerprint]        override specific fingerprint values
   * @param {string}  [options.browserId]          optional stable ID (generated if omitted)
   * @returns {Promise<{ browserId: string, fingerprint: object }>}
   */
  async launch(options = {}) {
    const {
      headless = true,
      proxy,
      fingerprint: fingerprintOverrides = {},
      browserId: requestedId,
    } = options;

    const browserId = requestedId || uuidv4();
    const fingerprint = buildFingerprint(fingerprintOverrides);

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

    if (proxy) {
      launchOptions.proxy = { server: proxy };
    }

    const browser = await chromium.launch(launchOptions);

    this.browsers.set(browserId, {
      browser,
      sessionId: browserId,
      createdAt: new Date(),
      options: { headless, proxy },
      fingerprint,
    });

    console.log(`[BrowserService] Launched browser ${browserId} (headless=${headless})`);
    return { browserId, fingerprint };
  }

  /**
   * Open a new page (tab) within an existing browser session.
   * @param {string} browserId   The browser instance ID
   * @param {string} [pageId]    Optional stable page ID (generated if omitted)
   * @returns {Promise<{ pageId: string, page: import('playwright').Page }>}
   */
  async newPage(browserId, pageId) {
    const session = this.browsers.get(browserId);
    if (!session) {
      throw new Error(`Browser session not found: ${browserId}`);
    }

    const { browser, fingerprint } = session;
    const resolvedPageId = pageId || uuidv4();

    // Create browser context with spoofed fingerprint
    const context = await browser.newContext({
      userAgent: fingerprint.userAgent,
      viewport: fingerprint.viewport,
      locale: fingerprint.locale,
      timezoneId: fingerprint.timezoneId,
      deviceScaleFactor: fingerprint.deviceScaleFactor,
      permissions: ['geolocation'],
      colorScheme: 'light',
      extraHTTPHeaders: {
        'Accept-Language': `${fingerprint.locale},en;q=0.9`,
        'Accept-Encoding': 'gzip, deflate, br',
      },
    });

    // Inject anti-detect scripts on every new document
    const initScript = ANTI_DETECT_INIT_SCRIPT
      .replace('__HARDWARE_CONCURRENCY__', fingerprint.hardwareConcurrency)
      .replace('__DEVICE_MEMORY__', fingerprint.deviceMemory)
      .replace('__PLATFORM__', fingerprint.platform);

    await context.addInitScript(initScript);

    const page = await context.newPage();

    this.pages.set(resolvedPageId, {
      page,
      pageId: resolvedPageId,
      browserId,
      context,
      createdAt: new Date(),
    });

    console.log(`[BrowserService] New page ${resolvedPageId} in browser ${browserId}`);
    return { pageId: resolvedPageId, page };
  }

  /**
   * Retrieve an existing page by its ID.
   * @param {string} pageId
   * @returns {import('playwright').Page}
   */
  getPage(pageId) {
    const session = this.pages.get(pageId);
    if (!session) {
      throw new Error(`Page not found: ${pageId}`);
    }
    return session.page;
  }

  /**
   * Take a screenshot of the current page in a given page session.
   * @param {string} pageId
   * @param {'png'|'jpeg'} [format='png']
   * @returns {Promise<Buffer>}
   */
  async screenshot(pageId, format = 'png') {
    const page = this.getPage(pageId);
    return page.screenshot({ type: format, fullPage: false });
  }

  /**
   * Close a specific page session.
   * @param {string} pageId
   */
  async closePage(pageId) {
    const session = this.pages.get(pageId);
    if (!session) return;

    try {
      await session.context.close();
    } catch (err) {
      console.warn(`[BrowserService] Error closing page ${pageId}:`, err.message);
    }

    this.pages.delete(pageId);
    console.log(`[BrowserService] Closed page ${pageId}`);
  }

  /**
   * Close a browser instance and all its associated pages.
   * @param {string} browserId
   */
  async closeBrowser(browserId) {
    const session = this.browsers.get(browserId);
    if (!session) return;

    // Close all pages belonging to this browser
    for (const [pid, pdata] of this.pages.entries()) {
      if (pdata.browserId === browserId) {
        try {
          await pdata.context.close();
        } catch (_) { /* ignore */ }
        this.pages.delete(pid);
      }
    }

    try {
      await session.browser.close();
    } catch (err) {
      console.warn(`[BrowserService] Error closing browser ${browserId}:`, err.message);
    }

    this.browsers.delete(browserId);
    console.log(`[BrowserService] Closed browser ${browserId}`);
  }

  /**
   * Close all active browser instances.
   */
  async closeAll() {
    const ids = [...this.browsers.keys()];
    await Promise.allSettled(ids.map((id) => this.closeBrowser(id)));
    console.log('[BrowserService] All sessions closed');
  }

  /**
   * List active browser sessions (without the raw browser objects).
   */
  listSessions() {
    const result = [];
    for (const [browserId, session] of this.browsers.entries()) {
      const pages = [];
      for (const [pid, pdata] of this.pages.entries()) {
        if (pdata.browserId === browserId) {
          pages.push({ pageId: pid, createdAt: pdata.createdAt });
        }
      }
      result.push({
        browserId,
        createdAt: session.createdAt,
        headless: session.options.headless,
        hasProxy: !!session.options.proxy,
        fingerprint: session.fingerprint,
        openPages: pages.length,
        pages,
      });
    }
    return result;
  }
}

// Singleton
const browserService = new BrowserService();
module.exports = browserService;
