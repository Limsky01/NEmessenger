import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import http from 'http'
import { Server } from 'socket.io'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import fs from 'fs'
import path from 'path'
import multer from 'multer'
import crypto from 'crypto'

const app = express()
const server = http.createServer(app)
const origins = process.env.ORIGIN ? process.env.ORIGIN.split(',').map((s) => s.trim()) : ['*']
const io = new Server(server, { cors: { origin: origins, methods: ['GET', 'POST', 'DELETE'] } })

const timestamp = () => new Date().toISOString()
const log = (...args) => console.log(timestamp(), ...args)
const warn = (...args) => console.warn(timestamp(), ...args)
const logError = (...args) => console.error(timestamp(), ...args)

const resolveEncryptionKey = () => {
  const raw = process.env.ENCRYPTION_KEY || ''
  if (!raw) throw new Error('ENCRYPTION_KEY environment variable is required for encryption')
  let candidate = null
  try {
    const buf = Buffer.from(raw, 'base64')
    if (buf.length === 32) candidate = buf
  } catch (_) {}
  if (!candidate) {
    try {
      const buf = Buffer.from(raw, 'hex')
      if (buf.length === 32) candidate = buf
    } catch (_) {}
  }
  if (!candidate) throw new Error('ENCRYPTION_KEY must be a 32-byte key encoded in base64 or hex')
  return candidate
}

const DATA_ENCRYPTION_KEY = resolveEncryptionKey()
const ENCRYPTED_PREFIX = 'ENC1:'
const INVITE_CODE_LENGTH = 10
const INVITE_DEFAULT_TTL = parseInt(process.env.INVITE_TTL_MS || '', 10) || 1000 * 60 * 60 * 24 * 7

const encryptText = (plain) => {
  const text = typeof plain === 'string' ? plain : String(plain ?? '')
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', DATA_ENCRYPTION_KEY, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  const payload = Buffer.concat([iv, tag, encrypted])
  return ENCRYPTED_PREFIX + payload.toString('base64')
}

const decryptText = (maybeEncrypted) => {
  if (!maybeEncrypted || typeof maybeEncrypted !== 'string') return maybeEncrypted
  if (!maybeEncrypted.startsWith(ENCRYPTED_PREFIX)) return maybeEncrypted
  try {
    const payload = Buffer.from(maybeEncrypted.slice(ENCRYPTED_PREFIX.length), 'base64')
    if (payload.length <= 28) return maybeEncrypted
    const iv = payload.subarray(0, 12)
    const tag = payload.subarray(12, 28)
    const ciphertext = payload.subarray(28)
    const decipher = crypto.createDecipheriv('aes-256-gcm', DATA_ENCRYPTION_KEY, iv)
    decipher.setAuthTag(tag)
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    return decrypted.toString('utf8')
  } catch (err) {
    warn('[ENCRYPTION] decrypt text failed', err.message)
    return maybeEncrypted
  }
}

const createFileCipher = () => {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', DATA_ENCRYPTION_KEY, iv)
  return { cipher, iv }
}

const createFileDecipher = (ivBase64, tagBase64) => {
  if (!ivBase64 || !tagBase64) return null
  try {
    const iv = Buffer.from(ivBase64, 'base64')
    const tag = Buffer.from(tagBase64, 'base64')
    if (iv.length !== 12 || tag.length !== 16) return null
    const decipher = crypto.createDecipheriv('aes-256-gcm', DATA_ENCRYPTION_KEY, iv)
    decipher.setAuthTag(tag)
    return decipher
  } catch (err) {
    warn('[ENCRYPTION] init file decipher failed', err.message)
    return null
  }
}

const pipeFileToResponse = (file, res) => {
  const stream = fs.createReadStream(file.path)
  const handleStreamError = (err) => {
    warn('[FILES] stream error', err?.message || err)
    if (!res.headersSent) {
      try {
        res.status(500).end()
      } catch (_) {}
    } else {
      res.destroy(err)
    }
  }
  stream.on('error', handleStreamError)
  if (!file.iv || !file.auth_tag) {
    stream.pipe(res)
    return
  }
  const decipher = createFileDecipher(file.iv, file.auth_tag)
  if (!decipher) {
    stream.destroy()
    if (!res.headersSent) {
      try {
        res.status(500).end()
      } catch (_) {}
    } else {
      res.destroy(new Error('decrypt_init_failed'))
    }
    return
  }
  decipher.on('error', (err) => {
    warn('[ENCRYPTION] file decrypt failed', err?.message || err)
    stream.destroy(err)
    if (!res.headersSent) {
      try {
        res.status(500).end()
      } catch (_) {}
    } else {
      res.destroy(err)
    }
  })
  stream.pipe(decipher).pipe(res)
}

app.use(cors({ origin: origins, credentials: true }))
app.use(express.json({ limit: '5mb' }))

app.use((req, res, next) => {
  const start = Date.now()
  const origin = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown'
  log('[HTTP]', req.method, req.originalUrl, 'from=' + origin)
  res.on('finish', () => {
    log('[HTTP:done]', req.method, req.originalUrl, 'status=' + res.statusCode, (Date.now() - start) + 'ms')
  })
  next()
})

const PORT = process.env.PORT || 4000
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads'
const AVATAR_DIR = path.join(UPLOAD_DIR, 'avatars')

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })
if (!fs.existsSync(path.join(UPLOAD_DIR, 'tmp'))) fs.mkdirSync(path.join(UPLOAD_DIR, 'tmp'), { recursive: true })
if (!fs.existsSync(AVATAR_DIR)) fs.mkdirSync(AVATAR_DIR, { recursive: true })

const db = new Database('messenger_v4.db')
db.pragma('journal_mode = WAL')

const identifierPattern = /^[A-Za-z_][A-Za-z0-9_]*$/

const getTableColumns = (table) => {
  if (!identifierPattern.test(table)) return []
  try {
    return db.prepare(`PRAGMA table_info(${table})`).all()
  } catch (err) {
    warn('[DB] table info failed', table, err.message)
    return []
  }
}

const tableHasColumn = (table, column) => {
  if (!identifierPattern.test(column)) return false
  return getTableColumns(table).some((col) => col?.name === column)
}

