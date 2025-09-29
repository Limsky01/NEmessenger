import useStore from '../state/store'

function findMessageById(state, messageId) {
  if (!messageId) return null
  const messages = state.messages || {}
  for (const channelId of Object.keys(messages)) {
    const arr = messages[channelId] || []
    for (const m of arr) {
      if (m && m.id === messageId) return { channelId, message: m }
    }
  }
  return null
}

export default function initNotifyClickHandler() {
  if (typeof window === 'undefined' || !window.electronAPI || typeof window.electronAPI.onNotifyClick !== 'function') return
  try {
    window.electronAPI.onNotifyClick(({ meta } = {}) => {
      try {
        const state = useStore.getState()
        const found = findMessageById(state, meta?.messageId)
        if (found) {
          useStore.getState().switchChannel(found.channelId)
        }
      } catch (e) {
        // ignore
      }
    })
  } catch (e) {
    // ignore
  }
}
