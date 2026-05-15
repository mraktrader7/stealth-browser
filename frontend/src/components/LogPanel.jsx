import React, { useEffect, useRef, useContext } from 'react'
import { format } from 'date-fns'
import { Trash2, Terminal } from 'lucide-react'
import { SocketContext } from '../App.jsx'

const LEVEL_STYLES = {
  info:    'text-sky-400',
  warn:    'text-yellow-400',
  warning: 'text-yellow-400',
  error:   'text-red-400',
  success: 'text-emerald-400',
  debug:   'text-slate-500',
}

const LEVEL_PREFIX = {
  info:    'INFO',
  warn:    'WARN',
  warning: 'WARN',
  error:   'ERR ',
  success: 'OK  ',
  debug:   'DBG ',
}

function LogLine({ entry }) {
  const levelStyle = LEVEL_STYLES[entry.level] ?? 'text-slate-400'
  const prefix = LEVEL_PREFIX[entry.level] ?? 'LOG '
  const ts = (() => {
    try { return format(new Date(entry.timestamp), 'HH:mm:ss.SSS') }
    catch (_) { return '??:??:??' }
  })()

  return (
    <div className="flex gap-2 font-mono text-xs leading-relaxed hover:bg-slate-800/50 px-3 py-0.5 rounded group">
      <span className="text-slate-600 flex-shrink-0 select-none">{ts}</span>
      <span className={`flex-shrink-0 select-none font-semibold ${levelStyle}`}>{prefix}</span>
      {entry.source && (
        <span className="text-slate-600 flex-shrink-0 select-none">[{entry.source}]</span>
      )}
      <span className="text-slate-300 break-all">{entry.message}</span>
    </div>
  )
}

export default function LogPanel({ maxHeight = '320px', filter = null }) {
  const { logs, clearLogs } = useContext(SocketContext)
  const bottomRef = useRef(null)
  const containerRef = useRef(null)
  const autoScrollRef = useRef(true)

  const filteredLogs = filter
    ? logs.filter((l) => l.task_id === filter || l.level === filter)
    : logs

  useEffect(() => {
    if (autoScrollRef.current && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [filteredLogs])

  const handleScroll = () => {
    const el = containerRef.current
    if (!el) return
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60
    autoScrollRef.current = isAtBottom
  }

  return (
    <div className="flex flex-col rounded-xl border border-slate-700 bg-slate-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700 bg-slate-800/50">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-sky-400" />
          <span className="text-xs font-semibold text-slate-300">Live Logs</span>
          <span className="badge bg-slate-700 text-slate-400">{filteredLogs.length}</span>
        </div>
        <button
          onClick={clearLogs}
          className="btn-icon hover:bg-red-900/30 text-slate-500 hover:text-red-400"
          title="Clear logs"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Log content */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="overflow-y-auto py-2"
        style={{ maxHeight }}
      >
        {filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-slate-600 gap-2">
            <Terminal className="w-6 h-6" />
            <p className="text-xs">No logs yet — run a task to see output</p>
          </div>
        ) : (
          filteredLogs.map((entry) => <LogLine key={entry.id} entry={entry} />)
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
