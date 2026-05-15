import React, { useState, useEffect, useCallback } from 'react'
import {
  Settings as SettingsIcon, Save, RotateCcw, CheckCircle2,
  AlertCircle, Globe, Eye, EyeOff, Clock, Cpu, Wifi
} from 'lucide-react'

const DEFAULT_SETTINGS = {
  backendUrl:   'http://localhost:3001',
  headless:     true,
  browserType:  'chromium',
  timeout:      30000,
  concurrency:  3,
  userDataDir:  '',
  proxyUrl:     '',
}

function Toggle({ enabled, onChange, label, description }) {
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <p className="text-sm font-medium text-slate-200">{label}</p>
        {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!enabled)}
        className={[
          'relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent',
          'transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-slate-900',
          enabled ? 'bg-sky-600' : 'bg-slate-600',
        ].join(' ')}
        role="switch"
        aria-checked={enabled}
      >
        <span
          className={[
            'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
            enabled ? 'translate-x-5' : 'translate-x-0',
          ].join(' ')}
        />
      </button>
    </div>
  )
}

function Section({ title, icon: Icon, children }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-700 bg-slate-800/40">
        <Icon className="w-4 h-4 text-sky-400" />
        <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
      </div>
      <div className="px-5 py-2 divide-y divide-slate-700/50">
        {children}
      </div>
    </div>
  )
}

function Field({ label, description, children }) {
  return (
    <div className="py-3">
      <label className="block text-sm font-medium text-slate-200 mb-1">{label}</label>
      {description && <p className="text-xs text-slate-500 mb-2">{description}</p>}
      {children}
    </div>
  )
}

