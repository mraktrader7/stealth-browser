/**
 * VersionHistory.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Shows the version history for a script and lets the user restore any
 * previous version into the Monaco editor.
 *
 * Props:
 *   scriptId  {string}   — current script ID
 *   onRestore {fn(code)} — called with the old content when user restores
 *   onClose   {fn}       — close the panel
 */

import React, { useEffect, useState, useCallback } from 'react'
import { History, RotateCcw, Trash2, ChevronRight, Loader2, Clock, AlertCircle } from 'lucide-react'
import { scripts as scriptsApi } from '../utils/api.js'
import { formatDistanceToNow, format } from 'date-fns'

export default function VersionHistory({ scriptId, onRestore, onClose }) {
  const [versions, setVersions]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [selected, setSelected]   = useState(null)   // version with full content
  const [loadingId, setLoadingId] = useState(null)
  const [error, setError]         = useState(null)

  const loadVersions = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await scriptsApi.getVersions(scriptId)
      setVersions(res?.data ?? [])
    } catch (err) {
      setError(`Failed to load versions: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [scriptId])

  useEffect(() => { loadVersions() }, [loadVersions])

  const handlePreview = useCallback(async (version) => {
    setLoadingId(version.id)
    try {
      const res = await scriptsApi.getVersion(scriptId, version.id)
      setSelected(res?.data ?? null)
    } catch (err) {
      setError(`Failed to load version: ${err.message}`)
    } finally {
      setLoadingId(null)
    }
  }, [scriptId])

  const handleRestore = useCallback(() => {
    if (!selected) return
    if (onRestore) onRestore(selected.content)
    if (onClose) onClose()
  }, [selected, onRestore, onClose])

  const handleDelete = useCallback(async (version, e) => {
    e.stopPropagation()
    if (!confirm('Delete this version? This cannot be undone.')) return
    try {
      await scriptsApi.deleteVersion(scriptId, version.id)
      setVersions((prev) => prev.filter((v) => v.id !== version.id))
      if (selected?.id === version.id) setSelected(null)
    } catch (err) {
      setError(`Delete failed: ${err.message}`)
    }
  }, [scriptId, selected])

  return (
    <div className="flex flex-col h-full bg-slate-900 border-l border-slate-800">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-violet-400" />
          <span className="text-sm font-semibold text-slate-200">Version History</span>
          {!loading && (
            <span className="badge bg-slate-700 text-slate-400 text-xs">{versions.length}</span>
          )}
        </div>
        <button
          onClick={onClose}
          className="btn-icon hover:bg-slate-700 text-slate-500 hover:text-slate-200 text-sm"
        >
          ✕
        </button>
      </div>

      {error && (
        <div className="mx-3 mt-3 flex items-center gap-2 px-3 py-2 bg-red-900/30 border border-red-700/40 rounded-lg text-xs text-red-400">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* ── Version List ── */}
        <div className="w-52 flex-shrink-0 border-r border-slate-800 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />
            </div>
          ) : versions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
              <Clock className="w-7 h-7 text-slate-700 mb-2" />
              <p className="text-xs text-slate-500">No saved versions yet.</p>
              <p className="text-xs text-slate-600 mt-1">Save the script to create a snapshot.</p>
            </div>
          ) : (
            <ul className="py-2">
              {versions.map((v) => (
                <li key={v.id}>
                  <button
                    onClick={() => handlePreview(v)}
                    className={[
                      'w-full text-left px-3 py-2.5 hover:bg-slate-800 transition-all border-b border-slate-800/50 group flex items-start gap-2',
                      selected?.id === v.id ? 'bg-violet-600/10 border-l-2 border-l-violet-500' : '',
                    ].join(' ')}
                  >
                    <Clock className="w-3 h-3 text-slate-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-300 truncate">
                        {v.label || 'Snapshot'}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {formatDistanceToNow(new Date(v.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 flex-shrink-0">
                      {loadingId === v.id && <Loader2 className="w-3 h-3 animate-spin text-slate-500" />}
                      <button
                        onClick={(e) => handleDelete(v, e)}
                        className="hover:text-red-400 text-slate-600"
                        title="Delete version"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── Preview Pane ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selected ? (
            <>
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800 bg-slate-900/50">
                <div>
                  <p className="text-xs font-semibold text-slate-300">{selected.label || 'Snapshot'}</p>
                  <p className="text-xs text-slate-500">
                    {format(new Date(selected.created_at), 'MMM d, yyyy HH:mm:ss')}
                  </p>
                </div>
                <button
                  onClick={handleRestore}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium rounded-lg transition-all"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Restore This Version
                </button>
              </div>
              <pre className="flex-1 overflow-auto p-4 text-xs font-mono text-slate-300 leading-relaxed bg-slate-950/50 whitespace-pre-wrap">
                {selected.content}
              </pre>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-600 gap-2">
              <ChevronRight className="w-8 h-8 opacity-30" />
              <p className="text-sm text-slate-500">Select a version to preview</p>
              <p className="text-xs text-slate-600 text-center max-w-xs">
                Click a version on the left to see its code, then restore it to the editor.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
