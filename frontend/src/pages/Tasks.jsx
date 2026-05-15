import React, { useEffect, useState, useCallback, useContext } from 'react'
import {
  Plus, Play, Square, Trash2, ListTodo, X, Loader2,
  AlertCircle, CheckCircle2, Clock, ChevronRight, ChevronDown
} from 'lucide-react'
import { tasks as tasksApi, scripts as scriptsApi } from '../utils/api.js'
import { SocketContext } from '../App.jsx'
import { formatDistanceToNow, format } from 'date-fns'
import LogPanel from '../components/LogPanel.jsx'

const STATUS_STYLES = {
  running: 'badge bg-sky-900/50 text-sky-300 border border-sky-700/30',
  idle:    'badge bg-slate-700/60 text-slate-400',
  error:   'badge bg-red-900/50 text-red-300 border border-red-700/30',
  done:    'badge bg-emerald-900/50 text-emerald-300 border border-emerald-700/30',
  stopped: 'badge bg-yellow-900/50 text-yellow-300 border border-yellow-700/30',
  pending: 'badge bg-violet-900/50 text-violet-300 border border-violet-700/30',
}

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
      <button onClick={onClose} className="ml-2 opacity-60 hover:opacity-100"><X className="w-3.5 h-3.5" /></button>
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
      <div className="card w-full max-w-lg shadow-2xl animate-fade-in">
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

