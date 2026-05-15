/**
 * Scripts.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Script editor page with two modes:
 *   • Code tab     — Monaco editor for writing/editing raw JavaScript
 *   • Playground tab — Visual step builder (ScriptPlayground)
 *
 * Key changes:
 *   - Integrated ScriptPlayground; "Generate & Insert Code" inserts into editor
 *   - Fixed content vs code field mismatch (DB uses `content`, old UI used `code`)
 *   - Added tab switcher: Code | Playground
 */

import React, { useEffect, useState, useCallback, useRef } from 'react'
import Editor from '@monaco-editor/react'
import {
  Plus, Save, Trash2, Code2, FileCode, X, Loader2,
  AlertCircle, CheckCircle2, Wand2, LayoutGrid
} from 'lucide-react'
import { scripts as scriptsApi } from '../utils/api.js'
import { formatDistanceToNow } from 'date-fns'
import ScriptPlayground from '../components/ScriptPlayground.jsx'

// ─── Default template shown for new scripts ───────────────────────────────────
const DEFAULT_TEMPLATE = `/**
 * StealthBrowser Script
 * ─────────────────────────────────────────────────────────────────────────────
 * Available globals (no imports needed):
 *
 *   page        — Playwright Page (browser tab)
 *   log(msg)    — stream a log line to the dashboard
 *   log.info / log.warn / log.error / log.success
 *   sleep(ms)   — await sleep(2000)  →  wait 2 seconds
 *   console.log — same as log.info
 *   fetch(url)  — Node built-in fetch for API calls
 *
 * Tip: Use the Playground tab to build your flow visually,
 *      then generate the code and edit it here.
 */

// Navigate to a page
await page.goto('https://example.com', { waitUntil: 'domcontentloaded' });

// Read the page title
const title = await page.title();
log.success(\`Page title: "\${title}"\`);

// Find all links
const links = await page.$$eval('a', (els) =>
  els.map((a) => ({ text: a.textContent.trim(), href: a.href }))
);
log.info(\`Found \${links.length} link(s)\`);

log.success('Script completed!');
`

