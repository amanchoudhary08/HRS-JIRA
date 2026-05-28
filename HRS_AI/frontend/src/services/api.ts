import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

let _refreshing: Promise<string> | null = null

async function refreshAccessToken(): Promise<string> {
  const refresh = localStorage.getItem('refresh_token')
  if (!refresh) throw new Error('No refresh token')
  const { data } = await axios.post('/api/auth/refresh', { refresh_token: refresh })
  const newToken: string = data.access_token
  // Authoritative store — read by api.ts request interceptor and getToken()
  localStorage.setItem('access_token', newToken)
  // Keep Zustand in-memory state in sync so SSE token reads are fresh
  try {
    const { useAuthStore } = await import('../stores/auth')
    useAuthStore.setState({ accessToken: newToken })
  } catch { /* ignore */ }
  return newToken
}

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config

    if (error.response?.status === 401 && !original._retried) {
      original._retried = true
      try {
        // Deduplicate concurrent refresh calls
        if (!_refreshing) {
          _refreshing = refreshAccessToken().finally(() => { _refreshing = null })
        }
        const newToken = await _refreshing
        original.headers.Authorization = `Bearer ${newToken}`
        return api(original)
      } catch {
        // Refresh failed — clear everything and go to login
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        try {
          const { useAuthStore } = await import('../stores/auth')
          useAuthStore.getState().logout()
        } catch { /* ignore */ }
        window.location.href = '/login'
      }
    }

    return Promise.reject(error)
  }
)

export default api
