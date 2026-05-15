import axios from 'axios'

const getBaseURL = () => {
  try {
    const saved = localStorage.getItem('stealth_settings')
    if (saved) {
      const parsed = JSON.parse(saved)
      if (parsed.backendUrl) return `${parsed.backendUrl}/api`
    }
  } catch (_) {}
  return 'http://localhost:3001/api'
}

const instance = axios.create({
  baseURL: getBaseURL(),
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

// Refresh baseURL on each request to pick up settings changes
instance.interceptors.request.use((config) => {
  config.baseURL = getBaseURL()
  return config
})

instance.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const message =
      err.response?.data?.message ||
      err.response?.data?.error ||
      err.message ||
      'Unknown error'
    return Promise.reject(new Error(message))
  }
)

// ─── Scripts ───────────────────────────────────────────────────────────────────
export const scripts = {
  getAll: () => instance.get('/scripts'),
  getOne: (id) => instance.get(`/scripts/${id}`),
  create: (data) => instance.post('/scripts', data),
  update: (id, data) => instance.put(`/scripts/${id}`, data),
  delete: (id) => instance.delete(`/scripts/${id}`),
  // Version history
  getVersions: (id) => instance.get(`/scripts/${id}/versions`),
  getVersion: (id, versionId) => instance.get(`/scripts/${id}/versions/${versionId}`),
  deleteVersion: (id, versionId) => instance.delete(`/scripts/${id}/versions/${versionId}`),
}

// ─── Tasks ─────────────────────────────────────────────────────────────────────
export const tasks = {
  getAll: () => instance.get('/tasks'),
  getOne: (id) => instance.get(`/tasks/${id}`),
  create: (data) => instance.post('/tasks', data),
  run: (id, opts = {}) => instance.post(`/tasks/${id}/run`, opts),
  stop: (id) => instance.post(`/tasks/${id}/stop`),
  delete: (id) => instance.delete(`/tasks/${id}`),
}

// ─── Logs ──────────────────────────────────────────────────────────────────────
export const logs = {
  getAll: (params = {}) => instance.get('/logs', { params }),
  clear: () => instance.delete('/logs'),
}

// ─── Browser ───────────────────────────────────────────────────────────────────
export const browser = {
  launch: (options = {}) => instance.post('/browser/launch', options),
  getSessions: () => instance.get('/browser/sessions'),
  screenshot: (sessionId, options = {}) =>
    instance.post(`/browser/sessions/${sessionId}/screenshot`, options),
  close: (sessionId) => instance.delete(`/browser/sessions/${sessionId}`),
}

// ─── Profiles ─────────────────────────────────────────────────────────────────
export const profiles = {
  getAll: () => instance.get('/profiles'),
  create: (data) => instance.post('/profiles', data),
  delete: (id) => instance.delete(`/profiles/${id}`),
}

export default instance
