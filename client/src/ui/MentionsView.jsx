import React, { useMemo } from 'react'
import useStore, { buildNameStyle } from '../state/store.js'
import AvatarImage from './AvatarImage.jsx'

const extractText = (content) => {
  if (typeof content !== 'string') return ''
  return content
}

export default function MentionsView() {
  const users = useStore((s) => s.users)
  const me = useStore((s) => s.user)
  const messagesMap = useStore((s) => s.messages)
  const buildAvatarUrl = useStore((s) => s.buildAvatarUrl)

  const userMap = useMemo(() => {
    const map = new Map()
    users.forEach((user) => {
      if (user?.id) map.set(user.id, user)
    })
    return map
  }, [users])

  const mentions = useMemo(() => {
    if (!me?.username) return []
    const needle = `@${me.username}`.toLowerCase()
    const results = []
    Object.entries(messagesMap || {}).forEach(([channelId, list]) => {
      list.forEach((message) => {
        const text = extractText(message.content).toLowerCase()
        if (!text.includes(needle)) return
        results.push({ ...message, channelId })
      })
    })
    return results.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
  }, [me?.username, messagesMap])

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <div className="panel px-6 py-4 border-b border-white/10">
        <div className="text-sm font-medium">Упоминания</div>
        <div className="text-xs text-white/60">Последние сообщения с вашим ником</div>
      </div>
      <div className="flex-1 overflow-y-auto scroll-thin p-6 space-y-3">
        {mentions.map((message) => {
          const author = userMap.get(message.senderId)
          const authorStyle = buildNameStyle(author?.nameStyle)
          return (
            <div key={message.id} className="tg-card px-4 py-3">
              <div className="flex items-center gap-3 text-xs text-white/60 mb-2">
                <AvatarImage user={author} size={26} src={buildAvatarUrl?.(author)} />
                <span style={authorStyle}>{author?.displayName || author?.username || 'user'}</span>
                <span className="opacity-60">
                  {new Date(message.createdAt || message.created_at || Date.now()).toLocaleString()}
                </span>
              </div>
              <div className="text-sm text-white/90 whitespace-pre-wrap break-words">
                {extractText(message.content)}
              </div>
            </div>
          )
        })}
        {mentions.length === 0 && <div className="text-sm text-white/40">Упоминаний пока нет</div>}
      </div>
    </div>
  )
}
