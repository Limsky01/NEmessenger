import React from 'react';
import { createRoot } from 'react-dom/client';
import axios from 'axios'
import App from './ui/App.jsx';
import initNotifyClickHandler from './utils/notifyClickHandler'
import { installPushNotificationClickHandler } from './utils/webPush'
import useStore from './state/store'
import './index.css';

// initialize notification click handler (Electron)
initNotifyClickHandler()
installPushNotificationClickHandler((channelId) => {
  const state = useStore.getState()
  if (typeof state.switchChannel === 'function') state.switchChannel(channelId)
})

// Setup axios interceptor for token refresh
let isRefreshing = false
let failedQueue = []

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error)
    } else {
      prom.resolve(token)
    }
  })
  failedQueue = []
}

axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`
            return axios(originalRequest)
          })
          .catch((err) => Promise.reject(err))
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        const refreshed = await useStore.getState().refreshAccessToken()
        if (refreshed) {
          const newToken = useStore.getState().accessToken
          processQueue(null, newToken)
          originalRequest.headers.Authorization = `Bearer ${newToken}`
          return axios(originalRequest)
        } else {
          processQueue(error, null)
          return Promise.reject(error)
        }
      } catch (err) {
        processQueue(err, null)
        return Promise.reject(err)
      } finally {
        isRefreshing = false
      }
    }
    return Promise.reject(error)
  }
)

axios.interceptors.request.use((config) => {
  const url = String(config?.url || '')
  if (/ngrok-free\.(dev|app)/i.test(url)) {
    config.headers = config.headers || {}
    config.headers['ngrok-skip-browser-warning'] = 'true'
  }
  return config
})

createRoot(document.getElementById('root')).render(<App />);
