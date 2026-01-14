import React, { useMemo } from 'react'
import useStore, { buildNameStyle } from '../state/store.js'
import AvatarImage from './AvatarImage.jsx'

function StatusDot({ online }) {
  return <span className={`w-2 h-2 rounded-full ${online ? 'bg-sky-400' : 'bg-white/30'}`} />
}

const extractPeerIdFromChannel = (channelId, selfId) => {
  if (!channelId?.startsWith('dm:') || !selfId) return null
  const [, first, second] = channelId.split(':')
  if (!first || !second) return null
  if (first === selfId) return second
  if (second === selfId) return first
  return null
}

export default function MembersPanel() {
  const activeChannelId = useStore((s) => s.activeChannelId)
  const channels = useStore((s) => s.channels)
  const channelMembersMap = useStore((s) => s.channelMembers)
  const directPeers = useStore((s) => s.directPeers)
  const users = useStore((s) => s.users)
  const me = useStore((s) => s.user)
  const onlineUserIds = useStore((s) => s.onlineUserIds)
  const openDirectChat = useStore((s) => s.openDirectChat)
  const buildAvatarUrl = useStore((s) => s.buildAvatarUrl)

  const onlineSet = useMemo(() => new Set(onlineUserIds), [onlineUserIds])
  const userMap = useMemo(() => {
    const map = new Map()
    users.forEach((user) => {
      if (user?.id) map.set(user.id, user)
    })
    return map
  }, [users])
  const getUserNameStyle = (user) => buildNameStyle(user?.nameStyle)

  const currentChannel = channels.find((c) => c.id === activeChannelId)
  const isDirectChannel = activeChannelId?.startsWith('dm:')
  const directPeerId = useMemo(() => {
    if (!isDirectChannel) return null
    return directPeers[activeChannelId] || extractPeerIdFromChannel(activeChannelId, me?.id)
  }, [activeChannelId, directPeers, isDirectChannel, me?.id])

  const baseMembers = useMemo(() => {
    if (!activeChannelId) return []
    if (isDirectChannel) {
      const directPeer = directPeerId ? userMap.get(directPeerId) : null
      return [me, directPeer].filter(Boolean)
    }
    if (currentChannel?.isPrivate) {
      const entries = channelMembersMap[currentChannel.id] || []
      if (entries.length) return entries.map((entry) => entry.user).filter(Boolean)
    }
    return users
  }, [activeChannelId, channelMembersMap, currentChannel?.id, currentChannel?.isPrivate, directPeerId, isDirectChannel, me, userMap, users])

  const members = useMemo(() => {
    const unique = new Map()
    baseMembers.forEach((member) => {
      if (member?.id) unique.set(member.id, member)
    })
    return Array.from(unique.values()).map((member) => ({
      ...member,
      online: onlineSet.has(member.id),
    }))
  }, [baseMembers, onlineSet])

  const onlineMembers = useMemo(
    () => members.filter((member) => member.online).sort((a, b) => a.username.localeCompare(b.username)),
    [members],
  )
  const offlineMembers = useMemo(
    () => members.filter((member) => !member.online).sort((a, b) => a.username.localeCompare(b.username)),
    [members],
  )

  if (!activeChannelId) {
    return (
      <div className="w-64 border-l border-white/10 bg-[#101822] p-4">
        <div className="text-sm text-white/40">Выберите чат</div>
      </div>
    )
  }

  return (
    <div className="w-64 border-l border-white/10 bg-[#101822] flex flex-col">
      <div className="px-4 py-3 border-b border-white/10">
        <div className="text-xs uppercase tracking-[0.3em] text-white/40">Участники</div>
      </div>
      <div className="flex-1 overflow-y-auto scroll-thin px-3 py-4 space-y-4">
        <div>
          <div className="text-xs text-white/50 mb-2">Онлайн — {onlineMembers.length}</div>
          <div className="space-y-2">
            {onlineMembers.map((member) => (
              <button
                key={member.id}
                type="button"
                onClick={() => openDirectChat(member.id)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-2xl panel hover:bg-white/10 transition text-left"
              >
                <div className="flex items-center gap-3">
                  <AvatarImage user={member} size={28} src={buildAvatarUrl?.(member)} />
                  <div className="text-sm text-white/90" style={getUserNameStyle(member)}>
                    {member.displayName || member.username}
                  </div>
                </div>
                <StatusDot online />
              </button>
            ))}
            {onlineMembers.length === 0 && <div className="text-xs text-white/40 px-2">Нет онлайн</div>}
          </div>
        </div>
        <div>
          <div className="text-xs text-white/50 mb-2">Оффлайн — {offlineMembers.length}</div>
          <div className="space-y-2">
            {offlineMembers.map((member) => (
              <div
                key={member.id}
                className="w-full flex items-center justify-between px-3 py-2 rounded-2xl panel text-left text-white/50"
              >
                <div className="flex items-center gap-3">
                  <AvatarImage user={member} size={28} src={buildAvatarUrl?.(member)} />
                  <div className="text-sm" style={getUserNameStyle(member)}>
                    {member.displayName || member.username}
                  </div>
                </div>
                <StatusDot online={false} />
              </div>
            ))}
            {offlineMembers.length === 0 && <div className="text-xs text-white/40 px-2">Нет оффлайн</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
