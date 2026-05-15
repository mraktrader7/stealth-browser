import React, { useEffect, useState, useCallback, useContext } from 'react'
import {
  Plus, Play, Square, Trash2, ListTodo, X, Loader2,
  AlertCircle, CheckCircle2, Clock, ChevronRight, ChevronDown,
  User, UserPlus, RefreshCw, ShieldCheck, Zap, Database,
  Tag, History, BarChart2, Hash, Repeat, Edit2, Check
} from 'lucide-react'
import { tasks as tasksApi, scripts as scriptsApi, profiles as profilesApi } from '../utils/api.js'
import { SocketContext } from '../App.jsx'
import { formatDistanceToNow, format } from 'date-fns'
import LogPanel from '../components/LogPanel.jsx'

// ─── Status badge styles ──────────────────────────────────────────────────────
const STATUS_STYLES = {
  running:   'badge bg-sky-900/60 text-sky-300 border border-sky-700/40',
  completed: 'badge bg-emerald-900/60 text-emerald-300 border border-emerald-700/40',
  failed:    'badge bg-red-900/60 text-red-300 border border-red-700/40',
  stopped:   'badge bg-yellow-900/60 text-yellow-300 border border-yellow-700/40',
  pending:   'badge bg-violet-900/60 text-violet-300 border border-violet-700/40',
  idle:      'badge bg-slate-700/60 text-slate-400',
}

const RUN_STATUS_STYLES = {
  completed: 'text-emerald-400',
  failed:    'text-red-400',
  stopped:   'text-yellow-400',
  running:   'text-sky-400',
}

// ─── Sub-components ───────────────────────────────────────────────────────────
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

function Modal({ title, subtitle, onClose, children, maxWidth = 'max-w-lg' }) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className={`card w-full ${maxWidth} shadow-2xl animate-fade-in max-h-[90vh] flex flex-col`}>
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-700 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-100">{title}</h2>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="btn-icon hover:bg-slate-700 text-slate-500 hover:text-slate-200 mt-0.5">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

// ─── Tag chip ──────────────────────────────────────────────────────────────────
function TagChip({ tag, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-900/40 border border-sky-700/40 text-sky-300 text-xs">
      <Hash className="w-2.5 h-2.5" />{tag}
      {onRemove && (
        <button onClick={() => onRemove(tag)} className="ml-0.5 hover:text-red-400 leading-none">×</button>
      )}
    </span>
  )
}