// ─── Toast notification ───────────────────────────────────────────────────────
function Toast({ type, message, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500)
    return () => clearTimeout(t)
  }, [onClose])

  const styles = {
    success: 'bg-emerald-900/80 border-emerald-700/50 text-emerald-300',
    error:   'bg-red-900/80 border-red-700/50 text-red-300',
  }

  return (
    <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl border backdrop-blur-sm text-sm font-medium shadow-xl animate-slide-in ${styles[type]}`}>
      {type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
      {message}
      <button onClick={onClose} className="ml-2 opacity-60 hover:opacity-100">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// ─── Generic Modal wrapper ────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl animate-fade-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <h2 className="text-base font-semibold text-slate-100">{title}</h2>
          <button onClick={onClose} className="btn-icon hover:bg-slate-700 text-slate-500 hover:text-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

// ─── Tab button ───────────────────────────────────────────────────────────────
function TabBtn({ active, onClick, icon: Icon, label }) {
  return (
    <button
      onClick={onClick}
      className={[
        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
        active
          ? 'bg-sky-600/20 text-sky-400 border border-sky-500/30'
          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700 border border-transparent',
      ].join(' ')}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Scripts() {
  const [scriptList, setScriptList]   = useState([])
  const [selected, setSelected]       = useState(null)
  const [code, setCode]               = useState('')
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [deleting, setDeleting]       = useState(false)
  const [showCreate, setShowCreate]   = useState(false)
  const [toast, setToast]             = useState(null)
  const [newScript, setNewScript]     = useState({ name: '', description: '', content: DEFAULT_TEMPLATE })
  const [creating, setCreating]       = useState(false)
  const [activeTab, setActiveTab]     = useState('code') // 'code' | 'playground'

  const editorRef = useRef(null)

  const showToast = useCallback((type, message) => setToast({ type, message }), [])

  // ── Load scripts list ──────────────────────────────────────────────────────
  const loadScripts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await scriptsApi.getAll()
      setScriptList(res?.data ?? res ?? [])
    } catch (err) {
      showToast('error', `Failed to load scripts: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => { loadScripts() }, [loadScripts])

  // ── Select a script to edit ────────────────────────────────────────────────
  const handleSelect = useCallback(async (script) => {
    try {
      const full = await scriptsApi.getOne(script.id)
      const data = full?.data ?? full
      setSelected(data)
      // DB field is "content"; handle either for compatibility
      setCode(data.content ?? data.code ?? '')
    } catch (_) {
      setSelected(script)
      setCode(script.content ?? script.code ?? '')
    }
  }, [])

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!selected) return
    setSaving(true)
    try {
      // Always send `content` to match DB schema
      await scriptsApi.update(selected.id, {
        name: selected.name,
        description: selected.description,
        content: code,
      })
      showToast('success', 'Script saved successfully')
      await loadScripts()
    } catch (err) {
      showToast('error', `Save failed: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }, [selected, code, showToast, loadScripts])

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    if (!selected) return
    if (!confirm(`Delete script "${selected.name}"? This cannot be undone.`)) return
    setDeleting(true)
    try {
      await scriptsApi.delete(selected.id)
      showToast('success', 'Script deleted')
      setSelected(null)
      setCode('')
      await loadScripts()
    } catch (err) {
      showToast('error', `Delete failed: ${err.message}`)
    } finally {
      setDeleting(false)
    }
  }, [selected, showToast, loadScripts])

  // ── Create ─────────────────────────────────────────────────────────────────
  const handleCreate = useCallback(async () => {
    if (!newScript.name.trim()) return
    setCreating(true)
    try {
      await scriptsApi.create({
        name: newScript.name.trim(),
        description: newScript.description,
        content: newScript.content,
      })
      showToast('success', `Script "${newScript.name}" created`)
      setShowCreate(false)
      setNewScript({ name: '', description: '', content: DEFAULT_TEMPLATE })
      await loadScripts()
    } catch (err) {
      showToast('error', `Create failed: ${err.message}`)
    } finally {
      setCreating(false)
    }
  }, [newScript, showToast, loadScripts])

  // ── Playground → insert generated code into editor ─────────────────────────
  const handlePlaygroundCode = useCallback((generated) => {
    setCode(generated)
    setActiveTab('code')
    showToast('success', 'Code generated! Review it in the Code tab, then save.')
  }, [showToast])

  return (
    <div className="flex h-full">
      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}

      {/* ── Script List Sidebar ── */}
      <div className="w-72 flex-shrink-0 border-r border-slate-800 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Code2 className="w-4 h-4 text-sky-400" />
            <h1 className="text-sm font-semibold text-slate-200">Scripts</h1>
            <span className="badge bg-slate-700 text-slate-400 text-xs">{scriptList.length}</span>
          </div>
          <button onClick={() => setShowCreate(true)} className="btn-icon hover:bg-sky-600/20 text-sky-400">
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 bg-slate-800 rounded-lg animate-pulse" />
            ))
          ) : scriptList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-600 gap-2 text-center px-4">
              <FileCode className="w-8 h-8" />
              <p className="text-sm">No scripts yet</p>
              <button onClick={() => setShowCreate(true)} className="btn-primary text-xs mt-1">
                <Plus className="w-3.5 h-3.5" /> Create Script
              </button>
            </div>
          ) : (
            scriptList.map((script) => (
              <button
                key={script.id}
                onClick={() => handleSelect(script)}
                className={[
                  'w-full text-left px-3 py-2.5 rounded-lg transition-all',
                  selected?.id === script.id
                    ? 'bg-sky-600/20 border border-sky-500/30 text-sky-300'
                    : 'hover:bg-slate-800 text-slate-300 border border-transparent',
                ].join(' ')}
              >
                <p className="text-sm font-medium truncate">{script.name}</p>
                {script.description && (
                  <p className="text-xs text-slate-500 mt-0.5 truncate">{script.description}</p>
                )}
                {script.updated_at && (
                  <p className="text-xs text-slate-600 mt-0.5">
                    {formatDistanceToNow(new Date(script.updated_at), { addSuffix: true })}
                  </p>
                )}
              </button>
            ))
          )}
        </div>

        <div className="p-3 border-t border-slate-800">
          <button onClick={() => setShowCreate(true)} className="btn-primary w-full text-xs">
            <Plus className="w-3.5 h-3.5" /> New Script
          </button>
        </div>
      </div>

      {/* ── Main Editor Area ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selected ? (
          <>
            {/* ── Toolbar ── */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-slate-900/50">
              <div className="flex items-center gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-200">{selected.name}</h2>
                  {selected.description && (
                    <p className="text-xs text-slate-500 mt-0.5">{selected.description}</p>
                  )}
                </div>
                {/* Tab switcher */}
                <div className="flex items-center gap-1 ml-2">
                  <TabBtn
                    active={activeTab === 'code'}
                    onClick={() => setActiveTab('code')}
                    icon={Code2}
                    label="Code"
                  />
                  <TabBtn
                    active={activeTab === 'playground'}
                    onClick={() => setActiveTab('playground')}
                    icon={Wand2}
                    label="Playground"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button onClick={handleDelete} disabled={deleting} className="btn-danger text-xs">
                  {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  Delete
                </button>
                <button onClick={handleSave} disabled={saving} className="btn-primary text-xs">
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save
                </button>
              </div>
            </div>

            {/* ── Code Tab ── */}
            {activeTab === 'code' && (
              <div className="flex-1 overflow-hidden">
                <Editor
                  height="100%"
                  defaultLanguage="javascript"
                  theme="vs-dark"
                  value={code}
                  onChange={(val) => setCode(val ?? '')}
                  onMount={(editor) => { editorRef.current = editor }}
                  options={{
                    fontSize: 13,
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    fontLigatures: true,
                    minimap: { enabled: true },
                    scrollBeyondLastLine: false,
                    wordWrap: 'on',
                    lineNumbers: 'on',
                    renderLineHighlight: 'gutter',
                    smoothScrolling: true,
                    cursorBlinking: 'smooth',
                    tabSize: 2,
                    padding: { top: 16, bottom: 16 },
                  }}
                />
              </div>
            )}

            {/* ── Playground Tab ── */}
            {activeTab === 'playground' && (
              <div className="flex-1 overflow-hidden">
                <ScriptPlayground onCodeGenerated={handlePlaygroundCode} />
              </div>
            )}
          </>
        ) : (
          /* Empty state — no script selected */
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-slate-600">
            <FileCode className="w-16 h-16 opacity-30" />
            <div className="text-center">
              <p className="text-base font-medium text-slate-500">Select a script to edit</p>
              <p className="text-sm text-slate-600 mt-1">or create a new one</p>
            </div>
            <button onClick={() => setShowCreate(true)} className="btn-primary">
              <Plus className="w-4 h-4" /> New Script
            </button>
          </div>
        )}
      </div>

      {/* ── Create Script Modal ── */}
      {showCreate && (
        <Modal title="New Script" onClose={() => setShowCreate(false)}>
          <div className="space-y-4">
            <div>
              <label className="label">Script Name *</label>
              <input
                className="input"
                placeholder="e.g. scrape-products"
                value={newScript.name}
                onChange={(e) => setNewScript((p) => ({ ...p, name: e.target.value }))}
                autoFocus
              />
            </div>
            <div>
              <label className="label">Description</label>
              <input
                className="input"
                placeholder="What does this script do?"
                value={newScript.description}
                onChange={(e) => setNewScript((p) => ({ ...p, description: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">Initial Code</label>
              <div className="rounded-lg overflow-hidden border border-slate-700">
                <Editor
                  height="400px"
                  defaultLanguage="javascript"
                  theme="vs-dark"
                  value={newScript.content}
                  onChange={(val) => setNewScript((p) => ({ ...p, content: val ?? '' }))}
                  options={{
                    fontSize: 12,
                    fontFamily: "'JetBrains Mono', monospace",
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    wordWrap: 'on',
                    tabSize: 2,
                    padding: { top: 12 },
                  }}
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button onClick={() => setShowCreate(false)} className="btn-secondary">
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !newScript.name.trim()}
                className="btn-primary"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Create Script
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
