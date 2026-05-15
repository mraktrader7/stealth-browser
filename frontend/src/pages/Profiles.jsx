import React, { useEffect, useState, useCallback } from 'react'
import {
  ShieldCheck, Plus, Trash2, RefreshCw, User, Database,
  CheckCircle2, AlertCircle, X, Loader2, HardDrive
} from 'lucide-react'
import { profiles as profilesApi } from '../utils/api.js'

function Toast({ type, message, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t) }, [onClose])
  const s = {
    success: 'bg-emerald-900/90 border-emerald-700/50 text-emerald-200',
    error:   'bg-red-900/90 border-red-700/50 text-red-200',
  }
  return (
    <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium shadow-2xl animate-slide-in ${s[type]}`}>
      {type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
      <span>{message}</span>
      <button onClick={onClose} className="ml-2 opacity-60 hover:opacity-100"><X className="w-3 h-3" /></button>
    </div>
  )
}

function CreateModal({ onCreate, onClose }) {
  const [name, setName]           = useState('')
  const [description, setDesc]    = useState('')
  const [creating, setCreating]   = useState(false)

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setCreating(true)
    await onCreate({ name: name.trim(), description: description.trim() })
    setCreating(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="card w-full max-w-md shadow-2xl animate-fade-in">
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-700">
          <div>
            <h2 className="text-base font-semibold text-slate-100">New Browser Profile</h2>
            <p className="text-xs text-slate-500 mt-0.5">Saves cookies &amp; sessions across task runs</p>
          </div>
          <button onClick={onClose} className="btn-icon hover:bg-slate-700 text-slate-500 hover:text-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Profile Name *</label>
            <input
              className="input w-full"
              placeholder="e.g. Twitter Main Account"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Description</label>
            <input
              className="input w-full"
              placeholder="Optional notes about this profile…"
              value={description}
              onChange={(e) => setDesc(e.target.value)}
            />
          </div>
          <div className="bg-sky-900/20 border border-sky-700/30 rounded-xl p-3 text-xs text-sky-300 space-y-1">
            <p className="font-medium">💡 How profiles work</p>
            <p className="text-sky-400/70">Create a profile, run a login script with it once, then reuse the profileId in all future tasks — the browser will already be logged in.</p>
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={!name.trim() || creating} className="btn-primary flex-1">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create Profile
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

export default function Profiles() {
  const [profiles, setProfiles]     = useState([])
  const [loading, setLoading]       = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [deleting, setDeleting]     = useState(null)
  const [toast, setToast]           = useState(null)
  const [copied, setCopied]         = useState(null)

  const showToast = useCallback((type, msg) => setToast({ type, message: msg }), [])

  const fetchProfiles = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const res = await profilesApi.getAll()
      const data = res?.data ?? res ?? []
      setProfiles(Array.isArray(data) ? data : [])
    } catch (err) {
      if (!silent) showToast('error', `Failed to load profiles: ${err.message}`)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [showToast])

  useEffect(() => { fetchProfiles() }, [fetchProfiles])

  const handleCreate = async (data) => {
    try {
      await profilesApi.create(data)
      showToast('success', `Profile "${data.name}" created`)
      fetchProfiles(true)
    } catch (err) {
      showToast('error', `Create failed: ${err.message}`)
    }
  }

  const handleDelete = async (profile) => {
    if (!confirm(`Delete profile "${profile.name}"?\n\nThis will permanently erase all saved sessions and cookies.`)) return
    setDeleting(profile.id)
    try {
      await profilesApi.delete(profile.id)
      showToast('success', `Profile "${profile.name}" deleted`)
      fetchProfiles(true)
    } catch (err) {
      showToast('error', `Delete failed: ${err.message}`)
    } finally {
      setDeleting(null)
    }
  }

  const copyId = (id) => {
    navigator.clipboard.writeText(id).then(() => {
      setCopied(id)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
      {showCreate && <CreateModal onCreate={handleCreate} onClose={() => setShowCreate(false)} />}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-violet-400" />
          <div>
            <h1 className="text-xl font-bold text-slate-100">Browser Profiles</h1>
            <p className="text-sm text-slate-500">Named persistent sessions — stay logged in across task runs</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => fetchProfiles()} disabled={loading} className="btn-secondary text-xs">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button onClick={() => setShowCreate(true)} className="btn-primary text-xs">
            <Plus className="w-3.5 h-3.5" />
            New Profile
          </button>
        </div>
      </div>

      {/* How-to card */}
      <div className="card p-4 bg-violet-900/10 border border-violet-700/20">
        <p className="text-xs text-violet-300 font-medium mb-1">🔐 How to use profiles</p>
        <ol className="text-xs text-violet-400/70 space-y-0.5 list-decimal ml-4">
          <li>Create a profile below (e.g. "Twitter Main")</li>
          <li>Copy its ID and run a login script with that profileId once</li>
          <li>All future task runs using the same profileId start already logged in</li>
        </ol>
      </div>

      {/* Profile list */}
      {loading ? (
        <div className="card p-8 text-center text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
          <p className="text-sm">Loading profiles…</p>
        </div>
      ) : profiles.length === 0 ? (
        <div className="card p-12 text-center">
          <ShieldCheck className="w-10 h-10 text-slate-700 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">No profiles yet</p>
          <p className="text-slate-600 text-sm mt-1">Create a profile to start saving browser sessions</p>
          <button onClick={() => setShowCreate(true)} className="btn-primary text-sm mt-4">
            <Plus className="w-4 h-4" />
            Create First Profile
          </button>
        </div>
      ) : (
        <div className="grid gap-3">
          {profiles.map((p) => (
            <div key={p.id} className="card p-4 flex items-center gap-4 hover:border-slate-600 transition-colors">
              {/* Icon */}
              <div className="p-2.5 rounded-xl bg-violet-500/10 text-violet-400 shrink-0">
                <User className="w-5 h-5" />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-semibold text-slate-100 truncate">{p.name}</p>
                </div>
                {p.description && (
                  <p className="text-xs text-slate-500 truncate">{p.description}</p>
                )}
                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                  {/* ID copy button */}
                  <button
                    onClick={() => copyId(p.id)}
                    className="font-mono text-xs text-slate-600 hover:text-sky-400 transition-colors flex items-center gap-1"
                    title="Click to copy profile ID"
                  >
                    {copied === p.id ? (
                      <><CheckCircle2 className="w-3 h-3 text-emerald-400" /> <span className="text-emerald-400">Copied!</span></>
                    ) : (
                      <>{p.id.slice(0, 20)}…</>
                    )}
                  </button>

                  {/* Size */}
                  {p.size != null && (
                    <span className="flex items-center gap-1 text-xs text-slate-600">
                      <HardDrive className="w-3 h-3" />
                      {formatBytes(p.size)}
                    </span>
                  )}

                  {/* Dates */}
                  {p.createdAt && (
                    <span className="text-xs text-slate-600">
                      Created {new Date(p.createdAt).toLocaleDateString()}
                    </span>
                  )}
                  {p.updatedAt && (
                    <span className="text-xs text-slate-600">
                      · Last used {new Date(p.updatedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <button
                onClick={() => handleDelete(p)}
                disabled={deleting === p.id}
                className="btn-icon hover:bg-red-900/20 hover:text-red-400 text-slate-600 shrink-0"
                title="Delete profile"
              >
                {deleting === p.id
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Trash2 className="w-4 h-4" />}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Stats footer */}
      {profiles.length > 0 && (
        <div className="text-xs text-slate-600 text-center">
          {profiles.length} profile{profiles.length !== 1 ? 's' : ''} ·{' '}
          {formatBytes(profiles.reduce((acc, p) => acc + (p.size || 0), 0))} total
        </div>
      )}
    </div>
  )
}
