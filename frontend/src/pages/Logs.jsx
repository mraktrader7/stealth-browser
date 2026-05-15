import React, { useEffect, useState, useCallback, useContext, useRef } from 'react'
import { ScrollText, Trash2, RefreshCw, Filter, X, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { logs as logsApi } from '../utils/api.js'
import { SocketContext } from '../App.jsx'
import { format } from 'date-fns'

const LEVELS = ['all', 'info', 'warn', 'error', 'success', 'debug']

const LEVEL_BADGE = {
  info:    'badge bg-sky-900/50 text-sky-300 border border-sky-700/30',
  warn:    'badge bg-yellow-900/50 text-yellow-300 border border-yellow-700/30',
  warning: 'badge bg-yellow-900/50 text-yellow-300 border border-yellow-700/30',
  error:   'badge bg-red-900/50 text-red-300 border border-red-700/30',
  success: 'badge bg-emerald-900/50 text-emerald-300 border border-emerald-700/30',
  debug:   'badge bg-slate-700 text-slate-500',
}

const LEVEL_ROW = {
  info:    'border-l-2 border-sky-500/50',
  warn:    'border-l-2 border-yellow-500/50',
  warning: 'border-l-2 border-yellow-500/50',
  error:   'border-l-2 border-red-500/50 bg-red-900/10',
  success: 'border-l-2 border-emerald-500/50',
  debug:   'border-l-2 border-slate-700',
}

const PAGE_SIZE = 50

function Toast({ type, message, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000)
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

export default function Logs() {
  const { logs: socketLogs, clearLogs: clearSocketLogs } = useContext(SocketContext)

  // Persisted logs from API
  const [apiLogs, setApiLogs]         = useState([])
  const [total, setTotal]             = useState(0)
  const [page, setPage]               = useState(0)
  const [loadingApi, setLoadingApi]   = useState(false)

  // Filters
  const [levelFilter, setLevelFilter]   = useState('all')
  const [taskFilter, setTaskFilter]     = useState('')
  const [taskFilterInput, setTaskFilterInput] = useState('')
  const [toast, setToast]               = useState(null)
  const [clearing, setClearing]         = useState(false)
  const [autoRefresh, setAutoRefresh]   = useState(true)
  const intervalRef = useRef(null)

  const showToast = useCallback((type, message) => setToast({ type, message }), [])

  const fetchApiLogs = useCallback(async (silent = false) => {
    if (!silent) setLoadingApi(true)
    try {
      const params = { offset: page * PAGE_SIZE, limit: PAGE_SIZE }
      if (levelFilter !== 'all') params.level = levelFilter
      if (taskFilter) params.task_id = taskFilter
      const res = await logsApi.getAll(params)
      const data = res?.data ?? res ?? {}
      setApiLogs(Array.isArray(data) ? data : (data.items ?? data.logs ?? []))
      setTotal(data.total ?? (Array.isArray(data) ? data.length : 0))
    } catch (err) {
      if (!silent) showToast('error', `Failed to load logs: ${err.message}`)
    } finally {
      if (!silent) setLoadingApi(false)
    }
  }, [page, levelFilter, taskFilter, showToast])

  useEffect(() => { fetchApiLogs() }, [fetchApiLogs])

  useEffect(() => {
    if (!autoRefresh) {
      clearInterval(intervalRef.current)
      return
    }
    intervalRef.current = setInterval(() => fetchApiLogs(true), 5000)
    return () => clearInterval(intervalRef.current)
  }, [autoRefresh, fetchApiLogs])

  const handleClearAll = useCallback(async () => {
    if (!confirm('Clear ALL logs from the server? This cannot be undone.')) return
    setClearing(true)
    try {
      await logsApi.clear()
      clearSocketLogs()
      setApiLogs([])
      setTotal(0)
      showToast('success', 'All logs cleared')
    } catch (err) {
      showToast('error', `Clear failed: ${err.message}`)
    } finally {
      setClearing(false)
    }
  }, [showToast, clearSocketLogs])

  const handleTaskFilterSubmit = (e) => {
    e.preventDefault()
    setTaskFilter(taskFilterInput.trim())
    setPage(0)
  }

  // Merge socket logs into display (de-duplicate by id)
  const allLogs = React.useMemo(() => {
    const merged = [...apiLogs]
    const apiIds = new Set(apiLogs.map((l) => l.id))
    const filtered = socketLogs.filter((l) => {
      if (apiIds.has(l.id)) return false
      if (levelFilter !== 'all' && l.level !== levelFilter && l.level !== `${levelFilter}ing`) return false
      if (taskFilter && l.task_id !== taskFilter) return false
      return true
    })
    merged.unshift(...filtered.slice(-100))
    return merged.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
  }, [apiLogs, socketLogs, levelFilter, taskFilter])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <ScrollText className="w-5 h-5 text-sky-400" />
          <div>
            <h1 className="text-xl font-bold text-slate-100">Logs</h1>
            <p className="text-sm text-slate-500">Full log history with filtering</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh((p) => !p)}
            className={`btn text-xs ${autoRefresh ? 'btn-primary' : 'btn-secondary'}`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${autoRefresh ? 'animate-spin' : ''}`} style={autoRefresh ? { animationDuration: '3s' } : {}} />
            Auto-refresh {autoRefresh ? 'ON' : 'OFF'}
          </button>
          <button onClick={() => fetchApiLogs()} disabled={loadingApi} className="btn-secondary text-xs">
            <RefreshCw className={`w-3.5 h-3.5 ${loadingApi ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button onClick={handleClearAll} disabled={clearing} className="btn-danger text-xs">
            {clearing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Clear All
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-xs font-medium text-slate-400">Level:</span>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {LEVELS.map((lvl) => (
              <button
                key={lvl}
                onClick={() => { setLevelFilter(lvl); setPage(0) }}
                className={[
                  'px-3 py-1 rounded-full text-xs font-medium transition-all',
                  levelFilter === lvl
                    ? 'bg-sky-600 text-white'
                    : 'bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-slate-200',
                ].join(' ')}
              >
                {lvl}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs font-medium text-slate-400">Task ID:</span>
            <form onSubmit={handleTaskFilterSubmit} className="flex gap-1">
              <input
                className="input text-xs w-40"
                placeholder="Filter by task id…"
                value={taskFilterInput}
                onChange={(e) => setTaskFilterInput(e.target.value)}
              />
              <button type="submit" className="btn-secondary text-xs px-3">Go</button>
              {taskFilter && (
                <button
                  type="button"
                  onClick={() => { setTaskFilter(''); setTaskFilterInput(''); setPage(0) }}
                  className="btn-ghost text-xs px-2"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </form>
          </div>
        </div>
      </div>

      {/* Log Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-800/50">
                <th className="text-left px-4 py-3 text-slate-400 font-medium w-44">Timestamp</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium w-20">Level</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium w-28">Source</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Message</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/40">
              {loadingApi && allLogs.length === 0 ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-4 py-3"><div className="h-3 w-32 bg-slate-700 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-12 bg-slate-700 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-16 bg-slate-700 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-full bg-slate-700 rounded" /></td>
                  </tr>
                ))
              ) : allLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-16 text-center text-slate-600">
                    No log entries match your filters
                  </td>
                </tr>
              ) : (
                allLogs.map((entry, idx) => {
                  const lvl = entry.level ?? 'info'
                  const rowCls = LEVEL_ROW[lvl] ?? ''
                  const badgeCls = LEVEL_BADGE[lvl] ?? 'badge bg-slate-700 text-slate-400'
                  const ts = (() => {
                    try { return format(new Date(entry.timestamp), 'yyyy-MM-dd HH:mm:ss.SSS') }
                    catch (_) { return entry.timestamp ?? '' }
                  })()
                  return (
                    <tr key={entry.id ?? idx} className={`hover:bg-slate-800/40 transition-colors ${rowCls}`}>
                      <td className="px-4 py-2.5 font-mono text-slate-500 whitespace-nowrap">{ts}</td>
                      <td className="px-4 py-2.5">
                        <span className={badgeCls}>{lvl}</span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-500 truncate max-w-[7rem]">
                        {entry.source ?? entry.task_id ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 text-slate-300 font-mono break-all">
                        {entry.message}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700 bg-slate-800/30">
            <p className="text-xs text-slate-500">
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total} entries
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="btn-secondary text-xs px-3"
              >
                Prev
              </button>
              {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
                const pg = Math.max(0, Math.min(page - 2 + i, totalPages - 1))
                return (
                  <button
                    key={pg}
                    onClick={() => setPage(pg)}
                    className={`btn text-xs w-8 justify-center ${pg === page ? 'btn-primary' : 'btn-secondary'}`}
                  >
                    {pg + 1}
                  </button>
                )
              })}
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="btn-secondary text-xs px-3"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