// ─── Tag filter bar ────────────────────────────────────────────────────────────
function TagFilter({ allTags, activeTag, onSelect }) {
  if (!allTags.length) return null
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-slate-500">Filter:</span>
      <button
        onClick={() => onSelect(null)}
        className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
          !activeTag ? 'border-sky-500 text-sky-300 bg-sky-900/30' : 'border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-400'
        }`}
      >
        All
      </button>
      {allTags.map(tag => (
        <button
          key={tag}
          onClick={() => onSelect(activeTag === tag ? null : tag)}
          className={`text-xs px-2.5 py-1 rounded-full border transition-all flex items-center gap-1 ${
            activeTag === tag ? 'border-sky-500 text-sky-300 bg-sky-900/30' : 'border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-400'
          }`}
        >
          <Hash className="w-2.5 h-2.5" />{tag}
        </button>
      ))}
    </div>
  )
}

// ─── Run History Panel ────────────────────────────────────────────────────────
function RunHistoryPanel({ taskId }) {
  const [runs, setRuns]   = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!taskId) return
    setLoading(true)
    tasksApi.getRuns(taskId, { limit: 10 })
      .then(res => {
        setRuns(res?.data?.rows ?? [])
        setStats(res?.stats ?? null)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [taskId])

  const fmtDuration = (ms) => {
    if (!ms) return '—'
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  return (
    <div className="space-y-3">
      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'Total Runs', value: stats.total, color: 'text-slate-300' },
            { label: 'Completed', value: stats.completed, color: 'text-emerald-400' },
            { label: 'Failed', value: stats.failed, color: 'text-red-400' },
            { label: 'Avg Duration', value: fmtDuration(stats.avgDuration ? Math.round(stats.avgDuration) : null), color: 'text-sky-400' },
          ].map(s => (
            <div key={s.label} className="bg-slate-800/60 rounded-lg px-3 py-2 text-center">
              <div className={`text-base font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-slate-600">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Run list */}
      {loading ? (
        <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-slate-500" /></div>
      ) : runs.length === 0 ? (
        <p className="text-xs text-slate-600 text-center py-3">No runs yet</p>
      ) : (
        <div className="space-y-1">
          {runs.map(run => (
            <div key={run.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-800/40 text-xs">
              <span className={`font-medium shrink-0 ${RUN_STATUS_STYLES[run.status] ?? 'text-slate-400'}`}>
                {run.status}
              </span>
              <span className="text-slate-400 shrink-0">{format(new Date(run.started_at), 'MMM d, HH:mm:ss')}</span>
              <span className="text-slate-500 shrink-0">{fmtDuration(run.duration_ms)}</span>
              {run.error && <span className="text-red-400 truncate" title={run.error}>{run.error}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Profile mode selector card
function ProfileModeCard({ icon: Icon, title, description, selected, onClick, color = 'sky' }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 rounded-xl border transition-all duration-150 ${selected ? `ring-2 ${color === 'sky' ? 'ring-sky-500 bg-sky-900/20 border-sky-700/50' : 'ring-violet-500 bg-violet-900/20 border-violet-700/50'}` : 'border-slate-700 hover:border-slate-600 hover:bg-slate-800/50'}`}
    >
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${selected ? (color === 'sky' ? 'bg-sky-500/20 text-sky-400' : 'bg-violet-500/20 text-violet-400') : 'bg-slate-700/50 text-slate-500'}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-semibold ${selected ? (color === 'sky' ? 'text-sky-300' : 'text-violet-300') : 'text-slate-300'}`}>{title}</div>
          <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">{description}</div>
        </div>
        <div className={`w-4 h-4 rounded-full border-2 mt-0.5 flex items-center justify-center shrink-0 transition-all ${selected ? (color === 'sky' ? 'border-sky-500 bg-sky-500' : 'border-violet-500 bg-violet-500') : 'border-slate-600'}`}>
          {selected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
        </div>
      </div>
    </button>
  )
}

// ─── Run Options Modal ────────────────────────────────────────────────────────
function RunModal({ task, profiles, onRun, onClose, onCreateProfile }) {
  const [mode, setMode]               = useState('fresh')
  const [selectedProfile, setSelectedProfile] = useState('')
  const [newProfileName, setNewProfileName]   = useState('')
  const [creating, setCreating]   = useState(false)
  const [running, setRunning]     = useState(false)
  const [showNewProfile, setShowNewProfile] = useState(false)

  const canRun = mode === 'fresh' || (mode === 'profile' && selectedProfile)

  const handleRun = async () => {
    setRunning(true)
    await onRun({ profileId: mode === 'profile' ? selectedProfile : undefined })
    setRunning(false)
  }

  const handleCreateProfile = async () => {
    if (!newProfileName.trim()) return
    setCreating(true)
    const id = await onCreateProfile(newProfileName.trim())
    setCreating(false)
    if (id) { setSelectedProfile(id); setShowNewProfile(false); setNewProfileName('') }
  }

  // Keyboard: Enter to run when ready
  useEffect(() => {
    const h = (e) => { if (e.key === 'Enter' && canRun && !running) handleRun() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [canRun, running, mode, selectedProfile])

  return (
    <Modal
      title={`Run: ${task.name}`}
      subtitle="Choose how to run this task — fresh or with a saved session"
      onClose={onClose}
      maxWidth="max-w-md"
    >
      <div className="space-y-3">
        <div className="space-y-2">
          <ProfileModeCard icon={Zap} title="Fresh Browser" description="Start clean — no cookies, no saved login. Each run is completely independent. Best for public scraping." selected={mode === 'fresh'} onClick={() => setMode('fresh')} color="sky" />
          <ProfileModeCard icon={ShieldCheck} title="Use Saved Profile" description="Reuse cookies & sessions from a previous run. Stay logged in automatically." selected={mode === 'profile'} onClick={() => setMode('profile')} color="violet" />
        </div>

        {mode === 'profile' && (
          <div className="space-y-2 pt-1">
            <label className="label flex items-center gap-1.5"><Database className="w-3 h-3" /> Select Profile</label>
            {profiles.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-600 p-4 text-center text-sm text-slate-500">No profiles yet. Create one below to save your login sessions.</div>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {profiles.map((p) => (
                  <button key={p.id} onClick={() => setSelectedProfile(p.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all ${selectedProfile === p.id ? 'border-violet-500/60 bg-violet-900/20 text-violet-200' : 'border-slate-700 hover:border-slate-600 hover:bg-slate-800/50 text-slate-300'}`}>
                    <div className={`p-1.5 rounded-md ${selectedProfile === p.id ? 'bg-violet-500/20' : 'bg-slate-700/50'}`}><User className="w-3.5 h-3.5" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{p.name}</div>
                      {p.description && <div className="text-xs text-slate-500 truncate">{p.description}</div>}
                    </div>
                    {selectedProfile === p.id && <CheckCircle2 className="w-4 h-4 text-violet-400 shrink-0" />}
                  </button>
                ))}
              </div>
            )}
            {!showNewProfile ? (
              <button onClick={() => setShowNewProfile(true)} className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-dashed border-slate-600 hover:border-slate-500 text-sm text-slate-500 hover:text-slate-400 transition-all">
                <UserPlus className="w-3.5 h-3.5" /> Create New Profile
              </button>
            ) : (
              <div className="flex gap-2">
                <input className="input flex-1 text-sm" placeholder="Profile name" value={newProfileName} onChange={(e) => setNewProfileName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCreateProfile()} autoFocus />
                <button onClick={handleCreateProfile} disabled={creating || !newProfileName.trim()} className="btn-secondary text-xs px-3">
                  {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Create'}
                </button>
                <button onClick={() => { setShowNewProfile(false); setNewProfileName('') }} className="btn-ghost text-xs px-2"><X className="w-3.5 h-3.5" /></button>
              </div>
            )}
            {mode === 'profile' && !selectedProfile && <p className="text-xs text-amber-500 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Select or create a profile to continue</p>}
          </div>
        )}

        <div className={`rounded-lg p-3 text-xs leading-relaxed ${mode === 'fresh' ? 'bg-sky-900/20 text-sky-400 border border-sky-800/30' : 'bg-violet-900/20 text-violet-400 border border-violet-800/30'}`}>
          {mode === 'fresh' ? <>🚀 <strong>Fresh mode:</strong> Brand new browser every run. Cookies deleted when task ends.</> : selectedProfile ? <>🔐 <strong>Profile mode:</strong> Browser will load saved cookies from <em>{profiles.find(p => p.id === selectedProfile)?.name}</em>.</> : <>🔐 <strong>Profile mode:</strong> Cookies are saved to disk and reused on the next run.</>}
        </div>
        <p className="text-xs text-slate-600 text-right">Press <kbd className="bg-slate-700 rounded px-1">Enter</kbd> to run</p>

        <div className="flex items-center justify-end gap-3 pt-1">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleRun} disabled={running || !canRun}
            className={`btn ${mode === 'fresh' ? 'btn-primary' : 'bg-violet-600 hover:bg-violet-500 text-white inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all duration-150 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed'}`}>
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {running ? 'Starting…' : mode === 'fresh' ? 'Run Fresh' : 'Run with Profile'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Expanded task panel: tabs (Logs | History | Stats) ───────────────────────
function ExpandedTaskPanel({ task }) {
  const [tab, setTab] = useState('logs')
  return (
    <div className="border-t border-slate-700/60 bg-slate-950/40">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 pt-3 pb-0">
        {[
          { id: 'logs',    label: 'Live Logs',    icon: null },
          { id: 'history', label: 'Run History',  icon: History },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-t-lg border-b-2 transition-all ${tab === t.id ? 'text-sky-400 border-sky-500 bg-slate-800/60' : 'text-slate-500 border-transparent hover:text-slate-300'}`}>
            {t.icon && <t.icon className="w-3 h-3" />}{t.label}
          </button>
        ))}
      </div>

      <div className="p-4">
        {tab === 'logs' && <LogPanel maxHeight="220px" filter={task.id} />}
        {tab === 'history' && <RunHistoryPanel taskId={task.id} />}
      </div>
    </div>
  )
}

// ─── Tag editor (inline) ──────────────────────────────────────────────────────
function TagEditor({ tags = [], onChange }) {
  const [input, setInput] = useState('')

  const addTag = () => {
    const t = input.trim().toLowerCase()
    if (t && !tags.includes(t) && tags.length < 8) {
      onChange([...tags, t])
      setInput('')
    }
  }

  const removeTag = (tag) => onChange(tags.filter(t => t !== tag))

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 min-h-[28px]">
        {tags.map(t => <TagChip key={t} tag={t} onRemove={removeTag} />)}
        {tags.length === 0 && <span className="text-xs text-slate-600 italic">No tags</span>}
      </div>
      <div className="flex gap-2">
        <input
          className="input flex-1 text-xs py-1.5"
          placeholder="Add tag (press Enter)"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
        />
        <button onClick={addTag} disabled={!input.trim()} className="btn-secondary text-xs px-2 py-1.5">Add</button>
      </div>
    </div>
  )
}

// ─── Main Tasks page ──────────────────────────────────────────────────────────
export default function Tasks() {
  const { taskStatuses } = useContext(SocketContext)
  const [taskList,    setTaskList]    = useState([])
  const [scriptList,  setScriptList]  = useState([])
  const [profileList, setProfileList] = useState([])
  const [loading,     setLoading]     = useState(true)
  const [toast,       setToast]       = useState(null)
  const [showCreate,  setShowCreate]  = useState(false)
  const [creating,    setCreating]    = useState(false)
  const [expandedId,  setExpandedId]  = useState(null)
  const [runTarget,   setRunTarget]   = useState(null)
  const [actionLoading, setActionLoading] = useState({})
  const [activeTag,   setActiveTag]   = useState(null)
  const [newTask, setNewTask] = useState({
    name: '', script_id: '', cron_expression: '', tags: [], run_limit: '',
  })

  const showToast = useCallback((type, message) => setToast({ type, message }), [])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [taskRes, scriptRes, profileRes] = await Promise.allSettled([
        tasksApi.getAll(),
        scriptsApi.getAll(),
        profilesApi.getAll(),
      ])
      setTaskList(   taskRes.status    === 'fulfilled' ? (taskRes.value?.data    ?? []) : [])
      setScriptList( scriptRes.status  === 'fulfilled' ? (scriptRes.value?.data  ?? []) : [])
      setProfileList(profileRes.status === 'fulfilled' ? (profileRes.value?.data ?? []) : [])
    } catch (err) {
      showToast('error', `Failed to load: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => { loadData() }, [loadData])

  const setAction = (id, state) => setActionLoading(p => ({ ...p, [id]: state }))

  const handleRun = useCallback(async (task, opts = {}) => {
    setAction(task.id, 'running')
    setRunTarget(null)
    try {
      await tasksApi.run(task.id, opts)
      showToast('success', `"${task.name}" started${opts.profileId ? ' with profile' : ''}`)
      setTimeout(loadData, 800)
    } catch (err) {
      showToast('error', `Failed to run: ${err.message}`)
    } finally {
      setAction(task.id, null)
    }
  }, [showToast, loadData])

  const handleStop = useCallback(async (task) => {
    setAction(task.id, 'stopping')
    try {
      await tasksApi.stop(task.id)
      showToast('success', `"${task.name}" stopped`)
      await loadData()
    } catch (err) {
      showToast('error', `Stop failed: ${err.message}`)
    } finally {
      setAction(task.id, null)
    }
  }, [showToast, loadData])

  const handleDelete = useCallback(async (task) => {
    if (!confirm(`Delete task "${task.name}"?`)) return
    setAction(task.id, 'deleting')
    try {
      await tasksApi.delete(task.id)
      showToast('success', 'Task deleted')
      if (expandedId === task.id) setExpandedId(null)
      await loadData()
    } catch (err) {
      showToast('error', `Delete failed: ${err.message}`)
    } finally {
      setAction(task.id, null)
    }
  }, [showToast, loadData, expandedId])

  const handleCreate = useCallback(async () => {
    if (!newTask.name.trim() || !newTask.script_id) return
    setCreating(true)
    try {
      await tasksApi.create({
        name:            newTask.name.trim(),
        script_id:       newTask.script_id,
        cron_expression: newTask.cron_expression || null,
        tags:            newTask.tags,
        run_limit:       newTask.run_limit ? parseInt(newTask.run_limit, 10) : null,
      })
      showToast('success', `Task "${newTask.name}" created`)
      setShowCreate(false)
      setNewTask({ name: '', script_id: '', cron_expression: '', tags: [], run_limit: '' })
      await loadData()
    } catch (err) {
      showToast('error', `Create failed: ${err.message}`)
    } finally {
      setCreating(false)
    }
  }, [newTask, showToast, loadData])

  const handleCreateProfile = useCallback(async (name) => {
    try {
      const res = await profilesApi.create({ name })
      const id  = res?.data?.id
      showToast('success', `Profile "${name}" created`)
      await loadData()
      return id
    } catch (err) {
      showToast('error', `Profile creation failed: ${err.message}`)
      return null
    }
  }, [showToast, loadData])

  // Collect all unique tags from all tasks
  const allTags = [...new Set(taskList.flatMap(t => Array.isArray(t.tags) ? t.tags : []))]

  // Filter tasks by active tag
  const filteredTasks = activeTag
    ? taskList.filter(t => Array.isArray(t.tags) && t.tags.includes(activeTag))
    : taskList

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}

      {runTarget && (
        <RunModal
          task={runTarget}
          profiles={profileList}
          onRun={(opts) => handleRun(runTarget, opts)}
          onClose={() => setRunTarget(null)}
          onCreateProfile={handleCreateProfile}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ListTodo className="w-5 h-5 text-sky-400" />
          <div>
            <h1 className="text-xl font-bold text-slate-100">Tasks</h1>
            <p className="text-sm text-slate-500">Manage and run automation tasks</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadData} className="btn-ghost p-2" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            <Plus className="w-4 h-4" /> New Task
          </button>
        </div>
      </div>

      {/* Profiles summary bar */}
      {profileList.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-900/20 border border-violet-800/30 text-sm text-violet-300">
          <Database className="w-4 h-4 shrink-0" />
          <span>
            <strong>{profileList.length}</strong> saved profile{profileList.length !== 1 ? 's' : ''} available:{' '}
            {profileList.map(p => p.name).join(', ')}
          </span>
        </div>
      )}

      {/* Tag filter */}
      {allTags.length > 0 && (
        <TagFilter allTags={allTags} activeTag={activeTag} onSelect={setActiveTag} />
      )}

      {/* Task List */}
      <div className="space-y-2">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card p-4 h-16 animate-pulse bg-slate-800/50" />
          ))
        ) : filteredTasks.length === 0 ? (
          <div className="card flex flex-col items-center justify-center py-16 gap-4">
            <ListTodo className="w-12 h-12 text-slate-600" />
            <div className="text-center">
              <p className="text-slate-400 font-medium">{activeTag ? `No tasks tagged #${activeTag}` : 'No tasks yet'}</p>
              <p className="text-sm text-slate-600 mt-1">{activeTag ? 'Clear filter to see all tasks' : 'Create a task to start automating'}</p>
            </div>
            {!activeTag && (
              <button onClick={() => setShowCreate(true)} className="btn-primary">
                <Plus className="w-4 h-4" /> Create Task
              </button>
            )}
          </div>
        ) : (
          filteredTasks.map((task) => {
            const liveStatus = taskStatuses?.[task.id]?.status ?? task.status ?? 'idle'
            const statusCls  = STATUS_STYLES[liveStatus] ?? STATUS_STYLES.idle
            const isExpanded = expandedId === task.id
            const busy       = actionLoading[task.id]
            const isRunning  = liveStatus === 'running'
            const tags       = Array.isArray(task.tags) ? task.tags : []
            const atLimit    = task.run_limit !== null && task.run_count >= task.run_limit

            return (
              <div key={task.id} className="card overflow-hidden transition-all">
                <div className="flex items-center gap-3 px-4 py-3.5">
                  {/* Expand toggle */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : task.id)}
                    className="btn-icon hover:bg-slate-700 text-slate-500 shrink-0"
                  >
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>

                  {/* Task info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-200 truncate">{task.name}</span>
                      <span className={statusCls}>{liveStatus}</span>
                      {atLimit && (
                        <span className="badge bg-orange-900/50 text-orange-300 border border-orange-700/40" title="Run limit reached">
                          <Repeat className="w-2.5 h-2.5 mr-0.5 inline" />limit reached
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
                      {task.script_name && (
                        <span className="flex items-center gap-1">
                          <span className="text-slate-600">Script:</span> {task.script_name}
                        </span>
                      )}
                      {task.cron_expression && (
                        <span className="flex items-center gap-1 font-mono">
                          <Clock className="w-3 h-3 text-slate-600" /> {task.cron_expression}
                        </span>
                      )}
                      {task.run_limit !== null && (
                        <span className="flex items-center gap-1" title="Run limit">
                          <Repeat className="w-3 h-3 text-slate-600" />
                          {task.run_count ?? 0}/{task.run_limit}
                        </span>
                      )}
                      {task.last_run && (
                        <span>Last: {formatDistanceToNow(new Date(task.last_run), { addSuffix: true })}</span>
                      )}
                    </div>
                    {/* Tags */}
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {tags.map(t => <TagChip key={t} tag={t} />)}
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isRunning ? (
                      <button onClick={() => handleStop(task)} disabled={!!busy} className="btn-secondary text-xs py-1.5 px-3">
                        {busy === 'stopping' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5 text-yellow-400" />}
                        Stop
                      </button>
                    ) : (
                      <button
                        onClick={() => setRunTarget(task)}
                        disabled={!!busy || atLimit}
                        className="btn-primary text-xs py-1.5 px-3"
                        title={atLimit ? 'Run limit reached' : 'Run task'}
                      >
                        {busy === 'running' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                        Run
                      </button>
                    )}
                    <button onClick={() => handleDelete(task)} disabled={isRunning || !!busy} className="btn-icon hover:bg-red-900/30 text-slate-500 hover:text-red-400" title="Delete task">
                      {busy === 'deleting' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Expanded panel */}
                {isExpanded && <ExpandedTaskPanel task={task} />}
              </div>
            )
          })
        )}
      </div>

      {/* Create Task Modal */}
      {showCreate && (
        <Modal
          title="New Task"
          subtitle="Assign a script and optionally set a schedule"
          onClose={() => setShowCreate(false)}
        >
          <div className="space-y-4">
            <div>
              <label className="label">Task Name *</label>
              <input
                className="input"
                placeholder="e.g. Daily Price Monitor"
                value={newTask.name}
                onChange={(e) => setNewTask(p => ({ ...p, name: e.target.value }))}
                autoFocus
              />
            </div>

            <div>
              <label className="label">Script *</label>
              <select
                className="input"
                value={newTask.script_id}
                onChange={(e) => setNewTask(p => ({ ...p, script_id: e.target.value }))}
              >
                <option value="">— Select a script —</option>
                {scriptList.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              {scriptList.length === 0 && (
                <p className="text-xs text-amber-500 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> No scripts found — create one in Scripts first
                </p>
              )}
            </div>

            <div>
              <label className="label">
                Cron Schedule <span className="text-slate-600">(optional)</span>
              </label>
              <input
                className="input font-mono"
                placeholder="0 9 * * *   →  every day at 9 AM"
                value={newTask.cron_expression}
                onChange={(e) => setNewTask(p => ({ ...p, cron_expression: e.target.value }))}
              />
              <div className="flex flex-wrap gap-2 mt-2">
                {[['Every hour','0 * * * *'],['Daily 9 AM','0 9 * * *'],['Weekdays 9 AM','0 9 * * 1-5'],['Every 5 min','*/5 * * * *']].map(([label, expr]) => (
                  <button key={expr} type="button" onClick={() => setNewTask(p => ({ ...p, cron_expression: expr }))}
                    className={`text-xs px-2 py-1 rounded-md border transition-colors ${newTask.cron_expression === expr ? 'border-sky-500 text-sky-400 bg-sky-900/20' : 'border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-400'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tags */}
            <div>
              <label className="label flex items-center gap-1.5"><Tag className="w-3 h-3" /> Tags <span className="text-slate-600">(optional)</span></label>
              <TagEditor tags={newTask.tags} onChange={(tags) => setNewTask(p => ({ ...p, tags }))} />
            </div>

            {/* Run Limit */}
            <div>
              <label className="label flex items-center gap-1.5"><Repeat className="w-3 h-3" /> Run Limit <span className="text-slate-600">(optional — max total runs)</span></label>
              <input
                className="input"
                type="number"
                min="1"
                placeholder="e.g. 10 — leave blank for unlimited"
                value={newTask.run_limit}
                onChange={(e) => setNewTask(p => ({ ...p, run_limit: e.target.value }))}
              />
              <p className="text-xs text-slate-600 mt-1">Task will be blocked from running after this many executions total.</p>
            </div>

            <div className="rounded-lg bg-slate-800/60 border border-slate-700/50 p-3 text-xs text-slate-500 leading-relaxed">
              <span className="text-slate-400 font-medium">💡 About profiles:</span> You can select a persistent profile when you hit ▶ Run — this lets you stay logged in between task runs.
            </div>

            <div className="flex items-center justify-end gap-3 pt-1">
              <button onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
              <button
                onClick={handleCreate}
                disabled={creating || !newTask.name.trim() || !newTask.script_id}
                className="btn-primary"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Create Task
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