const ensureColumn = (table, column, definition) => {
  if (!identifierPattern.test(table) || !identifierPattern.test(column)) return false
  if (tableHasColumn(table, column)) return true
  try {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run()
    log('[DB] added column', `${table}.${column}`)
    return true
  } catch (err) {
    warn('[DB] add column failed', `${table}.${column}`, err.message)
    return tableHasColumn(table, column)
  }
}

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  avatar_seed TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);
CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  is_private INTEGER NOT NULL DEFAULT 0,
  created_by TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS channel_members (
  channel_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  PRIMARY KEY (channel_id, user_id)
);
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  uploader_id TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime TEXT,
  size INTEGER NOT NULL,
  path TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS voice_rooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  created_by TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  claim_token TEXT DEFAULT '',
  claimed_at INTEGER,
  used_by TEXT,
  used_at INTEGER,
  revoked_at INTEGER
);
`)


ensureColumn('users', 'avatar_seed', 'TEXT DEFAULT ""')
ensureColumn('users', 'avatar_url', 'TEXT DEFAULT ""')
ensureColumn('users', 'avatar_updated_at', 'INTEGER DEFAULT 0')
ensureColumn('users', 'avatar_mime', 'TEXT DEFAULT ""')
ensureColumn('files', 'iv', 'TEXT DEFAULT ""')
ensureColumn('files', 'auth_tag', 'TEXT DEFAULT ""')
ensureColumn('invites', 'claim_token', 'TEXT DEFAULT ""')
ensureColumn('invites', 'claimed_at', 'INTEGER')
ensureColumn('invites', 'used_by', 'TEXT')
ensureColumn('invites', 'used_at', 'INTEGER')
ensureColumn('invites', 'revoked_at', 'INTEGER')
ensureColumn('channels', 'is_private', 'INTEGER NOT NULL DEFAULT 0')
ensureColumn('channels', 'created_by', 'TEXT DEFAULT ""')
ensureColumn('messages', 'updated_at', 'INTEGER DEFAULT 0')

const hasMessageUpdatedAtColumn = tableHasColumn('messages', 'updated_at')
try {
  db.prepare('ALTER TABLE users ADD COLUMN avatar_seed TEXT DEFAULT ""').run()
} catch (err) {}
try {
  db.prepare('ALTER TABLE users ADD COLUMN avatar_url TEXT DEFAULT ""').run()
} catch (err) {}
try {
  db.prepare('ALTER TABLE users ADD COLUMN avatar_updated_at INTEGER DEFAULT 0').run()
} catch (err) {}
try {
  db.prepare('ALTER TABLE users ADD COLUMN avatar_mime TEXT DEFAULT ""').run()
} catch (err) {}
try {
  db.prepare('ALTER TABLE files ADD COLUMN iv TEXT DEFAULT ""').run()
} catch (err) {}
try {
  db.prepare('ALTER TABLE files ADD COLUMN auth_tag TEXT DEFAULT ""').run()
} catch (err) {}
try {
  db.prepare('ALTER TABLE invites ADD COLUMN claim_token TEXT DEFAULT ""').run()
} catch (err) {}
try {
  db.prepare('ALTER TABLE invites ADD COLUMN claimed_at INTEGER').run()
} catch (err) {}
try {
  db.prepare('ALTER TABLE invites ADD COLUMN used_by TEXT').run()
} catch (err) {}
try {
  db.prepare('ALTER TABLE invites ADD COLUMN used_at INTEGER').run()
} catch (err) {}
try {
  db.prepare('ALTER TABLE invites ADD COLUMN revoked_at INTEGER').run()
} catch (err) {}
try {
  db.prepare('ALTER TABLE channels ADD COLUMN is_private INTEGER NOT NULL DEFAULT 0').run()
} catch (err) {}
try {
  db.prepare('ALTER TABLE channels ADD COLUMN created_by TEXT DEFAULT ""').run()
} catch (err) {}
try {
  db.prepare('ALTER TABLE messages ADD COLUMN updated_at INTEGER DEFAULT 0').run()
} catch (err) {}

db.prepare('UPDATE users SET avatar_seed = COALESCE(avatar_seed, substr(username,1,2))').run()

const selectUserById = db.prepare('SELECT * FROM users WHERE id=?')
const updateAvatarInfoStmt = db.prepare('UPDATE users SET avatar_url=?, avatar_updated_at=?, avatar_mime=? WHERE id=?')
const updatePasswordStmt = db.prepare('UPDATE users SET password_hash=? WHERE id=?')
const updateUserRoleStmt = db.prepare('UPDATE users SET role=? WHERE id=?')
const countAdminsStmt = db.prepare("SELECT COUNT(*) as count FROM users WHERE role='admin'")
const listVoiceRoomsStmt = db.prepare('SELECT id, name, created_at, created_by FROM voice_rooms ORDER BY created_at ASC')
const insertVoiceRoomStmt = db.prepare('INSERT INTO voice_rooms (id, name, created_at, created_by) VALUES (?,?,?,?)')
const deleteVoiceRoomStmt = db.prepare('DELETE FROM voice_rooms WHERE id=?')
const selectVoiceRoomStmt = db.prepare('SELECT id, name FROM voice_rooms WHERE id=?')
const insertInviteStmt = db.prepare(
  'INSERT INTO invites (id, code, created_by, created_at, expires_at, claim_token, claimed_at, used_by, used_at, revoked_at) VALUES (?,?,?,?,?, ?, NULL, NULL, NULL, NULL)'
)
const selectInviteByCodeStmt = db.prepare('SELECT * FROM invites WHERE code=?')
const selectInviteByIdStmt = db.prepare('SELECT * FROM invites WHERE id=?')
const listInvitesByCreatorStmt = db.prepare('SELECT * FROM invites WHERE created_by=? ORDER BY created_at DESC')
const updateInviteClaimStmt = db.prepare('UPDATE invites SET claim_token=?, claimed_at=? WHERE id=?')
const markInviteUsedStmt = db.prepare("UPDATE invites SET used_by=?, used_at=?, claim_token='', revoked_at=NULL WHERE id=?")
const revokeInviteStmt = db.prepare('UPDATE invites SET revoked_at=?, claim_token="" WHERE id=?')
const findMessageById = db.prepare('SELECT id, channel_id, sender_id FROM messages WHERE id=?')
const selectMessageFullById = db.prepare('SELECT * FROM messages WHERE id=?')
const deleteMessageStmt = db.prepare('DELETE FROM messages WHERE id=?')

const updateMessageContentStmt = hasMessageUpdatedAtColumn
  ? db.prepare('UPDATE messages SET content=?, updated_at=? WHERE id=?')
  : db.prepare('UPDATE messages SET content=? WHERE id=?')

const selectChannelByIdStmt = db.prepare('SELECT * FROM channels WHERE id=?')
const insertChannelStmt = db.prepare(
  'INSERT INTO channels (id, workspace_id, name, created_at, is_private, created_by) VALUES (?,?,?,?,?,?)',
)
const listAllChannelsStmt = db.prepare('SELECT * FROM channels WHERE workspace_id=? ORDER BY created_at ASC')
const listUserChannelMembershipsStmt = db.prepare('SELECT channel_id, role FROM channel_members WHERE user_id=?')
const listChannelMembersStmt = db.prepare('SELECT user_id, role FROM channel_members WHERE channel_id=? ORDER BY user_id ASC')
const listChannelMembersDetailedStmt = db.prepare(
  "SELECT m.user_id, m.role, u.username FROM channel_members m JOIN users u ON u.id = m.user_id WHERE m.channel_id=? ORDER BY u.username ASC",
)
const insertChannelMemberStmt = db.prepare('INSERT OR REPLACE INTO channel_members (channel_id, user_id, role) VALUES (?,?,?)')
const deleteChannelMemberStmt = db.prepare('DELETE FROM channel_members WHERE channel_id=? AND user_id=?')
const findChannelMemberStmt = db.prepare('SELECT role FROM channel_members WHERE channel_id=? AND user_id=?')
const countChannelMembersStmt = db.prepare('SELECT COUNT(*) as count FROM channel_members WHERE channel_id=?')
const listAdminsStmt = db.prepare("SELECT id FROM users WHERE role='admin'")

const decryptMessageRow = (row) => {
  if (!row) return row
  if (typeof row.content === 'undefined') return row
  const updatedAt = row.updated_at ?? row.updatedAt ?? 0
  return { ...row, content: decryptText(row.content), updated_at: updatedAt, updatedAt }
}

const decryptMessages = (rows) => rows.map(decryptMessageRow)

let defaultWs = db.prepare('SELECT id FROM workspaces LIMIT 1').get()
if (!defaultWs) {
  const wsId = uuidv4()
  db.prepare('INSERT INTO workspaces (id,name,created_at) VALUES (?,?,?)').run(wsId, 'Home', Date.now())
  const chId = uuidv4()
  db.prepare('INSERT INTO channels (id,workspace_id,name,created_at,is_private,created_by) VALUES (?,?,?,?,?,?)').run(
    chId,
    wsId,
    'general',
    Date.now(),
    0,
    '',
  )
  defaultWs = { id: wsId }
}

let cachedVoiceRooms = listVoiceRoomsStmt.all()
if (!cachedVoiceRooms.length) {
  const vrId = uuidv4()
  insertVoiceRoomStmt.run(vrId, 'Общий голосовой', Date.now(), '')
  cachedVoiceRooms = listVoiceRoomsStmt.all()
}

const publicUser = (u) => {
  if (!u) return null
  const seed = u.avatar_seed ?? u.avatarSeed ?? ''
  const avatarPath = u.avatar_url ?? u.avatarUrl ?? ''
  const avatarUpdatedAt = u.avatar_updated_at ?? u.avatarUpdatedAt ?? 0
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    avatarSeed: seed,
    avatar_seed: seed,
    avatarUrl: avatarPath ? '/api/users/' + u.id + '/avatar' : '',
    avatar_url: avatarPath,
    avatarUpdatedAt,
    avatar_updated_at: avatarUpdatedAt,
  }
}

const fileMeta = (file) => {
  if (!file) return null
  return {
    id: file.id,
    name: file.original_name,
    mime: file.mime || '',
    size: file.size ?? 0,
  }
}

const listWorkspaceMembersStmt = db.prepare('SELECT user_id FROM workspace_members WHERE workspace_id=?')

const normalizeChannelRow = (row) => {
  if (!row) return null
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    createdAt: row.created_at,
    isPrivate: Boolean(row.is_private),
    createdBy: row.created_by || '',
  }
}

const getChannelMemberCount = (channelId) => {
  try {
    const result = countChannelMembersStmt.get(channelId)
    return result?.count ?? 0
  } catch (err) {
    warn('[CHANNELS] count members failed', err.message)
    return 0
  }
}

const getAccessibleChannelsForUser = (user) => {
  if (!user) return []
  const memberships = new Map()
  try {
    const rows = listUserChannelMembershipsStmt.all(user.id)
    rows.forEach((row) => memberships.set(row.channel_id, row.role || 'member'))
  } catch (err) {
    warn('[CHANNELS] list memberships failed', err.message)
  }
  const allChannels = listAllChannelsStmt.all(defaultWs.id)
  return allChannels
    .map(normalizeChannelRow)
    .filter(Boolean)
    .filter((channel) => {
      if (!channel.isPrivate) return true
      if (user.role === 'admin') return true
      if (channel.createdBy && channel.createdBy === user.id) return true
      return memberships.has(channel.id)
    })
    .map((channel) => {
      const memberCount = channel.isPrivate ? getChannelMemberCount(channel.id) : 0
      const ownerRole = channel.createdBy && channel.createdBy === user.id ? 'owner' : ''
      const membershipRole = ownerRole || memberships.get(channel.id) || (user.role === 'admin' && channel.isPrivate ? 'admin' : '')
      return {
        id: channel.id,
        name: channel.name,
        createdAt: channel.createdAt,
        isPrivate: channel.isPrivate,
        createdBy: channel.createdBy,
        memberCount,
        membershipRole,
      }
    })
}

const getChannelAudienceUserIds = (channel) => {
  if (!channel) return []
  const normalized = normalizeChannelRow(channel)
  if (!normalized) return []
  if (!normalized.isPrivate) {
    const members = listWorkspaceMembersStmt.all(normalized.workspaceId).map((row) => row.user_id)
    const admins = listAdminsStmt.all().map((row) => row.id)
    return Array.from(new Set([...members, ...admins].filter(Boolean)))
  }
  const members = listChannelMembersStmt.all(normalized.id).map((row) => row.user_id)
  const admins = listAdminsStmt.all().map((row) => row.id)
  const payload = new Set([...members, normalized.createdBy, ...admins].filter(Boolean))
  return Array.from(payload)
}

const emitChannelListForUser = (userId) => {
  if (!userId) return
  const user = selectUserById.get(userId)
  if (!user) return
  const channels = getAccessibleChannelsForUser(user)
  const socketId = onlineUsers.get(userId)
  if (socketId) {
    io.to(socketId).emit('channel:list', { channels })
  }
  return channels
}

const emitChannelListForUsers = (userIds) => {
  const seen = new Set()
  userIds.forEach((userId) => {
    if (!userId || seen.has(userId)) return
    seen.add(userId)
    emitChannelListForUser(userId)
  })
}

const removeUserFromChannelRoom = (channelId, userId) => {
  const socketId = onlineUsers.get(userId)
  if (!socketId) return
  const socket = io.sockets.sockets.get(socketId)
  if (!socket) return
  if (socket.rooms.has(channelId)) {
    socket.leave(channelId)
    if (socket.user?.id === userId) {
      socket.emit('channel:revoked', { channelId })
    }
  }
}

const resolveChannelAccess = (user, channelId) => {
  if (!user || !channelId) return { allowed: false }
  const channel = selectChannelByIdStmt.get(channelId)
  if (!channel) return { allowed: false }
  if (!channel.is_private) return { allowed: true, channel }
  if (user.role === 'admin') return { allowed: true, channel, role: 'admin' }
  if (channel.created_by && channel.created_by === user.id) return { allowed: true, channel, role: 'owner' }
  const membership = findChannelMemberStmt.get(channelId, user.id)
  if (membership) return { allowed: true, channel, role: membership.role || 'member' }
  return { allowed: false }
}

const getChannelMembersDetailed = (channelId) => {
  const rows = listChannelMembersStmt.all(channelId)
  return rows
    .map((row) => {
      const user = selectUserById.get(row.user_id)
      if (!user) return null
      return { user: publicUser(user), role: row.role || 'member' }
    })
    .filter(Boolean)
}

const buildDirectChannelId = (a, b) => `dm:${[a, b].sort().join(':')}`
const parseDirectChannelId = (channelId) => {
  if (!channelId || typeof channelId !== 'string') return null
  if (!channelId.startsWith('dm:')) return null
  const parts = channelId.split(':')
  if (parts.length !== 3) return null
  const [, rawA, rawB] = parts
  if (!rawA || !rawB) return null
  const [first, second] = [rawA, rawB].sort()
  return { first, second }
}
const normalizeDirectChannelId = (channelId) => {
  const parsed = parseDirectChannelId(channelId)
  if (!parsed) return null
  return buildDirectChannelId(parsed.first, parsed.second)
}
const isMemberOfDirectChannel = (channelId, userId) => {
  const parsed = parseDirectChannelId(channelId)
  if (!parsed) return false
  return parsed.first === userId || parsed.second === userId
}

const auth = (req, res, next) => {
  const hdr = req.headers.authorization || ''
  let token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null
  if (!token && req.query?.token) {
    token = req.query.token
    delete req.query.token
  }
  if (!token && req.headers['x-access-token']) token = req.headers['x-access-token']
  if (!token) {
    warn('[AUTH] no token provided', req.originalUrl)
    return res.status(401).json({ error: 'no_token' })
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET)
    log('[AUTH] token verified', 'user=' + (req.user.username || req.user.id))
    next()
  } catch (e) {
    warn('[AUTH] invalid token', e.message)
    return res.status(401).json({ error: 'invalid_token' })
  }
}

const adminOnly = (req, res, next) => {
  const u = selectUserById.get(req.user.id)
  if (u?.role === 'admin') return next()
  return res.status(403).json({ error: 'forbidden' })
}

app.post('/api/invites/claim', (req, res) => {
  const codeRaw = typeof req.body?.code === 'string' ? req.body.code : ''
  const code = codeRaw.trim().toUpperCase()
  if (!code) {
    warn('[INVITES] claim missing code')
    return res.status(400).json({ error: 'code_required' })
  }
  const invite = selectInviteByCodeStmt.get(code)
  if (!invite) {
    warn('[INVITES] claim invalid code', code)
    return res.status(400).json({ error: 'invalid_code' })
  }
  const now = Date.now()
  if (invite.revoked_at) {
    warn('[INVITES] claim revoked', code)
    return res.status(400).json({ error: 'invite_revoked' })
  }
  if (invite.used_by) {
    warn('[INVITES] claim used', code)
    return res.status(400).json({ error: 'invite_used' })
  }
  if (invite.expires_at && invite.expires_at < now) {
    warn('[INVITES] claim expired', code)
    return res.status(400).json({ error: 'invite_expired' })
  }
  const claimToken = generateClaimToken()
  updateInviteClaimStmt.run(claimToken, now, invite.id)
  const updated = selectInviteByIdStmt.get(invite.id)
  const creator = selectUserById.get(invite.created_by)
  const creatorInfo = creator ? { id: creator.id, username: creator.username } : { id: '', username: '' }
  log('[INVITES] claimed', code, 'by_ip=' + req.ip)
  res.json({
    invite: {
      code: updated.code,
      createdAt: updated.created_at,
      expiresAt: updated.expires_at,
      status: getInviteStatus(updated),
      createdBy: creatorInfo,
    },
    claimToken,
  })
})

app.post('/api/register', (req, res) => {
  const { username: rawUsername, password: rawPassword, inviteCode: rawInviteCode, inviteClaimToken } = req.body || {}
  const username = typeof rawUsername === 'string' ? rawUsername.trim() : ''
  const password = typeof rawPassword === 'string' ? rawPassword : ''
  if (!username || !password) {
    warn('[REGISTER] invalid payload', req.ip)
    return res.status(400).json({ error: 'username_and_password_required' })
  }
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    warn('[REGISTER] weak password', username)
    return res.status(400).json({ error: 'weak_password' })
  }
  log('[REGISTER] attempt', username, 'ip=' + req.ip)
  const firstUserExists = db.prepare('SELECT 1 FROM users LIMIT 1').get()
  const isFirstUser = !firstUserExists
  let invite = null
  if (!isFirstUser) {
    const inviteCode = typeof rawInviteCode === 'string' ? rawInviteCode.trim().toUpperCase() : ''
    const claimToken = typeof inviteClaimToken === 'string' ? inviteClaimToken.trim() : ''
    if (!inviteCode || !claimToken) {
      warn('[REGISTER] invite required missing data', username)
      return res.status(400).json({ error: 'invite_required' })
    }
    invite = selectInviteByCodeStmt.get(inviteCode)
    if (!invite) {
      warn('[REGISTER] invalid invite', inviteCode)
      return res.status(400).json({ error: 'invalid_invite' })
    }
    const now = Date.now()
    if (invite.revoked_at) {
      warn('[REGISTER] invite revoked', inviteCode)
      return res.status(400).json({ error: 'invite_revoked' })
    }
    if (invite.used_by) {
      warn('[REGISTER] invite already used', inviteCode)
      return res.status(400).json({ error: 'invite_used' })
    }
    if (invite.expires_at && invite.expires_at < now) {
      warn('[REGISTER] invite expired', inviteCode)
      return res.status(400).json({ error: 'invite_expired' })
    }
    if (!invite.claim_token || invite.claim_token !== claimToken) {
      warn('[REGISTER] invite claim mismatch', inviteCode)
      return res.status(400).json({ error: 'invite_claim_invalid' })
    }
  }
  const id = uuidv4()
  const hash = bcrypt.hashSync(password, 10)
  const role = isFirstUser ? 'admin' : 'user'
  const avatarSeed = username.slice(0, 2)
  try {
    db.prepare('INSERT INTO users (id,username,password_hash,role,avatar_seed) VALUES (?,?,?,?,?)').run(id, username, hash, role, avatarSeed)
  } catch (e) {
    warn('[REGISTER] username_taken', username)
    return res.status(400).json({ error: 'username_taken' })
  }
  db.prepare('INSERT OR IGNORE INTO workspace_members (workspace_id,user_id) VALUES (?,?)').run(defaultWs.id, id)
  if (invite) {
    markInviteUsedStmt.run(id, Date.now(), invite.id)
  }
  const token = jwt.sign({ id, username, role, avatar_seed: avatarSeed }, JWT_SECRET, { expiresIn: '30d' })
  const user = publicUser({ id, username, role, avatar_seed: avatarSeed })
  log('[REGISTER] success', username, 'role=' + role, invite ? 'invite=' + invite.code : 'no_invite')
  res.json({ token, user })
  io.emit('user:update', user)
})

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {}
  log('[LOGIN] attempt', username, 'ip=' + req.ip)
  const userRecord = db.prepare('SELECT * FROM users WHERE username=?').get(username)
  if (!userRecord) {
    warn('[LOGIN] invalid username', username)
    return res.status(401).json({ error: 'invalid_credentials' })
  }
  if (!bcrypt.compareSync(password, userRecord.password_hash)) {
    warn('[LOGIN] invalid password', username)
    return res.status(401).json({ error: 'invalid_credentials' })
  }
  db.prepare('INSERT OR IGNORE INTO workspace_members (workspace_id,user_id) VALUES (?,?)').run(defaultWs.id, userRecord.id)
  const token = jwt.sign({ id: userRecord.id, username: userRecord.username, role: userRecord.role, avatar_seed: userRecord.avatar_seed || '' }, JWT_SECRET, { expiresIn: '30d' })
  log('[LOGIN] success', username)
  res.json({ token, user: publicUser(userRecord) })
})

app.get('/api/invites', auth, (req, res) => {
  const invites = listInvitesByCreatorStmt.all(req.user.id).map(formatInvite)
  log('[INVITES] list', 'user=' + req.user.id, 'count=' + invites.length)
  res.json({ invites })
})

app.post('/api/invites', auth, (req, res) => {
  const maxTtl = 1000 * 60 * 60 * 24 * 30
  let ttlMs = parseInt(req.body?.ttlMs, 10)
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) ttlMs = INVITE_DEFAULT_TTL
  if (ttlMs > maxTtl) ttlMs = maxTtl
  const now = Date.now()
  const id = uuidv4()
  const code = generateInviteCode()
  insertInviteStmt.run(id, code, req.user.id, now, now + ttlMs, '')
  const invite = selectInviteByIdStmt.get(id)
  log('[INVITES] create', code, 'user=' + req.user.id, 'ttl=' + ttlMs)
  res.status(201).json({ invite: formatInvite(invite) })
})

app.post('/api/invites/:id/revoke', auth, (req, res) => {
  const invite = selectInviteByIdStmt.get(req.params.id)
  if (!invite) {
    warn('[INVITES] revoke missing', req.params.id)
    return res.status(404).json({ error: 'not_found' })
  }
  if (invite.created_by !== req.user.id && req.user.role !== 'admin') {
    warn('[INVITES] revoke forbidden', 'user=' + req.user.id, 'target=' + invite.id)
    return res.status(403).json({ error: 'forbidden' })
  }
  if (invite.used_by) {
    warn('[INVITES] revoke used', invite.code)
    return res.status(400).json({ error: 'invite_used' })
  }
  if (invite.revoked_at) {
    return res.status(400).json({ error: 'invite_revoked' })
  }
  revokeInviteStmt.run(Date.now(), invite.id)
  const updated = selectInviteByIdStmt.get(invite.id)
  log('[INVITES] revoked', invite.code, 'by=' + req.user.id)
  res.json({ invite: formatInvite(updated) })
})

app.get('/api/channels', auth, (req, res) => {
  const user = selectUserById.get(req.user.id)
  if (!user) return res.status(404).json({ error: 'not_found' })
  const channels = getAccessibleChannelsForUser(user)
  res.json({ channels })
})

app.post('/api/channels', auth, (req, res) => {
  const user = selectUserById.get(req.user.id)
  if (!user) return res.status(404).json({ error: 'not_found' })
  const { name, memberIds, isPrivate = true } = req.body || {}
  const trimmed = typeof name === 'string' ? name.trim() : ''
  if (!trimmed || trimmed.length < 2 || trimmed.length > 64)
    return res.status(400).json({ error: 'invalid_name' })
  const privateFlag = isPrivate !== false
  const now = Date.now()
  const channelId = uuidv4()
  insertChannelStmt.run(channelId, defaultWs.id, trimmed, now, privateFlag ? 1 : 0, privateFlag ? req.user.id : req.user.id)
  if (privateFlag) {
    insertChannelMemberStmt.run(channelId, req.user.id, 'owner')
    const provided = Array.isArray(memberIds) ? memberIds : []
    const unique = new Set(provided.filter((id) => typeof id === 'string' && id && id !== req.user.id))
    unique.forEach((memberId) => {
      const target = selectUserById.get(memberId)
      if (!target) return
      insertChannelMemberStmt.run(channelId, memberId, 'member')
    })
  }
  const channelRow = selectChannelByIdStmt.get(channelId)
  const audience = getChannelAudienceUserIds(channelRow)
  emitChannelListForUsers(audience)
  const creatorChannels = getAccessibleChannelsForUser(selectUserById.get(req.user.id)).filter((ch) => ch.id === channelId)
  const channelPayload = creatorChannels[0] || {
    id: channelRow.id,
    name: channelRow.name,
    createdAt: channelRow.created_at,
    isPrivate: Boolean(channelRow.is_private),
    createdBy: channelRow.created_by || req.user.id,
    memberCount: channelRow.is_private ? getChannelMemberCount(channelRow.id) : 0,
    membershipRole: privateFlag ? 'owner' : '',
  }
  const members = privateFlag ? getChannelMembersDetailed(channelId) : []
  log('[CHANNELS] create', channelId, 'user=' + req.user.id, 'private=' + privateFlag)
  res.status(201).json({ channel: channelPayload, members })
})

app.get('/api/channels/:id/members', auth, (req, res) => {
  const user = selectUserById.get(req.user.id)
  if (!user) return res.status(404).json({ error: 'not_found' })
  const access = resolveChannelAccess(user, req.params.id)
  if (!access.allowed) return res.status(404).json({ error: 'not_found' })
  const channel = access.channel || selectChannelByIdStmt.get(req.params.id)
  if (!channel) return res.status(404).json({ error: 'not_found' })
  if (!channel.is_private) return res.json({ members: [] })
  const members = getChannelMembersDetailed(req.params.id)
  res.json({ members })
})

app.post('/api/channels/:id/members', auth, (req, res) => {
  const user = selectUserById.get(req.user.id)
  if (!user) return res.status(404).json({ error: 'not_found' })
  const access = resolveChannelAccess(user, req.params.id)
  if (!access.allowed) return res.status(404).json({ error: 'not_found' })
  const channel = access.channel || selectChannelByIdStmt.get(req.params.id)
  if (!channel) return res.status(404).json({ error: 'not_found' })
  if (!channel.is_private) return res.status(400).json({ error: 'not_private' })
  const canManage = access.role === 'owner' || user.role === 'admin'
  if (!canManage) return res.status(403).json({ error: 'forbidden' })
  const targetId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : ''
  if (!targetId) return res.status(400).json({ error: 'invalid_user' })
  if (targetId === channel.created_by) return res.status(400).json({ error: 'cannot_modify_owner' })
  const targetUser = selectUserById.get(targetId)
  if (!targetUser) return res.status(404).json({ error: 'user_not_found' })
  insertChannelMemberStmt.run(req.params.id, targetId, 'member')
  const refreshed = selectChannelByIdStmt.get(req.params.id)
  const audience = getChannelAudienceUserIds(refreshed)
  emitChannelListForUsers([...audience, targetId])
  const members = getChannelMembersDetailed(req.params.id)
  log('[CHANNELS] member:add', req.params.id, 'actor=' + req.user.id, 'target=' + targetId)
  res.json({ members })
})

app.delete('/api/channels/:id/members/:userId', auth, (req, res) => {
  const user = selectUserById.get(req.user.id)
  if (!user) return res.status(404).json({ error: 'not_found' })
  const access = resolveChannelAccess(user, req.params.id)
  if (!access.allowed) return res.status(404).json({ error: 'not_found' })
  const channel = access.channel || selectChannelByIdStmt.get(req.params.id)
  if (!channel) return res.status(404).json({ error: 'not_found' })
  if (!channel.is_private) return res.status(400).json({ error: 'not_private' })
  const targetId = req.params.userId
  if (!targetId) return res.status(400).json({ error: 'invalid_user' })
  if (targetId === channel.created_by) return res.status(400).json({ error: 'cannot_modify_owner' })
  const membership = findChannelMemberStmt.get(req.params.id, targetId)
  if (!membership) return res.status(404).json({ error: 'not_found' })
  const canManage = access.role === 'owner' || user.role === 'admin' || targetId === req.user.id
  if (!canManage) return res.status(403).json({ error: 'forbidden' })
  deleteChannelMemberStmt.run(req.params.id, targetId)
  removeUserFromChannelRoom(req.params.id, targetId)
  const refreshed = selectChannelByIdStmt.get(req.params.id)
  const audience = getChannelAudienceUserIds(refreshed)
  emitChannelListForUsers([...audience, targetId])
  const members = getChannelMembersDetailed(req.params.id)
  log('[CHANNELS] member:remove', req.params.id, 'actor=' + req.user.id, 'target=' + targetId)
  res.json({ members })
})

app.get('/api/users', auth, (req, res) => {
  const users = db
    .prepare('SELECT id, username, role, avatar_seed, avatar_url, avatar_updated_at FROM users ORDER BY username ASC')
    .all()
  log('[USERS] list', 'by=' + req.user.id, 'count=' + users.length)
  res.json({ users: users.map(publicUser) })
})

app.get('/api/profile', auth, (req, res) => {
  const user = selectUserById.get(req.user.id)
  if (!user) {
    warn('[PROFILE] not found', req.user.id)
    return res.status(404).json({ error: 'not_found' })
  }
  log('[PROFILE] fetch', 'user=' + req.user.id)
  res.json({ profile: publicUser(user) })
})

app.post('/api/profile/avatar', auth, (req, res) => {
  avatarUpload.single('avatar')(req, res, (err) => {
    if (err) {
      logError('avatar upload failed', err)
      const code = err.code === 'LIMIT_FILE_SIZE' ? 'avatar_too_large' : 'invalid_avatar'
      return res.status(400).json({ error: code })
    }
    if (!req.file) {
      warn('[AVATAR] empty upload', req.user.id)
      return res.status(400).json({ error: 'invalid_avatar' })
    }

    const existing = selectUserById.get(req.user.id)
    if (!existing) return res.status(404).json({ error: 'not_found' })

    const relPath = path.relative(UPLOAD_DIR, req.file.path)
    const previousPath = existing.avatar_url ? path.join(UPLOAD_DIR, existing.avatar_url) : null

    updateAvatarInfoStmt.run(relPath, Date.now(), req.file.mimetype || '', req.user.id)
    log('[AVATAR] updated', req.user.id, req.file.originalname || req.file.filename)

    if (previousPath && fs.existsSync(previousPath) && previousPath !== req.file.path) {
      try {
        fs.unlinkSync(previousPath)
      } catch (e) {
        warn('avatar cleanup failed', e.message)
      }
    }

    const updated = selectUserById.get(req.user.id)
    const payload = publicUser(updated)
    io.emit('user:update', payload)
    res.json({ user: payload })
  })
})

app.get('/api/users/:id/avatar', (req, res) => {
  const user = selectUserById.get(req.params.id)
  if (!user?.avatar_url) {
    warn('[AVATAR] not found', 'target=' + req.params.id)
    return res.status(404).json({ error: 'not_found' })
  }
  const avatarPath = path.resolve(path.join(UPLOAD_DIR, user.avatar_url))
  const uploadsRoot = path.resolve(UPLOAD_DIR)
  if (!avatarPath.startsWith(uploadsRoot)) return res.status(403).json({ error: 'forbidden' })
  if (!fs.existsSync(avatarPath)) {
    warn('[AVATAR] missing file', 'target=' + req.params.id)
    return res.status(404).json({ error: 'missing_file' })
  }
  if (user.avatar_updated_at) res.setHeader('Last-Modified', new Date(user.avatar_updated_at).toUTCString())
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
  log('[AVATAR] served', 'target=' + req.params.id, 'file=' + path.basename(avatarPath))
  res.sendFile(avatarPath)
})
app.post('/api/profile/password', auth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {}
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'invalid_payload' })
  if (newPassword.length < 6) return res.status(400).json({ error: 'password_too_short' })
  const user = selectUserById.get(req.user.id)
  if (!user) {
    warn('[PROFILE] not found', req.user.id)
    return res.status(404).json({ error: 'not_found' })
  }
  if (!bcrypt.compareSync(currentPassword, user.password_hash)) return res.status(401).json({ error: 'invalid_current_password' })
  const hash = bcrypt.hashSync(newPassword, 10)
  updatePasswordStmt.run(hash, req.user.id)
  log('[PROFILE] password changed', req.user.id)
  res.json({ ok: true })
})

app.get('/api/admin/files', auth, adminOnly, (req, res) => {
  log('[ADMIN] files:list', 'admin=' + req.user.id)
  res.json({ files: db.prepare('SELECT * FROM files ORDER BY created_at DESC').all() })
})
app.delete('/api/admin/files/:id', auth, adminOnly, (req, res) => {
  const f = db.prepare('SELECT * FROM files WHERE id=?').get(req.params.id)
  if (!f) {
    warn('[ADMIN] file:missing', 'admin=' + req.user.id, 'id=' + req.params.id)
    return res.status(404).json({ error: 'not_found' })
  }
  try {
    fs.unlinkSync(f.path)
  } catch (e) {}
  db.prepare('DELETE FROM files WHERE id=?').run(req.params.id)
  log('[ADMIN] file:deleted', 'admin=' + req.user.id, 'id=' + req.params.id)
  res.json({ ok: true })
})
app.delete('/api/admin/users/:id', auth, adminOnly, (req, res) => {
  const id = req.params.id
  const existing = selectUserById.get(id)
  if (!existing) return res.status(404).json({ error: 'not_found' })
  if (existing.role === 'admin') {
    const totalAdmins = countAdminsStmt.get()?.count || 0
    if (totalAdmins <= 1) return res.status(400).json({ error: 'last_admin' })
  }
  if (existing.avatar_url) {
    const avatarPath = path.resolve(path.join(UPLOAD_DIR, existing.avatar_url))
    const uploadsRoot = path.resolve(UPLOAD_DIR)
    if (avatarPath.startsWith(uploadsRoot) && fs.existsSync(avatarPath)) {
      try {
        fs.unlinkSync(avatarPath)
      } catch (err) {
        warn('[ADMIN] avatar cleanup failed', err.message)
      }
    }
  }
  db.prepare('DELETE FROM messages WHERE sender_id=?').run(id)
  db.prepare('DELETE FROM workspace_members WHERE user_id=?').run(id)
  db.prepare('DELETE FROM users WHERE id=?').run(id)
  const sid = onlineUsers.get(id)
  if (sid) {
    onlineUsers.delete(id)
    const socket = io.sockets.sockets.get(sid)
    if (socket) {
      try {
        socket.disconnect(true)
      } catch (err) {
        warn('[ADMIN] disconnect failed', err.message)
      }
    }
    io.emit('presence:update', { onlineUserIds: Array.from(onlineUsers.keys()) })
  }
  log('[ADMIN] user:deleted', 'admin=' + req.user.id, 'target=' + id)
  res.json({ ok: true })
})

app.get('/api/voice-rooms', auth, (req, res) => {
  const rooms = listVoiceRoomsStmt.all().map(formatVoiceRoom)
  res.json({ rooms })
})

app.post('/api/voice-rooms', auth, adminOnly, (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
  if (!name) return res.status(400).json({ error: 'invalid_name' })
  const id = uuidv4()
  const now = Date.now()
  insertVoiceRoomStmt.run(id, name, now, req.user.id)
  emitVoiceRoomsUpdate()
  res.status(201).json({ room: formatVoiceRoom({ id, name, created_at: now, created_by: req.user.id }) })
})

app.delete('/api/voice-rooms/:id', auth, adminOnly, (req, res) => {
  const room = selectVoiceRoomStmt.get(req.params.id)
  if (!room) return res.status(404).json({ error: 'not_found' })
  const participants = voiceParticipants.get(room.id)
  if (participants) {
    for (const participant of participants.values()) {
      const targetSocket = io.sockets.sockets.get(participant.socketId)
      if (targetSocket) {
        targetSocket.emit('voice:room-closed', { roomId: room.id })
        leaveVoiceRoom(targetSocket, { silent: true })
      }
    }
  }
  deleteVoiceRoomStmt.run(room.id)
  emitVoiceRoomsUpdate()
  res.json({ ok: true })
})

app.patch('/api/admin/users/:id/role', auth, adminOnly, (req, res) => {
  const id = req.params.id
  const { role } = req.body || {}
  if (!role || (role !== 'admin' && role !== 'user')) return res.status(400).json({ error: 'invalid_role' })
  const existing = selectUserById.get(id)
  if (!existing) return res.status(404).json({ error: 'not_found' })
  if (existing.role === role) return res.json({ user: publicUser(existing) })
  if (existing.role === 'admin' && role !== 'admin') {
    const totalAdmins = countAdminsStmt.get()?.count || 0
    if (totalAdmins <= 1) return res.status(400).json({ error: 'last_admin' })
  }
  updateUserRoleStmt.run(role, id)
  const updated = selectUserById.get(id)
  const payload = publicUser(updated)
  io.emit('user:update', payload)
  log('[ADMIN] role:update', 'admin=' + req.user.id, 'target=' + id, 'role=' + role)
  res.json({ user: payload })
})

app.post('/api/admin/users/:id/password', auth, adminOnly, (req, res) => {
  const id = req.params.id
  const { newPassword } = req.body || {}
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6)
    return res.status(400).json({ error: 'password_too_short' })
  const existing = selectUserById.get(id)
  if (!existing) return res.status(404).json({ error: 'not_found' })
  const hash = bcrypt.hashSync(newPassword, 10)
  updatePasswordStmt.run(hash, id)
  log('[ADMIN] password:reset', 'admin=' + req.user.id, 'target=' + id)
  res.json({ ok: true })
})

app.delete('/api/admin/users/:id/avatar', auth, adminOnly, (req, res) => {
  const id = req.params.id
  const existing = selectUserById.get(id)
  if (!existing) return res.status(404).json({ error: 'not_found' })
  if (existing.avatar_url) {
    const avatarPath = path.resolve(path.join(UPLOAD_DIR, existing.avatar_url))
    const uploadsRoot = path.resolve(UPLOAD_DIR)
    if (avatarPath.startsWith(uploadsRoot) && fs.existsSync(avatarPath)) {
      try {
        fs.unlinkSync(avatarPath)
      } catch (err) {
        warn('[ADMIN] avatar delete failed', err.message)
      }
    }
  }
  updateAvatarInfoStmt.run('', 0, '', id)
  const updated = selectUserById.get(id)
  const payload = publicUser(updated)
  io.emit('user:update', payload)
  log('[ADMIN] avatar:deleted', 'admin=' + req.user.id, 'target=' + id)
  res.json({ user: payload })
})

const avatarStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const target = path.join(AVATAR_DIR, req.user.id)
    fs.mkdirSync(target, { recursive: true })
    cb(null, target)
  },
  filename: (_req, file, cb) => {
    const ext = (path.extname(file.originalname || '') || '.png').toLowerCase()
    const allowed = ['.png', '.jpg', '.jpeg', '.gif', '.webp']
    const safeExt = allowed.includes(ext) ? ext : '.png'
    const name = Date.now().toString() + safeExt
    cb(null, name)
  },
})

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file?.mimetype?.startsWith('image/')) {
      cb(new Error('invalid_avatar_type'))
      return
    }
    cb(null, true)
  },
})

const upload = multer({ storage: multer.memoryStorage() })

app.post('/api/upload/init', auth, (req, res) => {
  const { filename, size } = req.body || {}
  if (!filename || !size) return res.status(400).json({ error: 'bad_request' })
  const id = uuidv4()
  const tmpDir = path.join(UPLOAD_DIR, 'tmp', id)
  fs.mkdirSync(tmpDir, { recursive: true })
  log('[UPLOAD] init', 'user=' + req.user.id, 'upload=' + id, 'name=' + filename, 'size=' + size)
  res.json({ uploadId: id })
})

app.post('/api/upload/chunk', auth, upload.single('chunk'), (req, res) => {
  const { uploadId, index } = req.body || {}
  if (!uploadId || typeof index === 'undefined') return res.status(400).json({ error: 'bad_request' })
  const tmpDir = path.join(UPLOAD_DIR, 'tmp', uploadId)
  if (!fs.existsSync(tmpDir)) return res.status(400).json({ error: 'no_session' })
  const chunkPath = path.join(tmpDir, `chunk_${index}`)
  fs.writeFileSync(chunkPath, req.file.buffer)
  log('[UPLOAD] chunk', 'user=' + req.user.id, 'upload=' + uploadId, 'index=' + index, 'bytes=' + (req.file?.buffer?.length || 0))
  res.json({ ok: true })
})

app.post('/api/upload/complete', auth, (req, res) => {
  const { uploadId, filename, mime } = req.body || {}
  if (!uploadId || !filename) return res.status(400).json({ error: 'bad_request' })
  const tmpDir = path.join(UPLOAD_DIR, 'tmp', uploadId)
  if (!fs.existsSync(tmpDir)) return res.status(400).json({ error: 'no_session' })
  const chunks = fs
    .readdirSync(tmpDir)
    .filter((n) => n.startsWith('chunk_'))
    .sort((a, b) => parseInt(a.split('_')[1], 10) - parseInt(b.split('_')[1], 10))
  if (!chunks.length) return res.status(400).json({ error: 'no_chunks' })

  const safeName = filename.replace(/[^a-zA-Z0-9_.-]/g, '_')
  const finalId = uuidv4()
  const finalPath = path.join(UPLOAD_DIR, `${finalId}_${safeName}`)
  const { cipher, iv } = createFileCipher()
  let authTagBase64 = ''
  let plaintextSize = 0
  let fd
  try {
    fd = fs.openSync(finalPath, 'w')
    for (const chunkName of chunks) {
      const chunkPath = path.join(tmpDir, chunkName)
      const data = fs.readFileSync(chunkPath)
      plaintextSize += data.length
      const encryptedPart = cipher.update(data)
      if (encryptedPart.length) fs.writeSync(fd, encryptedPart)
    }
    const finalEncrypted = cipher.final()
    if (finalEncrypted.length) fs.writeSync(fd, finalEncrypted)
    authTagBase64 = cipher.getAuthTag().toString('base64')
  } catch (err) {
    warn('[UPLOAD] encryption failed', err.message)
    try {
      if (fd) fs.closeSync(fd)
    } catch (_) {}
    try { fs.unlinkSync(finalPath) } catch (_) {}
    fs.rmSync(tmpDir, { recursive: true, force: true })
    return res.status(500).json({ error: 'merge_failed' })
  } finally {
    try {
      if (fd) fs.closeSync(fd)
    } catch (_) {}
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }

  db.prepare('INSERT INTO files (id,uploader_id,original_name,mime,size,path,created_at,iv,auth_tag) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(finalId, req.user.id, filename, mime || '', plaintextSize, finalPath, Date.now(), iv.toString('base64'), authTagBase64)
  log('[UPLOAD] complete', 'user=' + req.user.id, 'upload=' + uploadId, 'file=' + finalId, 'name=' + filename, 'size=' + plaintextSize)
  res.json({ file: { id: finalId, name: filename, mime: mime || '', size: plaintextSize } })
})

app.get('/api/files/:id/meta', auth, (req, res) => {
  const file = db.prepare('SELECT * FROM files WHERE id=?').get(req.params.id)
  if (!file) return res.status(404).json({ error: 'not_found' })
  log('[FILES] meta', 'user=' + req.user.id, 'file=' + req.params.id)
  res.json({ file: fileMeta(file) })
})

app.get('/api/files/:id', auth, (req, res) => {
  const file = db.prepare('SELECT * FROM files WHERE id=?').get(req.params.id)
  if (!file) return res.status(404).json({ error: 'not_found' })
  if (!file.path || !fs.existsSync(file.path)) return res.status(404).json({ error: 'missing_file' })
  log('[FILES] download', 'user=' + req.user.id, 'file=' + req.params.id, 'name=' + file.original_name)
  res.setHeader('Content-Type', file.mime || 'application/octet-stream')
  res.setHeader('Content-Disposition', `attachment; filename="${file.original_name}"`)
  if (typeof file.size === 'number' && Number.isFinite(file.size)) res.setHeader('Content-Length', file.size)
  pipeFileToResponse(file, res)
})

app.get('/api/files/:id/view', auth, (req, res) => {
  const file = db.prepare('SELECT * FROM files WHERE id=?').get(req.params.id)
  if (!file) return res.status(404).json({ error: 'not_found' })
  if (!file.path || !fs.existsSync(file.path)) return res.status(404).json({ error: 'missing_file' })
  log('[FILES] inline', 'user=' + req.user.id, 'file=' + req.params.id, 'name=' + file.original_name)
  res.setHeader('Content-Type', file.mime || 'application/octet-stream')
  res.setHeader('Content-Disposition', `inline; filename="${file.original_name}"`)
  if (typeof file.size === 'number' && Number.isFinite(file.size)) res.setHeader('Content-Length', file.size)
  pipeFileToResponse(file, res)
})

app.delete('/api/messages/:id', auth, (req, res) => {
  const message = findMessageById.get(req.params.id)
  if (!message) return res.status(404).json({ error: 'not_found' })
  let isChannelOwner = false
  if (!message.channel_id.startsWith('dm:')) {
    const channel = selectChannelByIdStmt.get(message.channel_id)
    if (channel?.created_by && channel.created_by === req.user.id) isChannelOwner = true
  }
  if (message.sender_id !== req.user.id && req.user.role !== 'admin' && !isChannelOwner)
    return res.status(403).json({ error: 'forbidden' })
  deleteMessageStmt.run(message.id)
  io.to(message.channel_id).emit('message:deleted', { id: message.id, channelId: message.channel_id })
  if (message.channel_id.startsWith('dm:')) {
    const participants = parseDirectChannelId(message.channel_id)
    if (participants) {
      const room = io.sockets.adapter.rooms.get(message.channel_id) || new Set()
      ;[participants.first, participants.second].forEach((participantId) => {
        const sid = onlineUsers.get(participantId)
        if (!sid || room.has(sid)) return
        io.to(sid).emit('message:deleted', { id: message.id, channelId: message.channel_id })
      })
    }
  }
  log('[MESSAGE] delete', 'user=' + req.user.id, 'message=' + message.id, 'channel=' + message.channel_id)
  res.json({ ok: true })
})

app.patch('/api/messages/:id', auth, (req, res) => {
  const rawContent = typeof req.body?.content === 'string' ? req.body.content.trim() : ''
  if (!rawContent) return res.status(400).json({ error: 'content_required' })
  const message = selectMessageFullById.get(req.params.id)
  if (!message) return res.status(404).json({ error: 'not_found' })
  let isChannelOwner = false
  if (!message.channel_id.startsWith('dm:')) {
    const channel = selectChannelByIdStmt.get(message.channel_id)
    if (channel?.created_by && channel.created_by === req.user.id) isChannelOwner = true
  }
  if (message.sender_id !== req.user.id && req.user.role !== 'admin' && !isChannelOwner)
    return res.status(403).json({ error: 'forbidden' })

  const updatedAtRaw = Date.now()
  if (hasMessageUpdatedAtColumn) {
    updateMessageContentStmt.run(encryptText(rawContent), updatedAtRaw, message.id)
  } else {
    updateMessageContentStmt.run(encryptText(rawContent), message.id)
  }
  const updatedAt = hasMessageUpdatedAtColumn ? updatedAtRaw : 0


  updateMessageContentStmt.run(encryptText(rawContent), updatedAt, message.id)

  const payload = {
    id: message.id,
    channelId: message.channel_id,
    senderId: message.sender_id,
    content: rawContent,
    createdAt: message.created_at,
    updatedAt,
  }
  io.to(message.channel_id).emit('message:updated', payload)
  if (message.channel_id.startsWith('dm:')) {
    const participants = parseDirectChannelId(message.channel_id)
    if (participants) {
      const room = io.sockets.adapter.rooms.get(message.channel_id) || new Set()
      ;[participants.first, participants.second].forEach((participantId) => {
        const sid = onlineUsers.get(participantId)
        if (!sid || room.has(sid)) return
        io.to(sid).emit('message:updated', payload)
      })
    }
  }
  log('[MESSAGE] update', 'user=' + req.user.id, 'message=' + message.id, 'channel=' + message.channel_id)
  res.json({ message: payload })
})

const onlineUsers = new Map()
const listMessages = db.prepare('SELECT * FROM messages WHERE channel_id=? ORDER BY created_at DESC LIMIT ? OFFSET ?')

const insertMessage = hasMessageUpdatedAtColumn
  ? db.prepare('INSERT INTO messages (id,channel_id,sender_id,content,created_at,updated_at) VALUES (?,?,?,?,?,0)')
  : db.prepare('INSERT INTO messages (id,channel_id,sender_id,content,created_at) VALUES (?,?,?,?,?)')



const voiceParticipants = new Map()
const typingState = new Map()

const getVoiceRoomState = (roomId) => {
  const participants = voiceParticipants.get(roomId) || new Map()
  return Array.from(participants.values()).map((entry) => ({
    socketId: entry.socketId,
    userId: entry.userId,
    username: entry.username,
  }))
}

const formatVoiceRoom = (room) => ({
  id: room.id,
  name: room.name,
  createdAt: room.created_at,
  createdBy: room.created_by || '',
  participantCount: voiceParticipants.get(room.id)?.size || 0,
})

const emitVoiceRoomsUpdate = () => {
  cachedVoiceRooms = listVoiceRoomsStmt.all()
  io.emit('voice:rooms:update', { rooms: cachedVoiceRooms.map(formatVoiceRoom) })
}

const generateInviteCode = (length = INVITE_CODE_LENGTH) => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.randomBytes(length)
  let code = ''
  for (let i = 0; i < length; i += 1) {
    code += alphabet[bytes[i] % alphabet.length]
  }
  return code
}

const generateClaimToken = () =>
  crypto
    .randomBytes(24)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')

const getInviteStatus = (invite) => {
  const now = Date.now()
  if (invite.used_by) return 'used'
  if (invite.revoked_at) return 'revoked'
  if (invite.expires_at && invite.expires_at < now) return 'expired'
  if (invite.claim_token) return 'claimed'
  return 'active'
}

const formatInvite = (invite) => ({
  id: invite.id,
  code: invite.code,
  createdAt: invite.created_at,
  expiresAt: invite.expires_at,
  createdBy: invite.created_by,
  claimedAt: invite.claimed_at || 0,
  usedAt: invite.used_at || 0,
  usedBy: invite.used_by || '',
  revokedAt: invite.revoked_at || 0,
  status: getInviteStatus(invite),
})

const broadcastVoiceState = (roomId) => {
  const state = getVoiceRoomState(roomId)
  io.emit('voice:state', { roomId, participants: state })
}

const leaveVoiceRoom = (socket, { silent } = {}) => {
  const roomId = socket.voiceRoomId
  if (!roomId) return
  const participants = voiceParticipants.get(roomId)
  if (participants) {
    participants.delete(socket.id)
    if (!participants.size) voiceParticipants.delete(roomId)
  }
  socket.leave(`voice:${roomId}`)
  socket.voiceRoomId = null
  if (!silent) {
    socket.to(`voice:${roomId}`).emit('voice:user-left', {
      roomId,
      socketId: socket.id,
      userId: socket.user.id,
      username: socket.user.username,
    })
  }
  broadcastVoiceState(roomId)
}

io.use((socket, next) => {
  const token = socket.handshake.auth?.token
  if (!token) return next(new Error('no_token'))
  try {
    socket.user = jwt.verify(token, JWT_SECRET)
    log('[SOCKET] handshake', 'user=' + (socket.user.username || socket.user.id))
    next()
  } catch (e) {
    warn('[SOCKET] invalid token', e.message)
    next(new Error('invalid_token'))
  }
})

io.on('connection', (socket) => {
  const userId = socket.user.id
  const loadUser = () => selectUserById.get(userId)
  let userRecord = loadUser()
  if (!userRecord) {
    socket.emit('auth:error', { error: 'user_not_found' })
    socket.disconnect(true)
    return
  }
  socket.user.username = userRecord.username
  socket.user.role = userRecord.role
  onlineUsers.set(userId, socket.id)
  io.emit('presence:update', { onlineUserIds: Array.from(onlineUsers.keys()) })
  log('[SOCKET] connected', 'user=' + userId, 'socket=' + socket.id)

  const wsId = defaultWs.id

  const leaveMessageRooms = () => {
    for (const room of socket.rooms) {
      if (room === socket.id) continue
      if (room.startsWith('voice:')) continue
      socket.leave(room)
    }
  }

  const joinVoiceRoom = (roomId) => {
    if (!roomId) return
    const room = selectVoiceRoomStmt.get(roomId)
    if (!room) {
      socket.emit('voice:error', { error: 'not_found' })
      return
    }
    if (socket.voiceRoomId === roomId) return
    if (socket.voiceRoomId) leaveVoiceRoom(socket)
    let participants = voiceParticipants.get(roomId)
    if (!participants) {
      participants = new Map()
      voiceParticipants.set(roomId, participants)
    }
    const initialState = getVoiceRoomState(roomId)
    socket.join(`voice:${roomId}`)
    socket.voiceRoomId = roomId
    const participant = {
      socketId: socket.id,
      userId: socket.user.id,
      username: socket.user.username,
    }
    participants.set(socket.id, participant)
    socket.emit('voice:participants', { roomId, participants: initialState })
    socket.emit('voice:joined', { roomId, participant })
    socket.to(`voice:${roomId}`).emit('voice:user-joined', { roomId, participant })
    broadcastVoiceState(roomId)
  }

  let currentChannelId = null

  const ensureChannelJoined = (channelId) => {
    if (!channelId) {
      leaveMessageRooms()
      currentChannelId = null
      return
    }
    leaveMessageRooms()
    socket.join(channelId)
    currentChannelId = channelId
  }

  const typingKeyFor = (channelId) => `${channelId}:${userId}`

  const sendTypingUpdate = (channelId, typing) => {
    const latestUser = loadUser() || userRecord
    const payload = {
      channelId,
      userId,
      username: latestUser?.username || socket.user.username || 'user',
      typing: Boolean(typing),
    }
    socket.to(channelId).emit('typing:update', payload)
    if (channelId.startsWith('dm:')) {
      const participants = parseDirectChannelId(channelId)
      if (participants) {
        const room = io.sockets.adapter.rooms.get(channelId) || new Set()
        ;[participants.first, participants.second].forEach((participantId) => {
          if (participantId === userId) return
          const sid = onlineUsers.get(participantId)
          if (!sid || room.has(sid)) return
          io.to(sid).emit('typing:update', payload)
        })
      }
    }
  }

  const clearTypingForChannel = (channelId) => {
    if (!channelId) return
    const key = typingKeyFor(channelId)
    if (typingState.has(key)) {
      typingState.delete(key)
      sendTypingUpdate(channelId, false)
    }
  }

  const accessibleChannels = getAccessibleChannelsForUser(userRecord)
  currentChannelId = accessibleChannels[0]?.id || null
  if (currentChannelId) socket.join(currentChannelId)

  socket.on('init:request', ({ limit = 50, offset = 0 } = {}) => {
    userRecord = loadUser() || userRecord
    log('[SOCKET] init:request', 'user=' + userId, 'limit=' + limit, 'offset=' + offset)
    const channels = getAccessibleChannelsForUser(userRecord)
    if (!channels.some((channel) => channel.id === currentChannelId)) {
      currentChannelId = channels[0]?.id || null
      if (currentChannelId) ensureChannelJoined(currentChannelId)
      else leaveMessageRooms()
    }
    const messages = currentChannelId ? decryptMessages(listMessages.all(currentChannelId, limit, offset)).reverse() : []
    socket.emit('init:response', { workspaces: [{ id: wsId, name: 'Home' }], channels, activeChannelId: currentChannelId, messages })
  })

  socket.on('channel:switch', ({ channelId }) => {
    if (!channelId) return
    log('[SOCKET] channel:switch', 'user=' + userId, 'channel=' + channelId)
    clearTypingForChannel(currentChannelId)
    if (channelId.startsWith('dm:')) {
      if (!isMemberOfDirectChannel(channelId, userId)) return
      const normalized = normalizeDirectChannelId(channelId)
      if (!normalized) return
      ensureChannelJoined(normalized)
      const msgs = decryptMessages(listMessages.all(normalized, 50, 0)).reverse()
      socket.emit('channel:opened', { channelId: normalized, messages: msgs })
      return
    }
    userRecord = loadUser() || userRecord
    const access = resolveChannelAccess(userRecord, channelId)
    if (!access.allowed) return
    ensureChannelJoined(channelId)
    const msgs = decryptMessages(listMessages.all(channelId, 50, 0)).reverse()
    socket.emit('channel:opened', { channelId, messages: msgs })
  })

  socket.on('message:send', ({ channelId, content }) => {
    if (!channelId || !content) return
    let targetChannel = channelId
    let directParticipants = null
    if (channelId.startsWith('dm:')) {
      if (!isMemberOfDirectChannel(channelId, userId)) return
      const normalized = normalizeDirectChannelId(channelId)
      if (!normalized) return
      targetChannel = normalized
      const parsed = parseDirectChannelId(channelId)
      directParticipants = parsed ? [parsed.first, parsed.second] : null
    } else {
      userRecord = loadUser() || userRecord
      const access = resolveChannelAccess(userRecord, channelId)
      if (!access.allowed) return
      targetChannel = channelId
    }
    const id = uuidv4()
    const now = Date.now()
    const encryptedContent = encryptText(content)
    insertMessage.run(id, targetChannel, userId, encryptedContent, now)
    const payload = { id, channelId: targetChannel, senderId: userId, content, createdAt: now, updatedAt: 0 }
    io.to(targetChannel).emit('message:new', payload)
    log('[MESSAGE] send', 'user=' + userId, 'channel=' + targetChannel, 'bytes=' + Buffer.byteLength(content, 'utf8'))
    if (directParticipants) {
      const room = io.sockets.adapter.rooms.get(targetChannel) || new Set()
      directParticipants.forEach((participantId) => {
        if (participantId === userId) return
        const sid = onlineUsers.get(participantId)
        if (!sid || room.has(sid)) return
        io.to(sid).emit('message:new', payload)
      })
    }
    clearTypingForChannel(targetChannel)
  })

  socket.on('messages:load', ({ channelId, limit = 50, offset = 0 }) => {
    if (!channelId) return
    log('[SOCKET] messages:load', 'user=' + userId, 'channel=' + channelId, 'limit=' + limit, 'offset=' + offset)
    let targetChannel = channelId
    if (channelId.startsWith('dm:')) {
      if (!isMemberOfDirectChannel(channelId, userId)) return
      const normalized = normalizeDirectChannelId(channelId)
      if (!normalized) return
      targetChannel = normalized
    } else {
      userRecord = loadUser() || userRecord
      const access = resolveChannelAccess(userRecord, channelId)
      if (!access.allowed) return
      targetChannel = channelId
    }
    const msgs = decryptMessages(listMessages.all(targetChannel, limit, offset)).reverse()
    socket.emit('messages:page', { channelId: targetChannel, messages: msgs, offset, limit })
  })

  socket.on('typing', ({ channelId, state }) => {
    if (!channelId) return
    let targetChannel = channelId
    if (channelId.startsWith('dm:')) {
      if (!isMemberOfDirectChannel(channelId, userId)) return
      const normalized = normalizeDirectChannelId(channelId)
      if (!normalized) return
      targetChannel = normalized
    } else {
      userRecord = loadUser() || userRecord
      const access = resolveChannelAccess(userRecord, channelId)
      if (!access.allowed) return
      targetChannel = channelId
    }
    const key = typingKeyFor(targetChannel)
    if (state) {
      typingState.set(key, Date.now())
      sendTypingUpdate(targetChannel, true)
    } else if (typingState.has(key)) {
      typingState.delete(key)
      sendTypingUpdate(targetChannel, false)
    }
  })

  socket.on('disconnect', () => {
    leaveVoiceRoom(socket)
    onlineUsers.delete(userId)
    const keysToClear = []
    typingState.forEach((_, key) => {
      if (key.endsWith(`:${userId}`)) keysToClear.push(key)
    })
    keysToClear.forEach((key) => {
      typingState.delete(key)
      const channelId = key.slice(0, key.lastIndexOf(':'))
      if (channelId) sendTypingUpdate(channelId, false)
    })
    io.emit('presence:update', { onlineUserIds: Array.from(onlineUsers.keys()) })
    log('[SOCKET] disconnected', 'user=' + userId, 'socket=' + socket.id)
  })

  socket.on('voice:join', ({ roomId }) => joinVoiceRoom(roomId))
  socket.on('voice:leave', () => leaveVoiceRoom(socket))
  socket.on('voice:signal', ({ targetId, data }) => {
    if (!targetId || !data) return
    const targetSocket = io.sockets.sockets.get(targetId)
    if (!targetSocket) return
    targetSocket.emit('voice:signal', { from: socket.id, data })
  })

  emitChannelListForUser(userId)
})

process.on('unhandledRejection', (reason) => {
  logError('Unhandled rejection', reason)
})

server.listen(PORT, () => log('Server listening on', PORT))