export default function Settings() {
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('stealth_settings')
      if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) }
    } catch (_) {}
    return { ...DEFAULT_SETTINGS }
  })

  const [saved, setSaved]       = useState(false)
  const [error, setError]       = useState(null)
  const [dirty, setDirty]       = useState(false)

  const update = useCallback((key, value) => {
    setSettings((p) => ({ ...p, [key]: value }))
    setDirty(true)
    setSaved(false)
    setError(null)
  }, [])

  const handleSave = useCallback(() => {
    try {
      // Validate URL
      new URL(settings.backendUrl)
      localStorage.setItem('stealth_settings', JSON.stringify(settings))
      setSaved(true)
      setDirty(false)
      setError(null)
      setTimeout(() => setSaved(false), 3000)
    } catch (_) {
      setError('Invalid backend URL. Please enter a valid URL including protocol (http/https).')
    }
  }, [settings])

  const handleReset = useCallback(() => {
    if (!confirm('Reset all settings to defaults?')) return
    setSettings({ ...DEFAULT_SETTINGS })
    localStorage.setItem('stealth_settings', JSON.stringify(DEFAULT_SETTINGS))
    setSaved(true)
    setDirty(false)
    setTimeout(() => setSaved(false), 2000)
  }, [])

  // Warn on unload if dirty
  useEffect(() => {
    if (!dirty) return
    const handler = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SettingsIcon className="w-5 h-5 text-sky-400" />
          <div>
            <h1 className="text-xl font-bold text-slate-100">Settings</h1>
            <p className="text-sm text-slate-500">Configure StealthBrowser behavior</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleReset} className="btn-ghost text-xs">
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </button>
          <button
            onClick={handleSave}
            className={saved ? 'btn-success text-xs' : 'btn-primary text-xs'}
          >
            {saved
              ? <><CheckCircle2 className="w-3.5 h-3.5" /> Saved!</>
              : <><Save className="w-3.5 h-3.5" /> Save Settings</>}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-900/30 border border-red-700/40 text-sm text-red-300">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Unsaved indicator */}
      {dirty && !error && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-yellow-900/20 border border-yellow-700/30 text-xs text-yellow-400">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          You have unsaved changes
        </div>
      )}

      {/* Connection */}
      <Section title="Connection" icon={Globe}>
        <Field
          label="Backend URL"
          description="The URL where your StealthBrowser backend server is running."
        >
          <div className="flex items-center gap-2">
            <input
              className="input flex-1"
              type="url"
              placeholder="http://localhost:3001"
              value={settings.backendUrl}
              onChange={(e) => update('backendUrl', e.target.value)}
            />
            <a
              href={settings.backendUrl + '/api/health'}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary text-xs flex-shrink-0"
              title="Test connection"
            >
              <Wifi className="w-3.5 h-3.5" /> Test
            </a>
          </div>
        </Field>

        <Field
          label="Proxy URL"
          description="Optional HTTP/HTTPS/SOCKS5 proxy for all browser sessions."
        >
          <input
            className="input"
            placeholder="http://user:pass@proxy:8080"
            value={settings.proxyUrl}
            onChange={(e) => update('proxyUrl', e.target.value)}
          />
        </Field>
      </Section>

      {/* Browser */}
      <Section title="Browser" icon={Cpu}>
        <Toggle
          label="Headless Mode"
          description="Run the browser without a visible window. Disable for debugging."
          enabled={settings.headless}
          onChange={(v) => update('headless', v)}
        />

        <Field
          label="Browser Engine"
          description="Choose which Playwright browser engine to use."
        >
          <div className="flex gap-2 mt-1">
            {['chromium', 'firefox', 'webkit'].map((type) => (
              <button
                key={type}
                onClick={() => update('browserType', type)}
                className={[
                  'flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-all capitalize',
                  settings.browserType === type
                    ? 'bg-sky-600/20 border-sky-500/40 text-sky-300'
                    : 'bg-slate-800 border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-300',
                ].join(' ')}
              >
                {type}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-600 mt-2">
            {settings.browserType === 'chromium' && 'Chromium — best compatibility, Playwright default. Supports stealth patches.'}
            {settings.browserType === 'firefox' && 'Firefox — good for sites that block Chromium. Some APIs differ.'}
            {settings.browserType === 'webkit' && 'WebKit (Safari engine) — useful for iOS/macOS fingerprinting scenarios.'}
          </p>
        </Field>

        <Field
          label="User Data Directory"
          description="Path to persist cookies, localStorage, and session data between runs. Leave blank for a fresh profile each run."
        >
          <input
            className="input font-mono text-xs"
            placeholder="/path/to/user-data-dir (optional)"
            value={settings.userDataDir}
            onChange={(e) => update('userDataDir', e.target.value)}
          />
        </Field>
      </Section>

      {/* Performance */}
      <Section title="Performance" icon={Clock}>
        <Field
          label="Navigation Timeout (ms)"
          description="Maximum time to wait for page navigations and network requests."
        >
          <div className="flex items-center gap-3">
            <input
              className="input"
              type="number"
              min={1000}
              max={300000}
              step={1000}
              value={settings.timeout}
              onChange={(e) => update('timeout', Number(e.target.value))}
            />
            <span className="text-xs text-slate-500 flex-shrink-0">
              {(settings.timeout / 1000).toFixed(0)}s
            </span>
          </div>
          <input
            type="range"
            min={1000}
            max={120000}
            step={1000}
            value={settings.timeout}
            onChange={(e) => update('timeout', Number(e.target.value))}
            className="w-full mt-2 accent-sky-500"
          />
        </Field>

        <Field
          label="Max Concurrent Sessions"
          description="Maximum number of browser sessions running simultaneously."
        >
          <div className="flex items-center gap-3">
            <input
              className="input"
              type="number"
              min={1}
              max={20}
              step={1}
              value={settings.concurrency}
              onChange={(e) => update('concurrency', Number(e.target.value))}
            />
            <span className="text-xs text-slate-500 flex-shrink-0">
              session{settings.concurrency !== 1 ? 's' : ''} max
            </span>
          </div>
        </Field>
      </Section>

      {/* Info */}
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 px-5 py-4">
        <p className="text-xs font-medium text-slate-400 mb-2">About StealthBrowser</p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-500">
          <span>Frontend</span><span className="text-slate-400">v1.0.0</span>
          <span>Settings storage</span><span className="text-slate-400">localStorage</span>
          <span>Socket.IO</span><span className="text-slate-400">{settings.backendUrl}</span>
          <span>API base</span><span className="text-slate-400 font-mono">{settings.backendUrl}/api</span>
        </div>
      </div>

      {/* Bottom Save */}
      <div className="flex justify-end pb-4">
        <button
          onClick={handleSave}
          className={saved ? 'btn-success' : 'btn-primary'}
        >
          {saved
            ? <><CheckCircle2 className="w-4 h-4" /> Settings Saved</>
            : <><Save className="w-4 h-4" /> Save Settings</>}
        </button>
      </div>
    </div>
  )
}
