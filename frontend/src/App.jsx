import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Scripts from './pages/Scripts.jsx'
import Tasks from './pages/Tasks.jsx'
import Logs from './pages/Logs.jsx'
import Settings from './pages/Settings.jsx'
import Profiles from './pages/Profiles.jsx'
import { useSocket } from './hooks/useSocket.js'
import { ThemeProvider } from './contexts/ThemeContext.jsx'

export const SocketContext = React.createContext(null)

function AppInner() {
  const socket = useSocket()

  return (
    <SocketContext.Provider value={socket}>
      <div className="flex h-screen bg-slate-900 dark:bg-slate-900 light:bg-slate-100 overflow-hidden">
        <Sidebar connected={socket.connected} />
        <main className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/scripts" element={<Scripts />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/logs" element={<Logs />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/profiles" element={<Profiles />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </SocketContext.Provider>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  )
}