export default function Tasks() {
  const { taskStatuses } = useContext(SocketContext)
  const [taskList, setTaskList]     = useState([])
  const [scriptList, setScriptList] = useState([])
  const [loading, setLoading]       = useState(true)
  const [toast, setToast]           = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating]     = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [actionLoading, setActionLoading] = useState({})
  const [newTask, setNewTask]       = useState({ name: '', script_id: '', cron: '' })

  const showToast = useCallback((type, message) => setToast({ type, message }), [])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [taskRes, scriptRes] = await Promise.allSettled([
        tasksApi.getAll(),
        scriptsApi.getAll(),
      ])
      setTaskList(taskRes.status === 'fulfilled' ? (taskRes.value?.data ?? taskRes.value ?? []) : [])
      setScriptList(scriptRes.status === 'fulfilled' ? (scriptRes.value?.data ?? scriptRes.value ?? []) : [])
    } catch (err) {
      showToast('error', `Failed to load data: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => { loadData() }, [loadData])

  const setAction = (id, state) =>
    setActionLoading((p) => ({ ...p, [id]: state }))

  const handleRun = useCallback(async (task) => {
    setAction(task.id, 'running')
    try {
      await tasksApi.run(task.id)
      showToast('success', `Task "${task.name}" started`)
      await loadData()
    } catch (err) {
      showToast('error', `Failed to run task: ${err.message}`)
    } finally {
      setAction(task.id, null)
    }
  }, [showToast, loadData])

  const handleStop = useCallback(async (task) => {
    setAction(task.id, 'stopping')
    try {
      await tasksApi.stop(task.id)
      showToast('success', `Task "${task.name}" stopped`)
      await loadData()
    } catch (err) {
      showToast('error', `Failed to stop task: ${err.message}`)
    } finally {
      setAction(task.id, null)
    }
  }, [showToast, loadData])

  const handleDelete = useCallback(async (task) => {
    if (!confirm(`Delete task "${task.name}"? This cannot be undone.`)) return
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
      await tasksApi.create(newTask)
      showToast('success', `Task "${newTask.name}" created`)
      setShowCreate(false)
      setNewTask({ name: '', script_id: '', cron: '' })
      await loadData()
    } catch (err) {
      showToast('error', `Create failed: ${err.message}`)
    } finally {
      setCreating(false)
    }
  }, [newTask, showToast, loadData])

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ListTodo className="w-5 h-5 text-sky-400" />
          <div>
            <h1 className="text-xl font-bold text-slate-100">Tasks</h1>
            <p className="text-sm text-slate-500">Manage and run automation tasks</p>
          </div>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> New Task
        </button>
      </div>

      {/* Task List */}
      <div className="space-y-2">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card p-4 h-16 animate-pulse" />
          ))
        ) : taskList.length === 0 ? (
          <div className="card flex flex-col items-center justify-center py-16 gap-3">
            <ListTodo className="w-10 h-10 text-slate-600" />
            <p className="text-slate-500 font-medium">No tasks yet</p>
            <button onClick={() => setShowCreate(true)} className="btn-primary">
              <Plus className="w-4 h-4" /> Create Task
            </button>
          </div>
        ) : (
          taskList.map((task) => {
            const liveStatus = taskStatuses[task.id]?.status ?? task.status ?? 'idle'
            const statusCls  = STATUS_STYLES[liveStatus] ?? STATUS_STYLES.idle
            const isExpanded = expandedId === task.id
            const busy = actionLoading[task.id]
            const isRunning = liveStatus === 'running'

            return (
              <div key={task.id} className="card overflow-hidden">
                {/* Task Row */}
                <div className="flex items-center gap-4 px-5 py-4">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : task.id)}
                    className="btn-icon hover:bg-slate-700 text-slate-500 hover:text-slate-300"
                  >
                    {isExpanded
                      ? <ChevronDown className="w-4 h-4" />
                      : <ChevronRight className="w-4 h-4" />}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-200 truncate">{task.name}</span>
                      <span className={statusCls}>{liveStatus}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
                      {task.script_name && <span>Script: {task.script_name}</span>}
                      {task.cron && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {task.cron}
                        </span>
                      )}
                      {task.last_run && (
                        <span>
                          Last run: {formatDistanceToNow(new Date(task.last_run), { addSuffix: true })}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {isRunning ? (
                      <button
                        onClick={() => handleStop(task)}
                        disabled={!!busy}
                        className="btn-secondary text-xs"
                        title="Stop task"
                      >
                        {busy === 'stopping'
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Square className="w-3.5 h-3.5 text-yellow-400" />}
                        Stop
                      </button>
                    ) : (
                      <button
                        onClick={() => handleRun(task)}
                        disabled={!!busy}
                        className="btn-success text-xs"
                        title="Run now"
                      >
                        {busy === 'running'
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Play className="w-3.5 h-3.5" />}
                        Run
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(task)}
                      disabled={!!busy}
                      className="btn-icon hover:bg-red-900/30 text-slate-500 hover:text-red-400"
                      title="Delete task"
                    >
                      {busy === 'deleting'
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Expanded Logs */}
                {isExpanded && (
                  <div className="border-t border-slate-700 bg-slate-900/50 p-4">
                    <LogPanel maxHeight="260px" filter={task.id} />
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <Modal title="New Task" onClose={() => setShowCreate(false)}>
          <div className="space-y-4">
            <div>
              <label className="label">Task Name *</label>
              <input
                className="input"
                placeholder="e.g. Daily Product Scrape"
                value={newTask.name}
                onChange={(e) => setNewTask((p) => ({ ...p, name: e.target.value }))}
                autoFocus
              />
            </div>
            <div>
              <label className="label">Script *</label>
              <select
                className="input"
                value={newTask.script_id}
                onChange={(e) => setNewTask((p) => ({ ...p, script_id: e.target.value }))}
              >
                <option value="">— Select a script —</option>
                {scriptList.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              {scriptList.length === 0 && (
                <p className="text-xs text-yellow-500 mt-1">
                  No scripts found. Create a script first.
                </p>
              )}
            </div>
            <div>
              <label className="label">Cron Expression (optional)</label>
              <input
                className="input font-mono"
                placeholder="e.g. 0 * * * * (every hour) — leave blank for manual"
                value={newTask.cron}
                onChange={(e) => setNewTask((p) => ({ ...p, cron: e.target.value }))}
              />
              <p className="text-xs text-slate-600 mt-1">
                Format: second minute hour day month weekday
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
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
