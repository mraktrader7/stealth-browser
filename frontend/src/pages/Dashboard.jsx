import React, { useEffect, useState, useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import { Code2, ListTodo, PlayCircle, ScrollText, Plus, ArrowRight, Activity } from 'lucide-react'
import { scripts as scriptsApi, tasks as tasksApi } from '../utils/api.js'
import { SocketContext } from '../App.jsx'
import LogPanel from '../components/LogPanel.jsx'
import { formatDistanceToNow } from 'date-fns'

function StatCard({ icon: Icon, label, value, color, sub }) {
  return (
    <div className="card p-5 flex items-start gap-4">
      <div className={`flex items-center justify-center w-11 h-11 rounded-xl ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-100">{value ?? '—'}</p>
        <p className="text-xs font-medium text-slate-400 mt-0.5">{label}</p>
        {sub && <p className="text-xs text-slate-600 mt-1">{sub}</p>}
      </div>
    </div>
  )
}

function QuickAction({ icon: Icon, label, onClick, variant = 'secondary' }) {
  return (
    <button onClick={onClick} className={`btn-${variant} w-full justify-between group`}>
      <span className="flex items-center gap-2">
        <Icon className="w-4 h-4" />
        {label}
      </span>
      <ArrowRight className="w-3.5 h-3.5 opacity-40 group-hover:opacity-80 transition-opacity" />
    </button>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { taskStatuses } = useContext(SocketContext)
  const [stats, setStats] = useState({ scripts: 0, tasks: 0, running: 0 })
  const [recentTasks, setRecentTasks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    async function load() {
      try {
        const [scriptList, taskList] = await Promise.allSettled([
          scriptsApi.getAll(),
          tasksApi.getAll(),
        ])
        if (!mounted) return

        const scriptData = scriptList.status === 'fulfilled' ? (scriptList.value?.data ?? scriptList.value ?? []) : []
        const taskData   = taskList.status === 'fulfilled'   ? (taskList.value?.data   ?? taskList.value   ?? []) : []

        const running = taskData.filter((t) => t.status === 'running').length
        setStats({ scripts: scriptData.length, tasks: taskData.length, running })
        setRecentTasks(taskData.slice(0, 5))
      } catch (_) {}
      finally { if (mounted) setLoading(false) }
    }
    load()
    return () => { mounted = false }
  }, [taskStatuses])

  const STATUS_COLORS = {
    running: 'badge bg-sky-900/50 text-sky-400 border border-sky-700/40',
    idle:    'badge bg-slate-700 text-slate-400',
    error:   'badge bg-red-900/50 text-red-400 border border-red-700/40',
    done:    'badge bg-emerald-900/50 text-emerald-400 border border-emerald-700/40',
    stopped: 'badge bg-yellow-900/50 text-yellow-400 border border-yellow-700/40',
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">Overview of your automation workspace</p>
        </div>
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-sky-400" />
          <span className="text-xs text-slate-400">Live</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Code2}
          label="Total Scripts"
          value={loading ? '…' : stats.scripts}
          color="bg-violet-600/20 text-violet-400"
        />
        <StatCard
          icon={ListTodo}
          label="Total Tasks"
          value={loading ? '…' : stats.tasks}
          color="bg-sky-600/20 text-sky-400"
        />
        <StatCard
          icon={PlayCircle}
          label="Running Now"
          value={loading ? '…' : stats.running}
          color={stats.running > 0 ? 'bg-emerald-600/20 text-emerald-400' : 'bg-slate-700 text-slate-500'}
          sub={stats.running > 0 ? 'Tasks in progress' : 'No tasks running'}
        />
        <StatCard
          icon={ScrollText}
          label="Log Entries"
          value="Live"
          color="bg-amber-600/20 text-amber-400"
          sub="Socket stream active"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Tasks */}
        <div className="lg:col-span-2 card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700">
            <h2 className="text-sm font-semibold text-slate-200">Recent Tasks</h2>
            <button
              onClick={() => navigate('/tasks')}
              className="text-xs text-sky-400 hover:text-sky-300 transition-colors"
            >
              View all
            </button>
          </div>
          <div className="divide-y divide-slate-700/50">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="px-5 py-3 flex items-center gap-3 animate-pulse">
                  <div className="h-3 w-32 bg-slate-700 rounded" />
                  <div className="h-5 w-16 bg-slate-700 rounded-full ml-auto" />
                </div>
              ))
            ) : recentTasks.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-slate-600">
                No tasks yet.{' '}
                <button onClick={() => navigate('/tasks')} className="text-sky-500 hover:underline">
                  Create one
                </button>
              </div>
            ) : (
              recentTasks.map((task) => {
                const liveStatus = taskStatuses[task.id]?.status ?? task.status ?? 'idle'
                const cls = STATUS_COLORS[liveStatus] ?? STATUS_COLORS.idle
                return (
                  <div
                    key={task.id}
                    className="px-5 py-3 flex items-center gap-3 hover:bg-slate-700/30 cursor-pointer transition-colors"
                    onClick={() => navigate('/tasks')}
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-200">{task.name}</p>
                      {task.last_run && (
                        <p className="text-xs text-slate-500 mt-0.5">
                          {formatDistanceToNow(new Date(task.last_run), { addSuffix: true })}
                        </p>
                      )}
                    </div>
                    <span className={`ml-auto ${cls}`}>{liveStatus}</span>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="space-y-4">
          <div className="card p-5 space-y-3">
            <h2 className="text-sm font-semibold text-slate-200 mb-1">Quick Actions</h2>
            <QuickAction
              icon={Code2}
              label="New Script"
              onClick={() => navigate('/scripts')}
              variant="secondary"
            />
            <QuickAction
              icon={Plus}
              label="New Task"
              onClick={() => navigate('/tasks')}
              variant="secondary"
            />
            <QuickAction
              icon={ScrollText}
              label="View Logs"
              onClick={() => navigate('/logs')}
              variant="secondary"
            />
          </div>
        </div>
      </div>

      {/* Live Log Panel */}
      <div>
        <h2 className="text-sm font-semibold text-slate-200 mb-3">Live Output</h2>
        <LogPanel maxHeight="220px" />
      </div>
    </div>
  )
}
