import React, { useEffect, useState, useCallback } from 'react'
import Editor from '@monaco-editor/react'
import {
  Plus, Save, Trash2, Code2, FileCode, X, Loader2, AlertCircle, CheckCircle2
} from 'lucide-react'
import { scripts as scriptsApi } from '../utils/api.js'
import { formatDistanceToNow } from 'date-fns'

const DEFAULT_TEMPLATE = `/**
 * StealthBrowser Script
 * Available globals: browser, page, log, params
 *
 * browser — Playwright browser instance
 * page    — current Page instance
 * log(msg, level?) — emit a log entry (level: info|warn|error|success)
 * params  — task parameters object
 */

async function run({ page, log }) {
  log('Navigating to example.com…', 'info')

  await page.goto('https://example.com', { waitUntil: 'domcontentloaded' })

  const title = await page.title()
  log(\`Page title: "\${title}"\`, 'success')

  const heading = await page.$eval('h1', (el) => el.textContent.trim()).catch(() => null)
  if (heading) {
    log(\`Found heading: "\${heading}"\`, 'info')
  }

  const links = await page.$$eval('a', (els) => els.map((a) => ({ text: a.textContent.trim(), href: a.href })))
  log(\`Found \${links.length} link(s) on the page\`, 'info')
  links.forEach((link) => log(\`  → \${link.text}: \${link.href}\`, 'debug'))

  log('Script completed successfully', 'success')
  return { title, heading, links }
}

module.exports = { run }
`

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

export default function Scripts() {
  const [scriptList, setScriptList]   = useState([])
  const [selected, setSelected]       = useState(null)
  const [code, setCode]               = useState('')
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [deleting, setDeleting]       = useState(false)
  const [showCreate, setShowCreate]   = useState(false)
  const [toast, setToast]             = useState(null)
  const [newScript, setNewScript]     = useState({ name: '', description: '', code: DEFAULT_TEMPLATE })
  const [creating, setCreating]       = useState(false)

  const showToast = useCallback((type, message) => setToast({ type, message }), [])

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

  const handleSelect = useCallback(async (script) => {
    try {
      const full = await scriptsApi.getOne(script.id)
      const data = full?.data ?? full
      setSelected(data)
      setCode(data.code ?? '')
    } catch (_) {
      setSelected(script)
      setCode(script.code ?? '')
    }
  }, [])

  const handleSave = useCallback(async () => {
    if (!selected) return
    setSaving(true)
    try {
      await scriptsApi.update(selected.id, { ...selected, code })
      showToast('success', 'Script saved successfully')
      await loadScripts()
    } catch (err) {
      showToast('error', `Save failed: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }, [selected, code, showToast, loadScripts])

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

  const handleCreate = useCallback(async () => {
    if (!newScript.name.trim()) return
    setCreating(true)
    try {
      await scriptsApi.create(newScript)
      showToast('success', `Script "${newScript.name}" created`)
      setShowCreate(false)
      setNewScript({ name: '', description: '', code: DEFAULT_TEMPLATE })
      await loadScripts()
    } catch (err) {
      showToast('error', `Create failed: ${err.message}`)
    } finally {
      setCreating(false)
    }
  }, [newScript, showToast, loadScripts])

  return (
    <div className="flex h-full">
      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}

      {/* Script List Sidebar */}
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

      {/* Editor Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selected ? (
          <>
            {/* Toolbar */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-slate-900/50">
              <div>
                <h2 className="text-sm font-semibold text-slate-200">{selected.name}</h2>
                {selected.description && (
                  <p className="text-xs text-slate-500 mt-0.5">{selected.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="btn-danger text-xs"
                >
                  {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  Delete
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="btn-primary text-xs"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save
                </button>
              </div>
            </div>

            {/* Monaco Editor */}
            <div className="flex-1 overflow-hidden">
              <Editor
                height="100%"
                defaultLanguage="javascript"
                theme="vs-dark"
                value={code}
                onChange={(val) => setCode(val ?? '')}
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
          </>
        ) : (
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

      {/* Create Modal */}
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
                  value={newScript.code}
                  onChange={(val) => setNewScript((p) => ({ ...p, code: val ?? '' }))}
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
