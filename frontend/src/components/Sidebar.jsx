import React from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Code2,
  ListTodo,
  ScrollText,
  Settings,
  Shield,
  Wifi,
  WifiOff,
  ShieldCheck,
} from 'lucide-react'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/scripts', label: 'Scripts', icon: Code2 },
  { to: '/tasks', label: 'Tasks', icon: ListTodo },
  { to: '/logs', label: 'Logs', icon: ScrollText },
  { to: '/profiles', label: 'Profiles', icon: ShieldCheck },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export default function Sidebar({ connected }) {
  const location = useLocation()

  return (
    <aside className="w-60 flex-shrink-0 flex flex-col bg-slate-900 border-r border-slate-800 h-screen">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-800">
        <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-sky-600/20 border border-sky-500/30">
          <Shield className="w-5 h-5 text-sky-400" />
        </div>
        <div>
          <p className="text-sm font-bold text-slate-100 leading-none">StealthBrowser</p>
          <p className="text-xs text-slate-500 mt-0.5">Web Automation</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV_ITEMS.map(({ to, label, icon: Icon, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            className={({ isActive }) =>
              [
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                isActive
                  ? 'bg-sky-600/20 text-sky-400 border border-sky-500/20'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-transparent',
              ].join(' ')
            }
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Connection Status */}
      <div className="px-4 py-4 border-t border-slate-800">
        <div
          className={[
            'flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-xs font-medium',
            connected
              ? 'bg-emerald-900/20 border-emerald-700/30 text-emerald-400'
              : 'bg-red-900/20 border-red-700/30 text-red-400',
          ].join(' ')}
        >
          {connected ? (
            <>
              <Wifi className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Backend connected</span>
              <span className="ml-auto w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </>
          ) : (
            <>
              <WifiOff className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Disconnected</span>
              <span className="ml-auto w-2 h-2 rounded-full bg-red-400" />
            </>
          )}
        </div>
      </div>
    </aside>
  )
}
