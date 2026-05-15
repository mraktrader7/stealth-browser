'use strict';

const express = require('express');
const browserService = require('../services/browser.service');

const router = express.Router();

// ─── POST /api/browser/launch ─────────────────────────────────────────────────
router.post('/launch', async (req, res) => {
  const {
    headless = true,
    proxy,
    fingerprint,
  } = req.body || {};

  if (proxy && typeof proxy !== 'string') {
    return res.status(400).json({ error: 'proxy must be a string URL' });
  }

  const { browserId, fingerprint: resolvedFingerprint } = await browserService.launch({
    headless: Boolean(headless),
    proxy,
    fingerprint: fingerprint || {},
  });

  res.status(201).json({
    message: 'Browser launched',
    data: {
      browserId,
      fingerprint: resolvedFingerprint,
    },
  });
});

// ─── GET /api/browser/sessions ────────────────────────────────────────────────
router.get('/sessions', (req, res) => {
  const sessions = browserService.listSessions();
  res.json({ data: sessions, total: sessions.length });
});

// ─── POST /api/browser/screenshot ────────────────────────────────────────────
router.post('/screenshot', async (req, res) => {
  const { browserId, pageId, format = 'png' } = req.body || {};

  if (!browserId) {
    return res.status(400).json({ error: 'browserId is required' });
  }

  // Find page: use provided pageId, or first page belonging to browserId
  let resolvedPageId = pageId;

  if (!resolvedPageId) {
    const sessions = browserService.listSessions();
    const session = sessions.find((s) => s.browserId === browserId);
    if (!session) {
      return res.status(404).json({ error: 'Browser session not found' });
    }
    if (session.pages.length === 0) {
      return res.status(404).json({ error: 'No open pages in this session' });
    }
    resolvedPageId = session.pages[0].pageId;
  }

  // Validate format
  if (!['png', 'jpeg'].includes(format)) {
    return res.status(400).json({ error: 'format must be "png" or "jpeg"' });
  }

  let imageBuffer;
  try {
    imageBuffer = await browserService.screenshot(resolvedPageId, format);
  } catch (err) {
    return res.status(404).json({ error: err.message });
  }

  const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const base64 = imageBuffer.toString('base64');

  res.json({
    data: {
      browserId,
      pageId: resolvedPageId,
      format,
      mimeType,
      base64,
      dataUri: `data:${mimeType};base64,${base64}`,
      size: imageBuffer.length,
    },
  });
});

// ─── POST /api/browser/page ───────────────────────────────────────────────────
// Open a new page inside an existing browser session
router.post('/page', async (req, res) => {
  const { browserId, url } = req.body || {};

  if (!browserId) {
    return res.status(400).json({ error: 'browserId is required' });
  }

  let pageId, page;
  try {
    ({ pageId, page } = await browserService.newPage(browserId));
  } catch (err) {
    return res.status(404).json({ error: err.message });
  }

  if (url) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    } catch (err) {
      // Non-fatal: page opened but navigation failed
      return res.status(200).json({
        data: { pageId },
        warning: `Page opened but navigation failed: ${err.message}`,
      });
    }
  }

  res.status(201).json({ data: { browserId, pageId, url: url || null } });
});

// ─── POST /api/browser/close/:sessionId ──────────────────────────────────────
router.post('/close/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const { type = 'browser' } = req.body || {};

  if (type === 'page') {
    try {
      await browserService.closePage(sessionId);
      return res.json({ message: 'Page closed', pageId: sessionId });
    } catch (err) {
      return res.status(404).json({ error: err.message });
    }
  }

  // Default: close entire browser session
  const sessions = browserService.listSessions();
  const exists = sessions.some((s) => s.browserId === sessionId);
  if (!exists) {
    return res.status(404).json({ error: 'Browser session not found' });
  }

  await browserService.closeBrowser(sessionId);
  res.json({ message: 'Browser session closed', browserId: sessionId });
});

// ─── POST /api/browser/close-all ─────────────────────────────────────────────
router.post('/close-all', async (req, res) => {
  await browserService.closeAll();
  res.json({ message: 'All browser sessions closed' });
});

module.exports = router;
