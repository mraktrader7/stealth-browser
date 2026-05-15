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

// ─── Auth ───────────────────────────────────────────────────────────────────────
export const auth = {
  login: (username, password) => instance.post('/auth/login', { username, password }),
  status: () => instance.get('/auth/status'),
}

// Token helpers
export function setAuthToken(token) {
  if (token) {
    localStorage.setItem('stealth_jwt', token)
    instance.defaults.headers.common['Authorization'] = `Bearer ${token}`
  } else {
    localStorage.removeItem('stealth_jwt')
    delete instance.defaults.headers.common['Authorization']
  }
}

export function getAuthToken() {
  return localStorage.getItem('stealth_jwt')
}

// Bootstrap: restore token from localStorage on load
const storedToken = getAuthToken()
if (storedToken) {
  instance.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`
}

// Interceptor: auto-clear token on 401
instance.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      setAuthToken(null)
    }
    return Promise.reject(err)
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
  // Export script as .js file
  exportUrl: (id) => `${getBaseURL()}/scripts/${id}/export`,
}

// ─── Tasks ─────────────────────────────────────────────────────────────────────
export const tasks = {
  getAll: (params = {}) => instance.get('/tasks', { params }),
  getOne: (id) => instance.get(`/tasks/${id}`),
  create: (data) => instance.post('/tasks', data),
  update: (id, data) => instance.put(`/tasks/${id}`, data),
  run: (id, opts = {}) => instance.post(`/tasks/${id}/run`, opts),
  stop: (id) => instance.post(`/tasks/${id}/stop`),
  delete: (id) => instance.delete(`/tasks/${id}`),
  getRuns: (id, params = {}) => instance.get(`/tasks/${id}/runs`, { params }),
}

// ─── Logs ──────────────────────────────────────────────────────────────────────
export const logs = {
  getAll: (params = {}) => instance.get('/logs', { params }),
  clear: () => instance.delete('/logs'),
  // Export URL builder (for download link)
  exportUrl: (params = {}) => {
    const base = getBaseURL()
    const qs = new URLSearchParams(params).toString()
    return `${base}/logs?${qs}`
  },
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
