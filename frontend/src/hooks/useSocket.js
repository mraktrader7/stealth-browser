import { useState, useEffect, useRef, useCallback } from 'react'
import { io } from 'socket.io-client'

const getServerURL = () => {
  try {
    const saved = localStorage.getItem('stealth_settings')
    if (saved) {
      const parsed = JSON.parse(saved)
      if (parsed.backendUrl) return parsed.backendUrl
    }
  } catch (_) {}
  return 'http://localhost:3001'
}

export function useSocket() {
  const [logs, setLogs] = useState([])
  const [connected, setConnected] = useState(false)
  const [taskStatuses, setTaskStatuses] = useState({})
  const socketRef = useRef(null)

  useEffect(() => {
    const url = getServerURL()
    const socket = io(url, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      timeout: 10000,
    })

    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      setLogs((prev) => [
        ...prev,
        {
          id: Date.now(),
          level: 'info',
          message: `Connected to StealthBrowser backend (${url})`,
          timestamp: new Date().toISOString(),
          source: 'system',
        },
      ])
    })

    socket.on('disconnect', (reason) => {
      setConnected(false)
      setLogs((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          level: 'warn',
          message: `Disconnected from backend: ${reason}`,
          timestamp: new Date().toISOString(),
          source: 'system',
        },
      ])
    })

    socket.on('connect_error', (err) => {
      setConnected(false)
    })

    socket.on('log', (entry) => {
      setLogs((prev) => {
        const newLogs = [
          ...prev,
          {
            id: entry.id ?? Date.now() + Math.random(),
            level: entry.level ?? 'info',
            message: entry.message ?? String(entry),
            timestamp: entry.timestamp ?? new Date().toISOString(),
            source: entry.source ?? 'backend',
            task_id: entry.task_id ?? null,
          },
        ]
        // Keep last 500 log entries in memory
        return newLogs.slice(-500)
      })
    })

    socket.on('task_status', (update) => {
      setTaskStatuses((prev) => ({
        ...prev,
        [update.task_id]: {
          status: update.status,
          updatedAt: update.timestamp ?? new Date().toISOString(),
          message: update.message ?? null,
        },
      }))
      // Also push a log entry for status changes
      setLogs((prev) => [
        ...prev,
        {
          id: Date.now() + Math.random(),
          level: update.status === 'error' ? 'error' : update.status === 'running' ? 'info' : 'success',
          message: `Task ${update.task_id}: ${update.status}${update.message ? ` — ${update.message}` : ''}`,
          timestamp: update.timestamp ?? new Date().toISOString(),
          source: 'task',
          task_id: update.task_id,
        },
      ])
    })

    return () => {
      socket.disconnect()
    }
  }, [])

  const clearLogs = useCallback(() => {
    setLogs([])
  }, [])

  return { logs, connected, taskStatuses, clearLogs, socket: socketRef }
}
