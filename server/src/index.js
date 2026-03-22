import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import http from 'http'
import { Server } from 'socket.io'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import webpush from 'web-push'
import fs from 'fs'
import path from 'path'
import multer from 'multer'
import crypto from 'crypto'
import { Transform } from 'stream'


const app = express()
const server = http.createServer(app)
const normalizeOriginValue = (value) => {
  if (!value || typeof value !== 'string') return ''
  const cleaned = value.trim().replace(/^['"]|['"]$/g, '').replace(/\/+$/, '')
  if (!cleaned) return ''
  return cleaned
}

const origins = process.env.ORIGIN
  ? process.env.ORIGIN
      .split(',')
      .map((s) => normalizeOriginValue(s))
      .filter(Boolean)
  : ['*']
const io = new Server(server, {
  cors: { origin: origins, methods: ['GET', 'POST', 'DELETE'] },
  maxHttpBufferSize: 10 * 1024 * 1024,
})


const timestamp = () => new Date().toISOString()
const log = (...args) => console.log(timestamp(), ...args)
const warn = (...args) => console.warn(timestamp(), ...args)
const logError = (...args) => console.error(timestamp(), ...args)

const emitToUser = (userId, event, payload = {}) => {
  if (!userId) return
  const socketId = onlineUsers.get(userId)
  if (!socketId) return
  io.to(socketId).emit(event, payload)
}

const resolveEncryptionKey = () => {
  const raw = process.env.ENCRYPTION_KEY || ''
  if (!raw) {
    warn('[ENCRYPTION] ENCRYPTION_KEY is not set; using ephemeral process key (legacy message layer only)')
    return crypto.randomBytes(32)
  }
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
const PUSH_BATCH_WINDOW_MS = Math.max(2000, parseInt(process.env.PUSH_BATCH_WINDOW_MS || '', 10) || 7000)
const VAPID_PUBLIC_KEY = (process.env.WEB_PUSH_VAPID_PUBLIC_KEY || '').trim()
const VAPID_PRIVATE_KEY = (process.env.WEB_PUSH_VAPID_PRIVATE_KEY || '').trim()
const VAPID_SUBJECT = (process.env.WEB_PUSH_VAPID_SUBJECT || 'mailto:admin@example.com').trim()
const PUSH_ENABLED = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT)

if (PUSH_ENABLED) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
    log('[PUSH] web push enabled')
  } catch (err) {
    logError('[PUSH] vapid setup failed', err?.message || err)
  }
} else {
  warn('[PUSH] disabled: missing WEB_PUSH_VAPID_PUBLIC_KEY / WEB_PUSH_VAPID_PRIVATE_KEY / WEB_PUSH_VAPID_SUBJECT')
}

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

const encryptBuffer = (buffer) => {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', DATA_ENCRYPTION_KEY, iv)
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted])
}

const decryptBuffer = (payload) => {
  if (!payload || payload.length <= 28) return payload
  const iv = payload.subarray(0, 12)
  const tag = payload.subarray(12, 28)
  const ciphertext = payload.subarray(28)
  const decipher = crypto.createDecipheriv('aes-256-gcm', DATA_ENCRYPTION_KEY, iv)
  decipher.setAuthTag(tag)
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return decrypted
}

const ENCRYPTED_MEDIA_IV_LENGTH = 12
const ENCRYPTED_MEDIA_TAG_LENGTH = 16

const encryptChunksToFile = (chunkPaths, outputPath) => {
  const iv = crypto.randomBytes(ENCRYPTED_MEDIA_IV_LENGTH)
  const cipher = crypto.createCipheriv('aes-256-gcm', DATA_ENCRYPTION_KEY, iv)
  const handle = fs.openSync(outputPath, 'w')
  try {
    fs.writeFileSync(handle, iv)
    for (const chunkPath of chunkPaths) {
      const chunkBuffer = fs.readFileSync(chunkPath)
      const encryptedChunk = cipher.update(chunkBuffer)
      if (encryptedChunk.length) fs.writeFileSync(handle, encryptedChunk)
    }
    const finalChunk = cipher.final()
    if (finalChunk.length) fs.writeFileSync(handle, finalChunk)
    fs.writeFileSync(handle, cipher.getAuthTag())
  } finally {
    fs.closeSync(handle)
  }
}

class DecryptTailTransform extends Transform {
  constructor(iv) {
    super()
    this.decipher = crypto.createDecipheriv('aes-256-gcm', DATA_ENCRYPTION_KEY, iv)
    this.tail = Buffer.alloc(0)
  }

  _transform(chunk, _encoding, callback) {
    try {
      const combined = this.tail.length ? Buffer.concat([this.tail, chunk]) : chunk
      if (combined.length <= ENCRYPTED_MEDIA_TAG_LENGTH) {
        this.tail = combined
        callback()
        return
      }
      const body = combined.subarray(0, combined.length - ENCRYPTED_MEDIA_TAG_LENGTH)
      this.tail = combined.subarray(combined.length - ENCRYPTED_MEDIA_TAG_LENGTH)
      const decrypted = this.decipher.update(body)
      if (decrypted.length) this.push(decrypted)
      callback()
    } catch (err) {
      callback(err)
    }
  }

  _flush(callback) {
    try {
      if (this.tail.length !== ENCRYPTED_MEDIA_TAG_LENGTH) {
        callback(new Error('invalid_encrypted_media'))
        return
      }
      this.decipher.setAuthTag(this.tail)
      const finalChunk = this.decipher.final()
      if (finalChunk.length) this.push(finalChunk)
      callback()
    } catch (err) {
      callback(err)
    }
  }
}

const createEncryptedMediaReadStream = (filePath) => {
  const stats = fs.statSync(filePath)
  const minimumSize = ENCRYPTED_MEDIA_IV_LENGTH + ENCRYPTED_MEDIA_TAG_LENGTH
  if (stats.size <= minimumSize) throw new Error('invalid_encrypted_media')
  const handle = fs.openSync(filePath, 'r')
  const iv = Buffer.alloc(ENCRYPTED_MEDIA_IV_LENGTH)
  try {
    fs.readSync(handle, iv, 0, ENCRYPTED_MEDIA_IV_LENGTH, 0)
  } finally {
    fs.closeSync(handle)
  }
  return fs.createReadStream(filePath, { start: ENCRYPTED_MEDIA_IV_LENGTH }).pipe(new DecryptTailTransform(iv))
}



const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || origin === 'null') return callback(null, true)
    if (origins.includes('*')) return callback(null, true)
    const normalizedIncoming = normalizeOriginValue(origin)
    if (origins.includes(normalizedIncoming)) return callback(null, true)
    warn('[CORS] blocked', 'origin=' + origin, 'allowed=' + origins.join(','))
    return callback(null, false)
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Authorization',
    'Content-Type',
    'ngrok-skip-browser-warning',
    'X-Requested-With',
  ],
}

app.use(cors(corsOptions))
app.options('*', cors(corsOptions))
app.use(express.json({ limit: '5mb' }))

app.use((req, res, next) => {
  const start = Date.now()
  const remoteAddress = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown'
  const requestOrigin = req.headers.origin || '-'
  const userAgent = req.headers['user-agent'] || '-'
  log('[HTTP]', req.method, req.originalUrl, 'from=' + remoteAddress, 'origin=' + requestOrigin, 'ua=' + userAgent)
  res.on('finish', () => {
    log('[HTTP:done]', req.method, req.originalUrl, 'status=' + res.statusCode, (Date.now() - start) + 'ms')
  })
  next()
})

const PORT = process.env.PORT || 4000
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads'
const AVATAR_DIR = path.join(UPLOAD_DIR, 'avatars')
const CHANNEL_AVATAR_DIR = path.join(AVATAR_DIR, 'channels')
const MEDIA_DIR = path.join(UPLOAD_DIR, 'media')

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })
if (!fs.existsSync(AVATAR_DIR)) fs.mkdirSync(AVATAR_DIR, { recursive: true })
if (!fs.existsSync(CHANNEL_AVATAR_DIR)) fs.mkdirSync(CHANNEL_AVATAR_DIR, { recursive: true })
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true })
const CHUNKS_DIR = path.join(MEDIA_DIR, 'chunks')
if (!fs.existsSync(CHUNKS_DIR)) fs.mkdirSync(CHUNKS_DIR, { recursive: true })
const UPLOADS_ROOT = path.resolve(UPLOAD_DIR)

const db = new Database('messenger_e2e.db')
db.pragma('journal_mode = WAL')

// ensure media_files table for encrypted media storage
db.exec(`
CREATE TABLE IF NOT EXISTS media_files (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  owner_id TEXT DEFAULT '',
  data BLOB NOT NULL,
  uploaded_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS media_stream_files (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  owner_id TEXT DEFAULT '',
  storage_path TEXT NOT NULL,
  uploaded_at INTEGER NOT NULL
);
`)
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
  public_key TEXT DEFAULT '',
  avatar_seed TEXT DEFAULT '',
  display_name TEXT DEFAULT '',
  name_style TEXT DEFAULT '',
  profile_status TEXT DEFAULT '',
  profile_background TEXT DEFAULT '',
  user_status TEXT DEFAULT 'online'
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
  created_by TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  avatar_updated_at INTEGER DEFAULT 0,
  avatar_mime TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER DEFAULT 0,
  reply_to TEXT REFERENCES messages(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS channel_members (
  channel_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  PRIMARY KEY (channel_id, user_id)
);
CREATE TABLE IF NOT EXISTS friends (
  user_id TEXT NOT NULL,
  friend_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, friend_id)
);
CREATE TABLE IF NOT EXISTS friend_requests (
  id TEXT PRIMARY KEY,
  from_user_id TEXT NOT NULL,
  to_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS channel_keys (
  channel_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  wrapped_key TEXT NOT NULL,
  nonce TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  key_version INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (channel_id, user_id)
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
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  subscription_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  device_name TEXT NOT NULL,
  device_type TEXT NOT NULL,
  user_agent TEXT DEFAULT '',
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  ip_address TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  socket_id TEXT DEFAULT '',
  access_token TEXT DEFAULT '',
  created_at INTEGER NOT NULL,
  last_activity_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  terminated_at INTEGER,
  terminated_reason TEXT DEFAULT '',
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);
`)

ensureColumn('users', 'avatar_seed', 'TEXT DEFAULT ""')
ensureColumn('users', 'avatar_url', 'TEXT DEFAULT ""')
ensureColumn('users', 'avatar_updated_at', 'INTEGER DEFAULT 0')
ensureColumn('users', 'avatar_mime', 'TEXT DEFAULT ""')
ensureColumn('users', 'public_key', 'TEXT DEFAULT ""')
ensureColumn('users', 'display_name', 'TEXT DEFAULT ""')
ensureColumn('users', 'name_style', 'TEXT DEFAULT ""')
ensureColumn('users', 'profile_status', 'TEXT DEFAULT ""')
ensureColumn('users', 'profile_background', 'TEXT DEFAULT ""')
ensureColumn('users', 'user_status', 'TEXT DEFAULT "online"')

if (tableHasColumn('users', 'user_status')) {
  db.prepare("UPDATE users SET user_status = 'online' WHERE user_status IS NULL OR user_status = ''").run()
}
ensureColumn('invites', 'claim_token', 'TEXT DEFAULT ""')
ensureColumn('invites', 'claimed_at', 'INTEGER')
ensureColumn('invites', 'used_by', 'TEXT')
ensureColumn('invites', 'used_at', 'INTEGER')
ensureColumn('invites', 'revoked_at', 'INTEGER')
ensureColumn('channels', 'is_private', 'INTEGER NOT NULL DEFAULT 0')
ensureColumn('channels', 'created_by', 'TEXT DEFAULT ""')
ensureColumn('channels', 'avatar_url', 'TEXT DEFAULT ""')
ensureColumn('channels', 'avatar_updated_at', 'INTEGER DEFAULT 0')
ensureColumn('channels', 'avatar_mime', 'TEXT DEFAULT ""')
ensureColumn('messages', 'updated_at', 'INTEGER DEFAULT 0')
ensureColumn('messages', 'reply_to', 'TEXT REFERENCES messages(id) ON DELETE SET NULL')

const hasMessageUpdatedAtColumn = tableHasColumn('messages', 'updated_at')
const hasMessageReplyColumn = tableHasColumn('messages', 'reply_to')

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
  db.prepare('ALTER TABLE channels ADD COLUMN avatar_url TEXT DEFAULT ""').run()
} catch (err) {}
try {
  db.prepare('ALTER TABLE channels ADD COLUMN avatar_updated_at INTEGER DEFAULT 0').run()
} catch (err) {}
try {
  db.prepare('ALTER TABLE channels ADD COLUMN avatar_mime TEXT DEFAULT ""').run()
} catch (err) {}
try {
  db.prepare('ALTER TABLE messages ADD COLUMN updated_at INTEGER DEFAULT 0').run()
} catch (err) {}
try {
  db.prepare('ALTER TABLE messages ADD COLUMN reply_to TEXT REFERENCES messages(id) ON DELETE SET NULL').run()
} catch (err) {}

// Ensure columns for devices and sessions tables
ensureColumn('devices', 'id', 'TEXT PRIMARY KEY')
ensureColumn('devices', 'user_id', 'TEXT NOT NULL')
ensureColumn('devices', 'device_name', 'TEXT NOT NULL')
ensureColumn('devices', 'device_type', 'TEXT NOT NULL')
ensureColumn('devices', 'user_agent', 'TEXT DEFAULT ""')
ensureColumn('devices', 'created_at', 'INTEGER NOT NULL')
ensureColumn('devices', 'last_seen_at', 'INTEGER NOT NULL')
ensureColumn('devices', 'ip_address', 'TEXT DEFAULT ""')

ensureColumn('sessions', 'id', 'TEXT PRIMARY KEY')
ensureColumn('sessions', 'device_id', 'TEXT NOT NULL')
ensureColumn('sessions', 'user_id', 'TEXT NOT NULL')
ensureColumn('sessions', 'socket_id', 'TEXT DEFAULT ""')
ensureColumn('sessions', 'access_token', 'TEXT DEFAULT ""')
ensureColumn('sessions', 'created_at', 'INTEGER NOT NULL')
ensureColumn('sessions', 'last_activity_at', 'INTEGER NOT NULL')
ensureColumn('sessions', 'expires_at', 'INTEGER NOT NULL')
ensureColumn('sessions', 'terminated_at', 'INTEGER')
ensureColumn('sessions', 'terminated_reason', 'TEXT DEFAULT ""')

// Create indices for better performance
try {
  db.prepare('CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id)').run()
  db.prepare('CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)').run()
  db.prepare('CREATE INDEX IF NOT EXISTS idx_sessions_device_id ON sessions(device_id)').run()
} catch (err) {}

db.prepare('UPDATE users SET avatar_seed = COALESCE(avatar_seed, substr(username,1,2))').run()

const selectUserById = db.prepare('SELECT * FROM users WHERE id=?')
const selectUserByUsername = db.prepare('SELECT * FROM users WHERE username=?')
const updateAvatarInfoStmt = db.prepare('UPDATE users SET avatar_url=?, avatar_updated_at=?, avatar_mime=? WHERE id=?')
const updatePublicKeyStmt = db.prepare('UPDATE users SET public_key=? WHERE id=?')
const updatePasswordStmt = db.prepare('UPDATE users SET password_hash=? WHERE id=?')
const updateUserRoleStmt = db.prepare('UPDATE users SET role=? WHERE id=?')
const updateNameStyleStmt = db.prepare('UPDATE users SET name_style=? WHERE id=?')
const updateDisplayNameStmt = db.prepare('UPDATE users SET display_name=? WHERE id=?')
const updateProfileStatusStmt = db.prepare('UPDATE users SET profile_status=? WHERE id=?')
const updateProfileBackgroundStmt = db.prepare('UPDATE users SET profile_background=? WHERE id=?')
const updateUserStatusStmt = db.prepare('UPDATE users SET user_status=? WHERE id=?')
const countAdminsStmt = db.prepare("SELECT COUNT(*) as count FROM users WHERE role='admin'")
const listFriendsStmt = db.prepare(
  `SELECT u.* FROM friends f
   JOIN users u ON u.id = f.friend_id
   WHERE f.user_id = ?
   ORDER BY u.username COLLATE NOCASE ASC`
)
const listIncomingFriendRequestsStmt = db.prepare(
  `SELECT fr.id AS request_id, fr.created_at, u.*
   FROM friend_requests fr
   JOIN users u ON u.id = fr.from_user_id
   WHERE fr.to_user_id = ?
   ORDER BY fr.created_at DESC`
)
const listOutgoingFriendRequestsStmt = db.prepare(
  `SELECT fr.id AS request_id, fr.created_at, u.*
   FROM friend_requests fr
   JOIN users u ON u.id = fr.to_user_id
   WHERE fr.from_user_id = ?
   ORDER BY fr.created_at DESC`
)
const selectFriendshipStmt = db.prepare('SELECT 1 FROM friends WHERE user_id=? AND friend_id=?')
const insertFriendStmt = db.prepare('INSERT OR IGNORE INTO friends (user_id, friend_id, created_at) VALUES (?,?,?)')
const deleteFriendStmt = db.prepare('DELETE FROM friends WHERE user_id=? AND friend_id=?')
const insertFriendRequestStmt = db.prepare(
  'INSERT INTO friend_requests (id, from_user_id, to_user_id, created_at) VALUES (?,?,?,?)'
)
const selectFriendRequestBetweenStmt = db.prepare(
  'SELECT * FROM friend_requests WHERE from_user_id=? AND to_user_id=?'
)
const selectFriendRequestByIdStmt = db.prepare('SELECT * FROM friend_requests WHERE id=?')
const deleteFriendRequestByIdStmt = db.prepare('DELETE FROM friend_requests WHERE id=?')
const insertInviteStmt = db.prepare(
  'INSERT INTO invites (id, code, created_by, created_at, expires_at, claim_token, claimed_at, used_by, used_at, revoked_at) VALUES (?,?,?,?,?, ?, NULL, NULL, NULL, NULL)'
)
const selectInviteByCodeStmt = db.prepare('SELECT * FROM invites WHERE code=?')
const selectInviteByIdStmt = db.prepare('SELECT * FROM invites WHERE id=?')
const listInvitesByCreatorStmt = db.prepare('SELECT * FROM invites WHERE created_by=? ORDER BY created_at DESC')
const updateInviteClaimStmt = db.prepare('UPDATE invites SET claim_token=?, claimed_at=? WHERE id=?')
const clearInviteClaimStmt = db.prepare("UPDATE invites SET claim_token='', claimed_at=NULL WHERE id=?")
const markInviteUsedStmt = db.prepare("UPDATE invites SET used_by=?, used_at=?, claim_token='', revoked_at=NULL WHERE id=?")
const revokeInviteStmt = db.prepare("UPDATE invites SET revoked_at=?, claim_token='' WHERE id=?")

// Device and Session management statements
const insertDeviceStmt = db.prepare(
  'INSERT INTO devices (id, user_id, device_name, device_type, user_agent, created_at, last_seen_at, ip_address) VALUES (?,?,?,?,?,?,?,?)'
)
const selectDeviceByIdStmt = db.prepare('SELECT * FROM devices WHERE id=?')
const selectDevicesByUserStmt = db.prepare('SELECT * FROM devices WHERE user_id=? ORDER BY last_seen_at DESC')
const updateDeviceLastSeenStmt = db.prepare('UPDATE devices SET last_seen_at=? WHERE id=?')
const deleteDeviceStmt = db.prepare('DELETE FROM devices WHERE id=?')

const insertSessionStmt = db.prepare(
  'INSERT INTO sessions (id, device_id, user_id, socket_id, access_token, created_at, last_activity_at, expires_at) VALUES (?,?,?,?,?,?,?,?)'
)
const selectSessionByIdStmt = db.prepare('SELECT * FROM sessions WHERE id=?')
const selectSessionsByDeviceStmt = db.prepare('SELECT * FROM sessions WHERE device_id=? ORDER BY created_at DESC')
const selectSessionsByUserStmt = db.prepare('SELECT s.*, d.device_name, d.device_type, d.created_at as device_created_at FROM sessions s JOIN devices d ON s.device_id=d.id WHERE s.user_id=? AND s.terminated_at IS NULL ORDER BY s.last_activity_at DESC')
const selectActiveSessionsByUserStmt = db.prepare('SELECT * FROM sessions WHERE user_id=? AND terminated_at IS NULL')
const updateSessionActivityStmt = db.prepare('UPDATE sessions SET last_activity_at=?, socket_id=? WHERE id=?')
const terminateSessionStmt = db.prepare('UPDATE sessions SET terminated_at=?, terminated_reason=? WHERE id=?')
const deleteSessionStmt = db.prepare('DELETE FROM sessions WHERE id=?')

const upsertChannelKeyStmt = db.prepare(
  'INSERT OR REPLACE INTO channel_keys (channel_id, user_id, wrapped_key, nonce, sender_id, key_version, updated_at) VALUES (?,?,?,?,?,?,?)',
)
const selectChannelKeyStmt = db.prepare(
  'SELECT channel_id, user_id, wrapped_key, nonce, sender_id, key_version, updated_at FROM channel_keys WHERE channel_id=? AND user_id=?',
)
const findMessageById = hasMessageReplyColumn
  ? db.prepare('SELECT id, channel_id, sender_id, reply_to FROM messages WHERE id=?')
  : db.prepare('SELECT id, channel_id, sender_id FROM messages WHERE id=?')
const insertStreamMediaStmt = db.prepare(
  'INSERT INTO media_stream_files (id, filename, mime, size, owner_id, storage_path, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
)
const selectStreamMediaByIdStmt = db.prepare(
  'SELECT id, filename, mime, size, storage_path FROM media_stream_files WHERE id=?',
)

const messageSelectBase = hasMessageReplyColumn
  ? `SELECT m.*, parent.sender_id AS reply_sender_id, parent.content AS reply_content, parent.created_at AS reply_created_at,
     parent.updated_at AS reply_updated_at, parent_user.username AS reply_sender_username
     FROM messages m
     LEFT JOIN messages parent ON parent.id = m.reply_to
     LEFT JOIN users parent_user ON parent_user.id = parent.sender_id`
  : 'SELECT * FROM messages'

const selectMessageFullById = hasMessageReplyColumn
  ? db.prepare(`${messageSelectBase} WHERE m.id=?`)
  : db.prepare('SELECT * FROM messages WHERE id=?')
const deleteMessageStmt = db.prepare('DELETE FROM messages WHERE id=?')
const clearMessageRepliesStmt = hasMessageReplyColumn
  ? db.prepare('UPDATE messages SET reply_to=NULL WHERE reply_to=?')
  : null
const updateMessageContentStmt = (() => {
  if (hasMessageReplyColumn && hasMessageUpdatedAtColumn) {
    const stmt = db.prepare('UPDATE messages SET content=?, updated_at=?, reply_to=? WHERE id=?')
    return (content, updatedAt, replyTo, id) => stmt.run(content, updatedAt, replyTo || null, id)
  }
  if (hasMessageReplyColumn) {
    const stmt = db.prepare('UPDATE messages SET content=?, reply_to=? WHERE id=?')
    return (content, _updatedAt, replyTo, id) => stmt.run(content, replyTo || null, id)
  }
  if (hasMessageUpdatedAtColumn) {
    const stmt = db.prepare('UPDATE messages SET content=?, updated_at=? WHERE id=?')
    return (content, updatedAt, _replyTo, id) => stmt.run(content, updatedAt, id)
  }
  const stmt = db.prepare('UPDATE messages SET content=? WHERE id=?')
  return (content, _updatedAt, _replyTo, id) => stmt.run(content, id)
})()
const selectChannelByIdStmt = db.prepare('SELECT * FROM channels WHERE id=?')
const insertChannelStmt = db.prepare(
  'INSERT INTO channels (id, workspace_id, name, created_at, is_private, created_by) VALUES (?,?,?,?,?,?)',
)
const updateChannelAvatarStmt = db.prepare(
  'UPDATE channels SET avatar_url=?, avatar_updated_at=?, avatar_mime=? WHERE id=?',
)
const listAllChannelsStmt = db.prepare('SELECT * FROM channels WHERE workspace_id=? ORDER BY created_at ASC')
const listUserChannelMembershipsStmt = db.prepare('SELECT channel_id, role FROM channel_members WHERE user_id=?')
const listChannelMembersStmt = db.prepare('SELECT user_id, role FROM channel_members WHERE channel_id=? ORDER BY user_id ASC')
const listChannelMembersDetailedStmt = db.prepare(
  "SELECT m.user_id, m.role, u.username FROM channel_members m JOIN users u ON u.id = m.user_id WHERE m.channel_id=? ORDER BY u.username ASC",
)
const insertChannelMemberStmt = db.prepare('INSERT OR REPLACE INTO channel_members (channel_id, user_id, role) VALUES (?,?,?)')
const deleteChannelMemberStmt = db.prepare('DELETE FROM channel_members WHERE channel_id=? AND user_id=?')
const deleteChannelMembersStmt = db.prepare('DELETE FROM channel_members WHERE channel_id=?')
const deleteMessagesByChannelStmt = db.prepare('DELETE FROM messages WHERE channel_id=?')
const deleteChannelStmt = db.prepare('DELETE FROM channels WHERE id=?')
const findChannelMemberStmt = db.prepare('SELECT role FROM channel_members WHERE channel_id=? AND user_id=?')
const countChannelMembersStmt = db.prepare('SELECT COUNT(*) as count FROM channel_members WHERE channel_id=?')
const listAdminsStmt = db.prepare("SELECT id FROM users WHERE role='admin'")
const upsertPushSubscriptionStmt = db.prepare(
  `INSERT INTO push_subscriptions (id, user_id, endpoint, subscription_json, created_at, updated_at, last_seen_at)
   VALUES (?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT(endpoint) DO UPDATE SET
     user_id=excluded.user_id,
     subscription_json=excluded.subscription_json,
     updated_at=excluded.updated_at,
     last_seen_at=excluded.last_seen_at`,
)
const listPushSubscriptionsByUserStmt = db.prepare(
  'SELECT id, endpoint, subscription_json, updated_at, last_seen_at FROM push_subscriptions WHERE user_id=? ORDER BY updated_at DESC',
)
const deletePushSubscriptionByEndpointStmt = db.prepare(
  'DELETE FROM push_subscriptions WHERE user_id=? AND endpoint=?',
)
const deletePushSubscriptionByEndpointGlobalStmt = db.prepare(
  'DELETE FROM push_subscriptions WHERE endpoint=?',
)
const deletePushSubscriptionsByUserStmt = db.prepare(
  'DELETE FROM push_subscriptions WHERE user_id=?',
)

const publicMessage = (row) => {
  if (!row || typeof row.content === 'undefined') return row
  const updatedAt = row.updated_at ?? row.updatedAt ?? 0
  const channelId = row.channel_id ?? row.channelId ?? null
  const senderId = row.sender_id ?? row.senderId ?? null
  const createdAt = row.created_at ?? row.createdAt ?? Date.now()
  const payload = {
    ...row,
    channel_id: row.channel_id ?? row.channelId ?? channelId,
    channelId,
    sender_id: senderId,
    senderId,
    created_at: createdAt,
    createdAt,
    content: row.content,
    updated_at: updatedAt,
    updatedAt,
  }
  if (hasMessageReplyColumn) {
    const replyId = row.reply_to ?? row.replyTo ?? null
    if (replyId) {
      const replyContentRaw = typeof row.reply_content === 'undefined' ? null : row.reply_content
      const replySenderId = row.reply_sender_id ?? row.replySenderId ?? null
      const replySenderUsername = row.reply_sender_username ?? row.replySenderUsername ?? null
      const replyCreatedAt = row.reply_created_at ?? row.replyCreatedAt ?? 0
      const replyUpdatedAt = row.reply_updated_at ?? row.replyUpdatedAt ?? 0
      payload.replyTo = {
        id: replyId,
        senderId: replySenderId,
        senderUsername: replySenderUsername,
        content: replyContentRaw,
        createdAt: replyCreatedAt,
        updatedAt: replyUpdatedAt,
      }
    } else {
      payload.replyTo = null
    }
    delete payload.reply_content
    delete payload.reply_sender_id
    delete payload.reply_sender_username
    delete payload.reply_created_at
    delete payload.reply_updated_at
  }
  if (typeof payload.replyTo === 'undefined') payload.replyTo = null
  return payload
}

const publicMessages = (rows) => rows.map(publicMessage)

let defaultWs = db.prepare('SELECT id FROM workspaces LIMIT 1').get()
if (!defaultWs) {
  const wsId = uuidv4()
  db.prepare('INSERT INTO workspaces (id,name,created_at) VALUES (?,?,?)').run(wsId, 'Home', Date.now())
  defaultWs = { id: wsId }
}

const ensureDefaultAdmin = () => {
  const existingAdmin = db.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").get()
  if (existingAdmin?.id) return
  const usernameRaw = process.env.DEFAULT_ADMIN_USERNAME || 'admin'
  const passwordRaw = process.env.DEFAULT_ADMIN_PASSWORD || 'Admin123'
  const username = String(usernameRaw).trim() || 'admin'
  const password = String(passwordRaw)
  const id = uuidv4()
  const avatarSeed = username.slice(0, 2)
  const hash = bcrypt.hashSync(password, 10)
  try {
    db.prepare('INSERT INTO users (id,username,password_hash,role,avatar_seed,public_key) VALUES (?,?,?,?,?,?)')
      .run(id, username, hash, 'admin', avatarSeed, '')
    db.prepare('INSERT OR IGNORE INTO workspace_members (workspace_id,user_id) VALUES (?,?)').run(defaultWs.id, id)
    log('[BOOT] seeded default admin', username)
  } catch (err) {
    warn('[BOOT] seed default admin failed', err.message)
  }
}

ensureDefaultAdmin()

const DEFAULT_NAME_STYLE = Object.freeze({
  font: 'rubik',
  effect: 'minimal',
  color: '#8ec5ff',
})

const normalizeNameStyle = (raw) => {
  if (!raw) return DEFAULT_NAME_STYLE
  if (typeof raw === 'string') {
    try {
      return normalizeNameStyle(JSON.parse(raw))
    } catch (err) {
      return DEFAULT_NAME_STYLE
    }
  }
  return {
    font: typeof raw.font === 'string' ? raw.font : DEFAULT_NAME_STYLE.font,
    effect: typeof raw.effect === 'string' ? raw.effect : DEFAULT_NAME_STYLE.effect,
    color: typeof raw.color === 'string' ? raw.color : DEFAULT_NAME_STYLE.color,
  }
}

const publicUser = (u) => {
  if (!u) return null
  const seed = u.avatar_seed ?? u.avatarSeed ?? ''
  const avatarPath = u.avatar_url ?? u.avatarUrl ?? ''
  const avatarUpdatedAt = u.avatar_updated_at ?? u.avatarUpdatedAt ?? 0
  const nameStyle = normalizeNameStyle(u.name_style ?? u.nameStyle ?? '')
  const displayName = typeof (u.display_name ?? u.displayName) === 'string'
    ? (u.display_name ?? u.displayName)
    : ''
  const profileStatus = typeof (u.profile_status ?? u.profileStatus) === 'string'
    ? (u.profile_status ?? u.profileStatus)
    : ''
  const profileBackground = typeof (u.profile_background ?? u.profileBackground) === 'string'
    ? (u.profile_background ?? u.profileBackground)
    : ''
  const userStatus = typeof (u.user_status ?? u.userStatus) === 'string'
    ? (u.user_status ?? u.userStatus)
    : 'online'
  const publicKey = typeof (u.public_key ?? u.publicKey) === 'string'
    ? (u.public_key ?? u.publicKey)
    : ''
  return {
    id: u.id,
    username: u.username,
    displayName,
    display_name: displayName,
    profileStatus,
    profile_status: profileStatus,
    profileBackground,
    profile_background: profileBackground,
    userStatus,
    user_status: userStatus,
    role: u.role,
    publicKey,
    public_key: publicKey,
    avatarSeed: seed,
    avatar_seed: seed,
    avatarUrl: avatarPath ? '/api/users/' + u.id + '/avatar' : '',
    avatar_url: avatarPath,
    avatarUpdatedAt,
    avatar_updated_at: avatarUpdatedAt,
    nameStyle,
    name_style: nameStyle,
  }
}

const isValidPublicKey = (value) => {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (!trimmed) return false
  try {
    const raw = Buffer.from(trimmed, 'base64')
    return raw.length === 32
  } catch (_) {
    return false
  }
}

const listWorkspaceMembersStmt = db.prepare('SELECT user_id FROM workspace_members WHERE workspace_id=?')

const normalizeChannelRow = (row) => {
  if (!row) return null
  const avatarPath = row.avatar_url ?? row.avatarUrl ?? ''
  const avatarUpdatedAt = row.avatar_updated_at ?? row.avatarUpdatedAt ?? 0
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    createdAt: row.created_at,
    isPrivate: Boolean(row.is_private),
    createdBy: row.created_by || '',
    avatarUrl: avatarPath ? `/api/channels/${row.id}/avatar` : '',
    avatarUpdatedAt,
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

const publicChannel = (channel, extras = {}) => {
  if (!channel) return null
  const normalized = typeof channel.workspaceId !== 'undefined' ? channel : normalizeChannelRow(channel)
  if (!normalized) return null
  const memberCount =
    typeof extras.memberCount === 'number'
      ? extras.memberCount
      : normalized.isPrivate
        ? getChannelMemberCount(normalized.id)
        : 0
  const membershipRole = extras.membershipRole || ''
  return {
    id: normalized.id,
    name: normalized.name,
    createdAt: normalized.createdAt,
    isPrivate: normalized.isPrivate,
    createdBy: normalized.createdBy,
    memberCount,
    membershipRole,
    avatarUrl: normalized.avatarUrl,
    avatarUpdatedAt: normalized.avatarUpdatedAt,
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
  const allChannels = listAllChannelsStmt.all(defaultWs.id).filter((row) => row.is_private)
  return allChannels
    .map((row) => ({ row, normalized: normalizeChannelRow(row) }))
    .filter(({ normalized }) => Boolean(normalized))
    .filter(({ normalized }) => {
      if (!normalized.isPrivate) return true
      if (user.role === 'admin') return true
      if (normalized.createdBy && normalized.createdBy === user.id) return true
      return memberships.has(normalized.id)
    })
    .map(({ normalized }) => {
      const memberCount = normalized.isPrivate ? getChannelMemberCount(normalized.id) : 0
      const ownerRole = normalized.createdBy && normalized.createdBy === user.id ? 'owner' : ''
      const membershipRole =
        ownerRole || memberships.get(normalized.id) || (user.role === 'admin' && normalized.isPrivate ? 'admin' : '')
      return publicChannel(normalized, { memberCount, membershipRole })
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

const pendingPushByUser = new Map()

const parsePushSubscription = (raw) => {
  if (!raw || typeof raw !== 'object') return null
  const endpoint = typeof raw.endpoint === 'string' ? raw.endpoint.trim() : ''
  const p256dh = typeof raw.keys?.p256dh === 'string' ? raw.keys.p256dh.trim() : ''
  const auth = typeof raw.keys?.auth === 'string' ? raw.keys.auth.trim() : ''
  if (!endpoint || !p256dh || !auth) return null
  return {
    endpoint,
    expirationTime: raw.expirationTime ?? null,
    keys: { p256dh, auth },
  }
}

const queuePushForUsers = (userIds = [], event = {}) => {
  if (!PUSH_ENABLED) return
  const now = Date.now()
  userIds
    .filter(Boolean)
    .forEach((targetUserId) => {
      const existing = pendingPushByUser.get(targetUserId)
      if (existing) {
        existing.items.push(event)
        return
      }
      const entry = {
        items: [event],
        timer: setTimeout(() => flushQueuedPush(targetUserId), PUSH_BATCH_WINDOW_MS),
      }
      pendingPushByUser.set(targetUserId, entry)
    })
}

const buildPushPayload = (events = []) => {
  const valid = events.filter(Boolean)
  const first = valid[0] || {}
  const count = valid.length
  const channels = new Set(valid.map((item) => item.channelName).filter(Boolean))
  const uniqueChannelCount = channels.size
  const single = count === 1
  const title = single
    ? (first.channelName || first.senderName || 'NE Messenger')
    : 'NE Messenger'
  const body = single
    ? `${first.senderName || 'Пользователь'}: Новое сообщение`
    : `${count} новых сообщений${uniqueChannelCount > 1 ? ` в ${uniqueChannelCount} чатах` : ''}`
  const meta = single
    ? {
        messageId: first.messageId || null,
        channelId: first.channelId || null,
        channelName: first.channelName || null,
      }
    : { batch: true, count, channelCount: uniqueChannelCount }
  return {
    title,
    body,
    tag: single ? `msg:${first.messageId || first.channelId || Date.now()}` : 'batch:new-messages',
    meta,
    url: '/',
    silent: false,
  }
}

async function flushQueuedPush(userId) {
  const entry = pendingPushByUser.get(userId)
  if (!entry) return
  pendingPushByUser.delete(userId)
  if (!entry.items.length) return
  const subscriptions = listPushSubscriptionsByUserStmt.all(userId)
  if (!subscriptions.length) return
  const payload = JSON.stringify(buildPushPayload(entry.items))
  for (const row of subscriptions) {
    let subscription
    try {
      subscription = JSON.parse(row.subscription_json)
    } catch (err) {
      deletePushSubscriptionByEndpointGlobalStmt.run(row.endpoint)
      continue
    }
    try {
      await webpush.sendNotification(subscription, payload, { TTL: 60, urgency: 'normal' })
    } catch (err) {
      const code = err?.statusCode
      if (code === 404 || code === 410) {
        deletePushSubscriptionByEndpointGlobalStmt.run(row.endpoint)
      } else {
        warn('[PUSH] send failed', 'user=' + userId, 'endpoint=' + row.endpoint, err?.message || err)
      }
    }
  }
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

const areFriends = (userId, friendId) => {
  if (!userId || !friendId) return false
  if (userId === friendId) return false
  return Boolean(selectFriendshipStmt.get(userId, friendId))
}

const addFriendship = (userId, friendId) => {
  const now = Date.now()
  insertFriendStmt.run(userId, friendId, now)
  insertFriendStmt.run(friendId, userId, now)
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

const canAccessDirectChannel = (channelId, userId) => {
  const parsed = parseDirectChannelId(channelId)
  if (!parsed) return false
  if (parsed.first !== userId && parsed.second !== userId) return false
  const peerId = parsed.first === userId ? parsed.second : parsed.first
  return areFriends(userId, peerId)
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

app.get('/api/push/public-key', (_req, res) => {
  res.json({ enabled: PUSH_ENABLED, publicKey: PUSH_ENABLED ? VAPID_PUBLIC_KEY : null })
})

app.post('/api/push/subscribe', auth, (req, res) => {
  if (!PUSH_ENABLED) return res.status(503).json({ error: 'push_disabled' })
  const parsed = parsePushSubscription(req.body?.subscription)
  if (!parsed) return res.status(400).json({ error: 'invalid_subscription' })
  const now = Date.now()
  upsertPushSubscriptionStmt.run(
    uuidv4(),
    req.user.id,
    parsed.endpoint,
    JSON.stringify(parsed),
    now,
    now,
    now,
  )
  res.json({ ok: true })
})

app.delete('/api/push/subscribe', auth, (req, res) => {
  const endpointRaw = typeof req.body?.endpoint === 'string' ? req.body.endpoint : ''
  const endpoint = endpointRaw.trim()
  if (!endpoint) return res.status(400).json({ error: 'endpoint_required' })
  deletePushSubscriptionByEndpointStmt.run(req.user.id, endpoint)
  res.json({ ok: true })
})

// Sessions and Devices management endpoints
app.get('/api/sessions', auth, (req, res) => {
  try {
    const sessions = selectSessionsByUserStmt.all(req.user.id)
    res.json(sessions || [])
  } catch (err) {
    logError('[SESSIONS] list failed', err.message)
    res.status(500).json({ error: 'list_failed' })
  }
})

app.get('/api/devices', auth, (req, res) => {
  try {
    const devices = selectDevicesByUserStmt.all(req.user.id)
    res.json(devices || [])
  } catch (err) {
    logError('[DEVICES] list failed', err.message)
    res.status(500).json({ error: 'list_failed' })
  }
})

app.post('/api/devices/register', auth, (req, res) => {
  try {
    const deviceNameRaw = typeof req.body?.device_name === 'string' ? req.body.device_name : ''
    const deviceTypeRaw = typeof req.body?.device_type === 'string' ? req.body.device_type : ''
    const userAgentRaw = typeof req.body?.user_agent === 'string' ? req.body.user_agent : ''
    
    const deviceName = deviceNameRaw.trim() || 'Unknown Device'
    const deviceType = deviceTypeRaw.trim() || 'web'
    const userAgent = userAgentRaw.trim()
    const deviceId = uuidv4()
    const now = Date.now()
    
    insertDeviceStmt.run(deviceId, req.user.id, deviceName, deviceType, userAgent, now, now, req.ip || '')
    
    res.json({ device_id: deviceId, created_at: now })
  } catch (err) {
    logError('[DEVICES] register failed', err.message)
    res.status(500).json({ error: 'register_failed' })
  }
})

app.delete('/api/devices/:deviceId', auth, (req, res) => {
  try {
    const { deviceId } = req.params
    const device = selectDeviceByIdStmt.get(deviceId)
    
    if (!device) return res.status(404).json({ error: 'device_not_found' })
    if (device.user_id !== req.user.id) return res.status(403).json({ error: 'forbidden' })
    
    // Delete sessions for this device
    const sessions = selectSessionsByDeviceStmt.all(deviceId)
    for (const session of sessions) {
      terminateSessionStmt.run(Date.now(), 'device_deleted', session.id)
      
      // Notify the session if it's still connected
      if (session.socket_id) {
        io.to(session.socket_id).emit('session:terminated', {
          sessionId: session.id,
          reason: 'device_deleted',
          message: 'This device has been removed from your account',
        })
      }
    }
    
    // Delete device
    deleteDeviceStmt.run(deviceId)
    
    // Notify other active sessions about device deletion
    const otherSessions = selectActiveSessionsByUserStmt.all(req.user.id)
    for (const otherSession of otherSessions) {
      if (otherSession.socket_id) {
        io.to(otherSession.socket_id).emit('devices:updated', {
          deletedDeviceId: deviceId,
          action: 'deleted',
        })
      }
    }
    
    res.json({ ok: true })
  } catch (err) {
    logError('[DEVICES] delete failed', err.message)
    res.status(500).json({ error: 'delete_failed' })
  }
})

app.post('/api/sessions/create', auth, (req, res) => {
  try {
    const deviceIdRaw = typeof req.body?.device_id === 'string' ? req.body.device_id : ''
    const deviceId = deviceIdRaw.trim()
    
    if (!deviceId) return res.status(400).json({ error: 'device_id_required' })
    
    const device = selectDeviceByIdStmt.get(deviceId)
    if (!device) return res.status(404).json({ error: 'device_not_found' })
    if (device.user_id !== req.user.id) return res.status(403).json({ error: 'forbidden' })
    
    const sessionId = uuidv4()
    const now = Date.now()
    const expiresAt = now + 90 * 24 * 60 * 60 * 1000 // 90 days
    
    insertSessionStmt.run(sessionId, deviceId, req.user.id, '', '', now, now, expiresAt)
    
    res.json({ session_id: sessionId, created_at: now, expires_at: expiresAt })
  } catch (err) {
    logError('[SESSIONS] create failed', err.message)
    res.status(500).json({ error: 'create_failed' })
  }
})

app.post('/api/sessions/:sessionId/terminate', auth, (req, res) => {
  try {
    const { sessionId } = req.params
    const reasonRaw = typeof req.body?.reason === 'string' ? req.body.reason : ''
    const reason = reasonRaw.trim() || 'user_terminated'
    
    const session = selectSessionByIdStmt.get(sessionId)
    if (!session) return res.status(404).json({ error: 'session_not_found' })
    if (session.user_id !== req.user.id) return res.status(403).json({ error: 'forbidden' })
    
    const now = Date.now()
    terminateSessionStmt.run(now, reason, sessionId)
    
    // Emit real-time update to other sessions of this user
    const otherSessions = selectActiveSessionsByUserStmt.all(req.user.id)
    for (const otherSession of otherSessions) {
      if (otherSession.socket_id) {
        io.to(otherSession.socket_id).emit('sessions:updated', {
          sessionId,
          terminated: true,
          reason,
          terminatedAt: now,
        })
      }
    }
    
    // If the terminated session is connected, notify it
    if (session.socket_id) {
      io.to(session.socket_id).emit('session:terminated', {
        sessionId,
        reason,
        message: reason === 'user_terminated' 
          ? 'Your session has been terminated from another device'
          : `Session terminated: ${reason}`,
      })
    }
    
    res.json({ ok: true })
  } catch (err) {
    logError('[SESSIONS] terminate failed', err.message)
    res.status(500).json({ error: 'terminate_failed' })
  }
})

app.delete('/api/sessions/:sessionId', auth, (req, res) => {
  try {
    const { sessionId } = req.params
    
    const session = selectSessionByIdStmt.get(sessionId)
    if (!session) return res.status(404).json({ error: 'session_not_found' })
    if (session.user_id !== req.user.id) return res.status(403).json({ error: 'forbidden' })
    
    deleteSessionStmt.run(sessionId)
    
    res.json({ ok: true })
  } catch (err) {
    logError('[SESSIONS] delete failed', err.message)
    res.status(500).json({ error: 'delete_failed' })
  }
})

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

app.get('/api/friends', auth, (req, res) => {
  const friends = listFriendsStmt.all(req.user.id).map(publicUser)
  res.json({ friends })
})

app.get('/api/friends/requests', auth, (req, res) => {
  const incoming = listIncomingFriendRequestsStmt.all(req.user.id).map((row) => ({
    id: row.request_id,
    fromUser: publicUser(row),
    createdAt: row.created_at,
  }))
  const outgoing = listOutgoingFriendRequestsStmt.all(req.user.id).map((row) => ({
    id: row.request_id,
    toUser: publicUser(row),
    createdAt: row.created_at,
  }))
  res.json({ incoming, outgoing })
})

  app.post('/api/friends/request', auth, (req, res) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : ''
    if (!username) return res.status(400).json({ error: 'invalid_username' })
    const target = selectUserByUsername.get(username)
    if (!target) return res.status(404).json({ error: 'not_found' })
  if (target.id === req.user.id) return res.status(400).json({ error: 'invalid_target' })
  if (areFriends(req.user.id, target.id)) return res.json({ status: 'already_friends' })

  const reverse = selectFriendRequestBetweenStmt.get(target.id, req.user.id)
    if (reverse) {
      deleteFriendRequestByIdStmt.run(reverse.id)
      addFriendship(req.user.id, target.id)
      emitToUser(req.user.id, 'friends:requests:update', { reason: 'accepted' })
      emitToUser(target.id, 'friends:requests:update', { reason: 'accepted' })
      return res.json({ status: 'accepted' })
    }
    const existing = selectFriendRequestBetweenStmt.get(req.user.id, target.id)
    if (existing) return res.json({ status: 'requested' })
    const id = uuidv4()
    insertFriendRequestStmt.run(id, req.user.id, target.id, Date.now())
    emitToUser(req.user.id, 'friends:requests:update', { reason: 'requested' })
    emitToUser(target.id, 'friends:requests:update', { reason: 'requested' })
    res.json({ status: 'requested', requestId: id })
  })

  app.post('/api/friends/respond', auth, (req, res) => {
    const requestId = typeof req.body?.requestId === 'string' ? req.body.requestId : ''
    const accept = Boolean(req.body?.accept)
    if (!requestId) return res.status(400).json({ error: 'invalid_request' })
    const request = selectFriendRequestByIdStmt.get(requestId)
  if (!request || request.to_user_id !== req.user.id) return res.status(404).json({ error: 'not_found' })
    deleteFriendRequestByIdStmt.run(requestId)
    if (accept) {
      addFriendship(req.user.id, request.from_user_id)
      emitToUser(req.user.id, 'friends:requests:update', { reason: 'accepted' })
      emitToUser(request.from_user_id, 'friends:requests:update', { reason: 'accepted' })
      return res.json({ status: 'accepted' })
    }
    emitToUser(req.user.id, 'friends:requests:update', { reason: 'declined' })
    emitToUser(request.from_user_id, 'friends:requests:update', { reason: 'declined' })
    return res.json({ status: 'declined' })
  })

app.delete('/api/friends/:userId', auth, (req, res) => {
  const friendId = req.params.userId
  if (!friendId) return res.status(400).json({ error: 'invalid_user' })
  deleteFriendStmt.run(req.user.id, friendId)
  deleteFriendStmt.run(friendId, req.user.id)
  res.json({ ok: true })
})

app.post('/api/register', (req, res) => {
  const { username: rawUsername, password: rawPassword, inviteCode: rawInviteCode, inviteClaimToken, publicKey: rawPublicKey } = req.body || {}
  const username = typeof rawUsername === 'string' ? rawUsername.trim() : ''
  const password = typeof rawPassword === 'string' ? rawPassword : ''
  const publicKey = typeof rawPublicKey === 'string' ? rawPublicKey.trim() : ''
  if (!username || !password) {
    warn('[REGISTER] invalid payload', req.ip)
    return res.status(400).json({ error: 'username_and_password_required' })
  }
  if (password.length < 6 || !/[a-z]/.test(password) || !/[A-Z]/.test(password)) {
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
  if (publicKey && !isValidPublicKey(publicKey)) {
    warn('[REGISTER] invalid public key', username)
    return res.status(400).json({ error: 'invalid_public_key' })
  }
  const id = uuidv4()
  const hash = bcrypt.hashSync(password, 10)
  const role = isFirstUser ? 'admin' : 'user'
  const avatarSeed = username.slice(0, 2)
  try {
    db.prepare('INSERT INTO users (id,username,password_hash,role,avatar_seed,public_key) VALUES (?,?,?,?,?,?)')
      .run(id, username, hash, role, avatarSeed, publicKey)
  } catch (e) {
    warn('[REGISTER] username_taken', username)
    return res.status(400).json({ error: 'username_taken' })
  }
  db.prepare('INSERT OR IGNORE INTO workspace_members (workspace_id,user_id) VALUES (?,?)').run(defaultWs.id, id)
  if (invite) {
    markInviteUsedStmt.run(id, Date.now(), invite.id)
    const inviterId = invite.created_by
    if (inviterId && inviterId !== id) {
      const inviter = selectUserById.get(inviterId)
      if (inviter) {
        addFriendship(id, inviterId)
        emitToUser(id, 'friends:requests:update', { reason: 'invite_auto_friend' })
        emitToUser(inviterId, 'friends:requests:update', { reason: 'invite_auto_friend' })
        log('[REGISTER] invite auto-friend', 'new=' + id, 'inviter=' + inviterId, 'invite=' + invite.code)
      } else {
        warn('[REGISTER] invite creator missing for auto-friend', 'creator=' + inviterId, 'invite=' + invite.code)
      }
    }
  }
  const accessToken = jwt.sign({ id, username, role, avatar_seed: avatarSeed }, JWT_SECRET, { expiresIn: '15m' })
  const refreshToken = jwt.sign({ id, type: 'refresh' }, JWT_SECRET, { expiresIn: '10y' })
  const user = publicUser({ id, username, role, avatar_seed: avatarSeed })
  log('[REGISTER] success', username, 'role=' + role, invite ? 'invite=' + invite.code : 'no_invite')
  res.json({ accessToken, refreshToken, user })
  io.emit('user:update', user)
})

app.post('/api/login', (req, res) => {
  const { username, password, device_name, device_type, user_agent } = req.body || {}
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
  const accessToken = jwt.sign({ id: userRecord.id, username: userRecord.username, role: userRecord.role, avatar_seed: userRecord.avatar_seed || '' }, JWT_SECRET, { expiresIn: '15m' })
  const refreshToken = jwt.sign({ id: userRecord.id, type: 'refresh' }, JWT_SECRET, { expiresIn: '10y' })
  log('[LOGIN] success', username)
  
  // Optionally create device and session if device info provided
  let deviceId = null
  let sessionId = null
  if (device_name || device_type) {
    try {
      const deviceNameVal = String(device_name || 'Unknown Device').slice(0, 255)
      const deviceTypeVal = String(device_type || 'web').slice(0, 50)
      const userAgentVal = String(user_agent || '').slice(0, 500)
      const now = Date.now()
      
      deviceId = uuidv4()
      insertDeviceStmt.run(deviceId, userRecord.id, deviceNameVal, deviceTypeVal, userAgentVal, now, now, req.ip || '')
      
      sessionId = uuidv4()
      const expiresAt = now + 90 * 24 * 60 * 60 * 1000 // 90 days
      insertSessionStmt.run(sessionId, deviceId, userRecord.id, '', accessToken, now, now, expiresAt)
      
      log('[LOGIN] device registered', 'deviceId=' + deviceId, 'sessionId=' + sessionId)
    } catch (err) {
      warn('[LOGIN] device registration failed', err.message)
      // Don't fail login, just continue without device tracking
    }
  }
  
  const response = { accessToken, refreshToken, user: publicUser(userRecord) }
  if (deviceId) response.device_id = deviceId
  if (sessionId) response.session_id = sessionId
  res.json(response)
})

app.post('/api/refresh', (req, res) => {
  const { refreshToken } = req.body || {}
  if (!refreshToken) {
    return res.status(401).json({ error: 'no_refresh_token' })
  }
  try {
    const decoded = jwt.verify(refreshToken, JWT_SECRET)
    if (decoded.type !== 'refresh') {
      warn('[REFRESH] invalid token type', 'token_type=' + decoded.type)
      return res.status(401).json({ error: 'invalid_token_type' })
    }
    const userId = decoded.id
    const userRecord = selectUserById.get(userId)
    if (!userRecord) {
      warn('[REFRESH] user not found', 'user=' + userId)
      return res.status(401).json({ error: 'user_not_found' })
    }
    const accessToken = jwt.sign(
      { id: userRecord.id, username: userRecord.username, role: userRecord.role, avatar_seed: userRecord.avatar_seed || '' },
      JWT_SECRET,
      { expiresIn: '15m' }
    )
    log('[REFRESH] success', 'user=' + userId)
    res.json({ accessToken })
  } catch (e) {
    warn('[REFRESH] invalid token', e.message)
    return res.status(401).json({ error: 'invalid_refresh_token' })
  }
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
  const { name, memberIds } = req.body || {}
  const trimmed = typeof name === 'string' ? name.trim() : ''
  if (!trimmed || trimmed.length < 2 || trimmed.length > 64)
    return res.status(400).json({ error: 'invalid_name' })
  const privateFlag = true
  const now = Date.now()
  const channelId = uuidv4()
  insertChannelStmt.run(channelId, defaultWs.id, trimmed, now, 1, req.user.id)
  insertChannelMemberStmt.run(channelId, req.user.id, 'owner')
  const provided = Array.isArray(memberIds) ? memberIds : []
  const unique = new Set(provided.filter((id) => typeof id === 'string' && id && id !== req.user.id))
  unique.forEach((memberId) => {
    if (!areFriends(req.user.id, memberId)) return
    const target = selectUserById.get(memberId)
    if (!target) return
    insertChannelMemberStmt.run(channelId, memberId, 'member')
  })
  const channelRow = selectChannelByIdStmt.get(channelId)
  const audience = getChannelAudienceUserIds(channelRow)
  emitChannelListForUsers(audience)
  const creatorChannels = getAccessibleChannelsForUser(selectUserById.get(req.user.id)).filter((ch) => ch.id === channelId)
  const channelPayload =
    creatorChannels[0] ||
    publicChannel(channelRow, {
      memberCount: channelRow.is_private ? getChannelMemberCount(channelRow.id) : 0,
      membershipRole: privateFlag ? 'owner' : '',
    })
  const members = getChannelMembersDetailed(channelId)
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
  if (!areFriends(user.id, targetId)) return res.status(403).json({ error: 'not_friends' })
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

app.delete('/api/channels/:id', auth, (req, res) => {
  const user = selectUserById.get(req.user.id)
  if (!user) return res.status(404).json({ error: 'not_found' })
  const access = resolveChannelAccess(user, req.params.id)
  const channel = access.channel || selectChannelByIdStmt.get(req.params.id)
  if (!channel) return res.status(404).json({ error: 'not_found' })
  if (!channel.is_private) return res.status(400).json({ error: 'not_private' })
  const role = access.role || null
  const isAdmin = user.role === 'admin' || role === 'admin'
  const isOwner = role === 'owner'
  if (!isAdmin && !isOwner) {
    return res.status(403).json({ error: 'forbidden' })
  }
  if (channel.avatar_url) {
    const avatarPath = path.resolve(path.join(UPLOAD_DIR, channel.avatar_url))
    if (avatarPath.startsWith(UPLOADS_ROOT) && fs.existsSync(avatarPath)) {
      try {
        fs.unlinkSync(avatarPath)
      } catch (err) {
        warn('[CHANNELS] avatar cleanup failed', err.message)
      }
    }
  }
  const audience = getChannelAudienceUserIds(channel)
  const memberRows = listChannelMembersStmt.all(channel.id)
  const notifyIds = new Set(audience)
  if (channel.created_by) notifyIds.add(channel.created_by)
  memberRows.forEach((row) => {
    if (row?.user_id) notifyIds.add(row.user_id)
  })
  const notifyList = Array.from(notifyIds)
  notifyList.forEach((userId) => removeUserFromChannelRoom(channel.id, userId))
  deleteMessagesByChannelStmt.run(channel.id)
  deleteChannelMembersStmt.run(channel.id)
  deleteChannelStmt.run(channel.id)
  emitChannelListForUsers(notifyList)
  log('[CHANNELS] delete', req.params.id, 'actor=' + req.user.id)
  res.json({ ok: true })
})

app.post('/api/channels/:id/avatar', auth, (req, res) => {
  channelAvatarUpload.single('avatar')(req, res, (err) => {
    if (err) {
      warn('[CHANNELS] avatar upload failed', err?.message || err)
      const code = err.code === 'LIMIT_FILE_SIZE' ? 'avatar_too_large' : 'invalid_avatar'
      return res.status(400).json({ error: code })
    }
    if (!req.file) return res.status(400).json({ error: 'invalid_avatar' })

    const viewer = selectUserById.get(req.user.id)
    if (!viewer) return res.status(404).json({ error: 'not_found' })
    const channel = selectChannelByIdStmt.get(req.params.id)
    if (!channel) return res.status(404).json({ error: 'not_found' })
    const access = resolveChannelAccess(viewer, channel.id)
    if (!access.allowed && channel.is_private) return res.status(404).json({ error: 'not_found' })
    const membershipRole = access.role || ''
    const isCreator = !channel.is_private && channel.created_by && channel.created_by === viewer.id
    const canManage = viewer.role === 'admin' || membershipRole === 'owner' || membershipRole === 'admin' || isCreator
    if (!canManage) return res.status(403).json({ error: 'forbidden' })

    const relPath = path.relative(UPLOAD_DIR, req.file.path)
    const previousPath = channel.avatar_url ? path.join(UPLOAD_DIR, channel.avatar_url) : ''
    updateChannelAvatarStmt.run(relPath, Date.now(), req.file.mimetype || '', channel.id)
    if (previousPath && fs.existsSync(previousPath) && path.resolve(previousPath).startsWith(UPLOADS_ROOT)) {
      if (path.resolve(previousPath) !== path.resolve(req.file.path)) {
        try {
          fs.unlinkSync(previousPath)
        } catch (e) {
          warn('[CHANNELS] avatar cleanup failed', e.message)
        }
      }
    }

    const updated = selectChannelByIdStmt.get(channel.id)
    const audience = getChannelAudienceUserIds(updated)
    emitChannelListForUsers(audience)
    const updatedAccess = updated.is_private ? resolveChannelAccess(viewer, updated.id) : { allowed: true, role: '' }
    const roleForResponse = updated.is_private
      ? updatedAccess.role || (viewer.role === 'admin' ? 'admin' : '')
      : viewer.role === 'admin'
        ? 'admin'
        : ''
    const payload = publicChannel(updated, {
      memberCount: updated.is_private ? getChannelMemberCount(updated.id) : 0,
      membershipRole: roleForResponse,
    })
    log('[CHANNELS] avatar updated', updated.id, 'actor=' + viewer.id)
    res.json({ channel: payload })
  })
})

app.delete('/api/channels/:id/avatar', auth, (req, res) => {
  const viewer = selectUserById.get(req.user.id)
  if (!viewer) return res.status(404).json({ error: 'not_found' })
  const channel = selectChannelByIdStmt.get(req.params.id)
  if (!channel) return res.status(404).json({ error: 'not_found' })
  const access = resolveChannelAccess(viewer, channel.id)
  if (!access.allowed && channel.is_private) return res.status(404).json({ error: 'not_found' })
  const membershipRole = access.role || ''
  const isCreator = !channel.is_private && channel.created_by && channel.created_by === viewer.id
  const canManage = viewer.role === 'admin' || membershipRole === 'owner' || membershipRole === 'admin' || isCreator
  if (!canManage) return res.status(403).json({ error: 'forbidden' })

  if (channel.avatar_url) {
    const avatarPath = path.resolve(path.join(UPLOAD_DIR, channel.avatar_url))
    if (avatarPath.startsWith(UPLOADS_ROOT) && fs.existsSync(avatarPath)) {
      try {
        fs.unlinkSync(avatarPath)
      } catch (err) {
        warn('[CHANNELS] avatar delete failed', err.message)
      }
    }
  }
  updateChannelAvatarStmt.run('', 0, '', channel.id)
  const updated = selectChannelByIdStmt.get(channel.id)
  emitChannelListForUsers(getChannelAudienceUserIds(updated))
  const updatedAccess = updated.is_private ? resolveChannelAccess(viewer, updated.id) : { allowed: true, role: '' }
  const roleForResponse = updated.is_private
    ? updatedAccess.role || (viewer.role === 'admin' ? 'admin' : '')
    : viewer.role === 'admin'
      ? 'admin'
      : ''
  const payload = publicChannel(updated, {
    memberCount: updated.is_private ? getChannelMemberCount(updated.id) : 0,
    membershipRole: roleForResponse,
  })
  log('[CHANNELS] avatar removed', updated.id, 'actor=' + viewer.id)
  res.json({ channel: payload })
})

app.get('/api/channels/:id/avatar', (req, res) => {
  const channel = selectChannelByIdStmt.get(req.params.id)
  if (!channel?.avatar_url) {
    return res.status(404).json({ error: 'not_found' })
  }
  const avatarPath = path.resolve(path.join(UPLOAD_DIR, channel.avatar_url))
  if (!avatarPath.startsWith(UPLOADS_ROOT)) return res.status(403).json({ error: 'forbidden' })
  if (!fs.existsSync(avatarPath)) {
    warn('[CHANNELS] avatar missing file', req.params.id)
    return res.status(404).json({ error: 'missing_file' })
  }
  if (channel.avatar_mime) res.setHeader('Content-Type', channel.avatar_mime)
  if (channel.avatar_updated_at) res.setHeader('Last-Modified', new Date(channel.avatar_updated_at).toUTCString())
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
  res.sendFile(avatarPath)
})

app.get('/api/users', auth, (req, res) => {
  const users = db
    .prepare('SELECT id, username, display_name, profile_status, profile_background, user_status, role, public_key, avatar_seed, avatar_url, avatar_updated_at, name_style FROM users ORDER BY username ASC')
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

app.post('/api/profile/e2e-key', auth, (req, res) => {
  const rawPublicKey = typeof req.body?.publicKey === 'string' ? req.body.publicKey.trim() : ''
  if (!isValidPublicKey(rawPublicKey)) return res.status(400).json({ error: 'invalid_public_key' })
  updatePublicKeyStmt.run(rawPublicKey, req.user.id)
  const user = selectUserById.get(req.user.id)
  if (!user) return res.status(404).json({ error: 'not_found' })
  log('[E2E] public key updated', req.user.id)
  res.json({ user: publicUser(user) })
})

app.get('/api/channels/:id/e2e-key', auth, (req, res) => {
  const requested = req.params.id
  if (!requested) return res.status(400).json({ error: 'invalid_channel' })
  let channelId = requested
  if (requested.startsWith('dm:')) {
    if (!canAccessDirectChannel(requested, req.user.id)) return res.status(404).json({ error: 'not_found' })
    const normalized = normalizeDirectChannelId(requested)
    if (!normalized) return res.status(404).json({ error: 'not_found' })
    channelId = normalized
  } else {
    const viewer = selectUserById.get(req.user.id)
    if (!viewer) return res.status(404).json({ error: 'not_found' })
    const access = resolveChannelAccess(viewer, requested)
    if (!access.allowed) return res.status(404).json({ error: 'not_found' })
    channelId = requested
  }
  const share = selectChannelKeyStmt.get(channelId, req.user.id)
  if (!share) return res.status(404).json({ error: 'not_found' })
  const sender = selectUserById.get(share.sender_id)
  res.json({
    key: {
      channelId: share.channel_id,
      userId: share.user_id,
      wrappedKey: share.wrapped_key,
      nonce: share.nonce,
      senderId: share.sender_id,
      senderPublicKey: sender?.public_key || '',
      keyVersion: share.key_version || 1,
      updatedAt: share.updated_at || 0,
    },
  })
})

app.post('/api/channels/:id/e2e-keys', auth, (req, res) => {
  const requested = req.params.id
  if (!requested) return res.status(400).json({ error: 'invalid_channel' })
  const shares = Array.isArray(req.body?.shares) ? req.body.shares : []
  if (!shares.length) return res.status(400).json({ error: 'invalid_payload' })
  if (shares.length > 5000) return res.status(400).json({ error: 'too_many_shares' })

  let channelId = requested
  let allowedTargets = null

  if (requested.startsWith('dm:')) {
    if (!canAccessDirectChannel(requested, req.user.id)) return res.status(404).json({ error: 'not_found' })
    const normalized = normalizeDirectChannelId(requested)
    if (!normalized) return res.status(404).json({ error: 'not_found' })
    channelId = normalized
    const parsed = parseDirectChannelId(normalized)
    if (!parsed) return res.status(404).json({ error: 'not_found' })
    allowedTargets = new Set([parsed.first, parsed.second])
  } else {
    const viewer = selectUserById.get(req.user.id)
    if (!viewer) return res.status(404).json({ error: 'not_found' })
    const access = resolveChannelAccess(viewer, requested)
    if (!access.allowed) return res.status(404).json({ error: 'not_found' })
    channelId = requested
    const channel = selectChannelByIdStmt.get(requested)
    if (!channel) return res.status(404).json({ error: 'not_found' })
    if (channel.is_private) {
      const members = listChannelMembersStmt.all(requested)
      allowedTargets = new Set(members.map((row) => row.user_id))
      if (channel.created_by) allowedTargets.add(channel.created_by)
      allowedTargets.add(req.user.id)
    }
  }

  const now = Date.now()
  let written = 0
  shares.forEach((entry) => {
    const userId = typeof entry?.userId === 'string' ? entry.userId.trim() : ''
    const wrappedKey = typeof entry?.wrappedKey === 'string' ? entry.wrappedKey.trim() : ''
    const nonce = typeof entry?.nonce === 'string' ? entry.nonce.trim() : ''
    let keyVersion = parseInt(entry?.keyVersion, 10)
    if (!Number.isFinite(keyVersion) || keyVersion <= 0) keyVersion = 1
    if (!userId || !wrappedKey || !nonce) return
    if (allowedTargets && !allowedTargets.has(userId)) return
    const target = selectUserById.get(userId)
    if (!target) return
    upsertChannelKeyStmt.run(channelId, userId, wrappedKey, nonce, req.user.id, keyVersion, now)
    written += 1
  })
  log('[E2E] channel keys upsert', 'channel=' + channelId, 'actor=' + req.user.id, 'count=' + written)
  res.json({ ok: true, count: written })
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

app.post('/api/media', auth, (req, res) => {
  // accept small single-file uploads into memory, encrypt and store in DB
  const single = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } }).single('file')
  single(req, res, (err) => {
    if (err) {
      const code = err.code === 'LIMIT_FILE_SIZE' ? 'media_too_large' : 'invalid_media'
      return res.status(400).json({ error: code })
    }
    if (!req.file || !req.file.buffer) return res.status(400).json({ error: 'invalid_media' })
    try {
      const originalName = typeof req.file.originalname === 'string' ? req.file.originalname : 'file'
      const id = uuidv4()
      const encrypted = encryptBuffer(req.file.buffer)
      const size = req.file.size || 0
      const insert = db.prepare('INSERT INTO media_files (id, filename, mime, size, owner_id, data, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      insert.run(id, originalName, req.file.mimetype || 'application/octet-stream', size, req.user.id, encrypted, Date.now())
      const payload = {
        id,
        url: `/api/media/${encodeURIComponent(id)}`,
        name: originalName,
        mime: req.file.mimetype || 'application/octet-stream',
        size,
        uploadedAt: Date.now(),
      }
      log('[MEDIA] uploaded -> db', 'user=' + req.user.id, 'id=' + id, 'mime=' + payload.mime)
      res.json({ media: payload })
    } catch (e) {
      logError('[MEDIA] single upload failed', e?.message || e)
      res.status(500).json({ error: 'server_error' })
    }
  })
})

// chunk upload endpoint: receive chunks, assemble when complete and store encrypted in DB
app.post('/api/media/chunk', auth, (req, res) => {
  const single = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } }).single('chunk')
  single(req, res, async (err) => {
    if (err) {
      const code = err.code === 'LIMIT_FILE_SIZE' ? 'media_too_large' : 'invalid_media'
      return res.status(400).json({ error: code })
    }
    if (!req.file || !req.body) return res.status(400).json({ error: 'invalid_chunk' })
    const uploadId = typeof req.body.uploadId === 'string' ? req.body.uploadId.trim() : ''
    const index = Number.isFinite(Number(req.body.index)) ? parseInt(req.body.index, 10) : null
    const total = Number.isFinite(Number(req.body.total)) ? parseInt(req.body.total, 10) : null
    const originalName = typeof req.body.filename === 'string' ? req.body.filename : 'file'
    const mime = typeof req.body.mime === 'string' ? req.body.mime : (req.file.mimetype || 'application/octet-stream')
    if (!uploadId || index === null || total === null) return res.status(400).json({ error: 'invalid_chunk_meta' })
    try {
      const chunkPath = path.join(CHUNKS_DIR, `${uploadId}-${index}`)
      fs.writeFileSync(chunkPath, req.file.buffer)
      log('[MEDIA:chunk] saved', 'user=' + req.user.id, 'upload=' + uploadId, 'index=' + index)
      // check if all chunks received
      const files = fs.readdirSync(CHUNKS_DIR).filter((f) => f.startsWith(uploadId + '-'))
      if (files.length === total) {
        const extension = path.extname(originalName || '').toLowerCase()
        const safeExt = extension && extension.length <= 16 ? extension : ''
        const id = `${uuidv4()}${safeExt}`
        const outputPath = path.join(MEDIA_DIR, id)
        const orderedChunkPaths = []
        let totalSize = 0
        try {
          for (let i = 0; i < total; i += 1) {
            const p = path.join(CHUNKS_DIR, `${uploadId}-${i}`)
            if (!fs.existsSync(p)) throw new Error('missing_chunk_' + i)
            orderedChunkPaths.push(p)
            totalSize += fs.statSync(p).size
          }
          encryptChunksToFile(orderedChunkPaths, outputPath)
          insertStreamMediaStmt.run(id, originalName, mime, totalSize, req.user.id, id, Date.now())
          const payload = { id, url: `/api/media/${encodeURIComponent(id)}`, name: originalName, mime, size: totalSize, uploadedAt: Date.now() }
          log('[MEDIA:chunk] assembled -> encrypted-file', 'user=' + req.user.id, 'id=' + id, 'chunks=' + total, 'size=' + totalSize)
          return res.json({ media: payload })
        } finally {
          for (const f of files) {
            try { fs.unlinkSync(path.join(CHUNKS_DIR, f)) } catch (_) {}
          }
          if (!selectStreamMediaByIdStmt.get(id) && fs.existsSync(outputPath)) {
            try { fs.unlinkSync(outputPath) } catch (_) {}
          }
        }
      }
      return res.json({ ok: true, received: index })
    } catch (e) {
      logError('[MEDIA:chunk] failed', e?.message || e)
      return res.status(500).json({ error: 'server_error' })
    }
  })
})

app.get('/api/media/:name', auth, (req, res) => {
  const raw = typeof req.params?.name === 'string' ? req.params.name : ''
  const safeName = path.basename(raw)
  // try to find media by id in DB (encrypted storage)
  try {
    const row = db.prepare('SELECT id, filename, mime, size, data FROM media_files WHERE id = ?').get(safeName)
    if (row) {
      const decrypted = decryptBuffer(row.data)
      if (req.query?.download === '1') {
        res.setHeader('Content-Disposition', `attachment; filename="${String(row.filename).replace(/"/g, '')}"`)
        res.setHeader('Content-Type', 'application/octet-stream')
      } else {
        res.setHeader('Content-Type', row.mime || 'application/octet-stream')
      }
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      return res.send(decrypted)
    }
  } catch (e) {
    warn('[MEDIA] db lookup failed', e?.message || e)
  }
  // encrypted large-file storage on disk
  try {
    const row = selectStreamMediaByIdStmt.get(safeName)
    if (row?.storage_path) {
      const mediaPath = path.resolve(path.join(MEDIA_DIR, row.storage_path))
      if (!mediaPath.startsWith(path.resolve(MEDIA_DIR))) return res.status(403).json({ error: 'forbidden' })
      if (!fs.existsSync(mediaPath)) return res.status(404).json({ error: 'not_found' })
      if (req.query?.download === '1') {
        res.setHeader('Content-Disposition', `attachment; filename="${String(row.filename).replace(/"/g, '')}"`)
        res.setHeader('Content-Type', 'application/octet-stream')
      } else {
        res.setHeader('Content-Type', row.mime || 'application/octet-stream')
      }
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      return createEncryptedMediaReadStream(mediaPath).pipe(res)
    }
  } catch (e) {
    warn('[MEDIA] stream-file lookup failed', e?.message || e)
  }
  // fallback to file on disk (legacy)
  const mediaPath = path.resolve(path.join(MEDIA_DIR, safeName))
  if (!mediaPath.startsWith(path.resolve(MEDIA_DIR))) return res.status(403).json({ error: 'forbidden' })
  if (!fs.existsSync(mediaPath)) return res.status(404).json({ error: 'not_found' })
  if (req.query?.download === '1') {
    res.setHeader('Content-Disposition', `attachment; filename="${safeName.replace(/"/g, '')}"`)
    res.setHeader('Content-Type', 'application/octet-stream')
  }
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
  res.sendFile(mediaPath)
})

app.post('/api/profile/display-name', auth, (req, res) => {
  const raw = typeof req.body?.displayName === 'string' ? req.body.displayName.trim() : ''
  if (raw && (raw.length < 2 || raw.length > 32)) {
    return res.status(400).json({ error: 'invalid_display_name' })
  }
  updateDisplayNameStmt.run(raw, req.user.id)
  const updated = selectUserById.get(req.user.id)
  const payload = publicUser(updated)
  io.emit('user:update', payload)
  res.json({ user: payload })
})

app.post('/api/profile/status', auth, (req, res) => {
  const raw = typeof req.body?.status === 'string' ? req.body.status.trim() : ''
  if (raw.length > 120) {
    return res.status(400).json({ error: 'invalid_status' })
  }
  updateProfileStatusStmt.run(raw, req.user.id)
  const updated = selectUserById.get(req.user.id)
  const payload = publicUser(updated)
  io.emit('user:update', payload)
  res.json({ user: payload })
})

app.post('/api/profile/background', auth, (req, res) => {
  const raw = typeof req.body?.background === 'string' ? req.body.background.trim() : ''
  if (raw.length > 8000000) {
    return res.status(400).json({ error: 'invalid_background' })
  }
  updateProfileBackgroundStmt.run(raw, req.user.id)
  const updated = selectUserById.get(req.user.id)
  const payload = publicUser(updated)
  io.emit('user:update', payload)
  res.json({ user: payload })
})

app.post('/api/profile/presence-status', auth, (req, res) => {
  const raw = typeof req.body?.status === 'string' ? req.body.status.trim().toLowerCase() : ''
  const allowed = new Set(['online', 'idle', 'dnd', 'invisible'])
  if (!allowed.has(raw)) return res.status(400).json({ error: 'invalid_status' })
  updateUserStatusStmt.run(raw, req.user.id)
  const updated = selectUserById.get(req.user.id)
  const payload = publicUser(updated)
  io.emit('user:update', payload)
  res.json({ user: payload })
})

app.post('/api/profile/name-style', auth, (req, res) => {
  const font = typeof req.body?.font === 'string' ? req.body.font.trim() : ''
  const effect = typeof req.body?.effect === 'string' ? req.body.effect.trim() : ''
  const color = typeof req.body?.color === 'string' ? req.body.color.trim() : ''
  const allowedFonts = new Set(['rubik', 'inter', 'mono', 'serif', 'display', 'georgia'])
  const allowedEffects = new Set(['minimal', 'gradient', 'neon', 'glow', 'outline'])
  const colorOk = /^#[0-9a-fA-F]{6}$/.test(color)
  if (!allowedFonts.has(font) || !allowedEffects.has(effect) || !colorOk) {
    return res.status(400).json({ error: 'invalid_style' })
  }
  const style = { font, effect, color }
  updateNameStyleStmt.run(JSON.stringify(style), req.user.id)
  const updated = selectUserById.get(req.user.id)
  const payload = publicUser(updated)
  io.emit('user:update', payload)
  res.json({ user: payload })
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
  deletePushSubscriptionsByUserStmt.run(id)
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

const imageFileFilter = (_req, file, cb) => {
  if (!file?.mimetype?.startsWith('image/')) {
    cb(new Error('invalid_avatar_type'))
    return
  }
  cb(null, true)
}

const sanitizeForPath = (value, fallback = 'unknown') => {
  if (!value || typeof value !== 'string') return fallback
  const cleaned = value.replace(/[^a-zA-Z0-9_-]/g, '')
  return cleaned || fallback
}

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
  fileFilter: imageFileFilter,
})

const channelAvatarStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const safeId = sanitizeForPath(req.params?.id, 'unknown')
    const target = path.join(CHANNEL_AVATAR_DIR, safeId)
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

const channelAvatarUpload = multer({
  storage: channelAvatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: imageFileFilter,
})

const mediaStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(MEDIA_DIR, { recursive: true })
    cb(null, MEDIA_DIR)
  },
  filename: (_req, file, cb) => {
    const ext = (path.extname(file.originalname || '') || '').toLowerCase()
    const safeBase = sanitizeForPath(path.basename(file.originalname || '', ext), 'media')
    cb(null, `${Date.now()}-${safeBase}-${uuidv4().slice(0, 8)}${ext}`)
  },
})

const mediaUpload = multer({
  storage: mediaStorage,
  limits: { fileSize: 25 * 1024 * 1024 },
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
  if (clearMessageRepliesStmt) clearMessageRepliesStmt.run(message.id)
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
  if (!isEditableMessageContent(message.content)) {
    return res.status(400).json({ error: 'message_not_editable' })
  }
  if (!isEditableMessageContent(rawContent)) {
    return res.status(400).json({ error: 'invalid_message_content' })
  }
  let isChannelOwner = false
  if (!message.channel_id.startsWith('dm:')) {
    const channel = selectChannelByIdStmt.get(message.channel_id)
    if (channel?.created_by && channel.created_by === req.user.id) isChannelOwner = true
  }
  if (message.sender_id !== req.user.id && req.user.role !== 'admin' && !isChannelOwner)
    return res.status(403).json({ error: 'forbidden' })

  let nextReplyId = null
  if (hasMessageReplyColumn) {
    const bodyHasReply = Object.prototype.hasOwnProperty.call(req.body || {}, 'replyTo')
    if (bodyHasReply) {
      const rawReply = req.body.replyTo
      if (rawReply === null || rawReply === '' || typeof rawReply === 'undefined') {
        nextReplyId = null
      } else if (typeof rawReply === 'string') {
        const parent = findMessageById.get(rawReply)
        if (!parent || parent.channel_id !== message.channel_id) return res.status(400).json({ error: 'invalid_reply' })
        nextReplyId = rawReply
      } else {
        return res.status(400).json({ error: 'invalid_reply' })
      }
    } else {
      nextReplyId = message.reply_to ?? null
    }
  }

  const updatedAtRaw = Date.now()
  updateMessageContentStmt(rawContent, updatedAtRaw, nextReplyId, message.id)

  const fresh = selectMessageFullById.get(message.id)
  const payload = publicMessage(fresh)

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
const listMessages = hasMessageReplyColumn
  ? db.prepare(
      `${messageSelectBase} WHERE m.channel_id=? ORDER BY m.created_at DESC LIMIT ? OFFSET ?`,
    )
  : db.prepare('SELECT * FROM messages WHERE channel_id=? ORDER BY created_at DESC LIMIT ? OFFSET ?')

const insertMessage = (() => {
  if (hasMessageReplyColumn && hasMessageUpdatedAtColumn) {
    const stmt = db.prepare(
      'INSERT INTO messages (id,channel_id,sender_id,content,created_at,updated_at,reply_to) VALUES (?,?,?,?,?,0,?)',
    )
    return {
      run: (id, channelId, senderId, content, createdAt, replyTo) => stmt.run(id, channelId, senderId, content, createdAt, replyTo || null),
    }
  }
  if (hasMessageReplyColumn) {
    const stmt = db.prepare(
      'INSERT INTO messages (id,channel_id,sender_id,content,created_at,reply_to) VALUES (?,?,?,?,?,?)',
    )
    return {
      run: (id, channelId, senderId, content, createdAt, replyTo) => stmt.run(id, channelId, senderId, content, createdAt, replyTo || null),
    }
  }
  if (hasMessageUpdatedAtColumn) {
    const stmt = db.prepare('INSERT INTO messages (id,channel_id,sender_id,content,created_at,updated_at) VALUES (?,?,?,?,?,0)')
    return {
      run: (id, channelId, senderId, content, createdAt) => stmt.run(id, channelId, senderId, content, createdAt),
    }
  }
  const stmt = db.prepare('INSERT INTO messages (id,channel_id,sender_id,content,created_at) VALUES (?,?,?,?,?)')
  return {
    run: (id, channelId, senderId, content, createdAt) => stmt.run(id, channelId, senderId, content, createdAt),
  }
})()

const typingState = new Map()
const activeCalls = new Map()
const callByUser = new Map()
const CALL_RING_TIMEOUT_MS = Math.max(15000, parseInt(process.env.CALL_RING_TIMEOUT_MS || '', 10) || 30000)

const publicCallUser = (userId) => {
  const user = selectUserById.get(userId)
  return {
    id: userId,
    username: user?.username || '',
    displayName: user?.display_name || '',
    avatarUrl: user?.avatar_url || '',
    avatarUpdatedAt: user?.avatar_updated_at || 0,
    nameStyle: normalizeNameStyle(user?.name_style ?? ''),
  }
}

const formatCallPayload = (call) => ({
  callId: call.id,
  channelId: call.channelId,
  callerId: call.callerId,
  calleeId: call.calleeId,
  status: call.status,
  createdAt: call.createdAt,
  acceptedAt: call.acceptedAt || 0,
  caller: publicCallUser(call.callerId),
  callee: publicCallUser(call.calleeId),
})

const clearCallTimer = (call) => {
  if (!call?.timeoutId) return
  clearTimeout(call.timeoutId)
  call.timeoutId = null
}

const cleanupCall = (callId) => {
  const call = activeCalls.get(callId)
  if (!call) return null
  clearCallTimer(call)
  activeCalls.delete(callId)
  if (callByUser.get(call.callerId) === callId) callByUser.delete(call.callerId)
  if (callByUser.get(call.calleeId) === callId) callByUser.delete(call.calleeId)
  return call
}

const buildCallHistoryContent = ({ direction, status, durationSec = 0, partnerId = '', endedBy = '' }) =>
  `MSGJSON:${JSON.stringify({
    text: '',
    attachments: [],
    voice: null,
    call: {
      direction,
      status,
      durationSec,
      partnerId,
      endedBy,
    },
  })}`

const isEditableMessageContent = (content) => {
  if (typeof content !== 'string') return false
  const trimmed = content.trim()
  if (!trimmed) return false
  const prefix = 'MSGJSON:'
  if (!trimmed.startsWith(prefix)) return true
  try {
    const parsed = JSON.parse(trimmed.slice(prefix.length))
    const text = typeof parsed?.text === 'string' ? parsed.text.trim() : ''
    const attachments = Array.isArray(parsed?.attachments) ? parsed.attachments : []
    const voice = parsed?.voice && typeof parsed.voice === 'object' ? parsed.voice : null
    const call = parsed?.call && typeof parsed.call === 'object' ? parsed.call : null
    return Boolean(text) && attachments.length === 0 && !voice && !call
  } catch (_) {
    return false
  }
}

const publishCallHistoryMessage = (call, reason, endedBy = null) => {
  if (!call?.channelId || !call.callerId || !call.calleeId) return
  const durationSec = call.acceptedAt ? Math.max(0, Math.round((Date.now() - call.acceptedAt) / 1000)) : 0
  const callerStatus =
    reason === 'missed'
      ? 'missed'
      : reason === 'declined'
        ? 'declined'
        : reason === 'cancelled'
          ? 'cancelled'
          : reason === 'disconnected'
            ? 'disconnected'
            : 'completed'
  const calleeStatus =
    reason === 'missed'
      ? 'missed'
      : reason === 'declined'
        ? 'declined'
        : reason === 'cancelled'
          ? 'cancelled'
          : reason === 'disconnected'
            ? 'disconnected'
            : 'completed'

  const messagesToInsert = [
    {
      senderId: call.callerId,
      content: buildCallHistoryContent({
        direction: 'outgoing',
        status: callerStatus,
        durationSec,
        partnerId: call.calleeId,
        endedBy: endedBy || '',
      }),
    },
    {
      senderId: call.calleeId,
      content: buildCallHistoryContent({
        direction: 'incoming',
        status: calleeStatus,
        durationSec,
        partnerId: call.callerId,
        endedBy: endedBy || '',
      }),
    },
  ]

  const room = io.sockets.adapter.rooms.get(call.channelId) || new Set()
  for (const entry of messagesToInsert) {
    const id = uuidv4()
    const now = Date.now()
    insertMessage.run(id, call.channelId, entry.senderId, entry.content, now, null)
    const inserted = selectMessageFullById.get(id)
    const payload = publicMessage(inserted)
    io.to(call.channelId).emit('message:new', payload)
    ;[call.callerId, call.calleeId].forEach((participantId) => {
      const sid = onlineUsers.get(participantId)
      if (!sid || room.has(sid)) return
      io.to(sid).emit('message:new', payload)
    })
  }
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


io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.auth?.accessToken
  const transport = socket.handshake.query?.transport || socket.conn?.transport?.name || 'unknown'
  const origin = socket.handshake.headers?.origin || '-'
  const forwarded = socket.handshake.headers?.['x-forwarded-for'] || '-'
  const addr = socket.handshake.address || socket.conn?.remoteAddress || '-'
  if (!token) {
    warn('[SOCKET] handshake rejected', 'reason=no_token', 'transport=' + transport, 'origin=' + origin, 'ip=' + addr, 'xff=' + forwarded)
    return next(new Error('no_token'))
  }
  try {
    socket.user = jwt.verify(token, JWT_SECRET)
    if (socket.user.type === 'refresh') {
      warn('[SOCKET] handshake rejected', 'reason=invalid_token_type', 'transport=' + transport, 'origin=' + origin, 'ip=' + addr)
      return next(new Error('invalid_token_type'))
    }
    log('[SOCKET] handshake ok', 'user=' + (socket.user.username || socket.user.id), 'transport=' + transport, 'origin=' + origin, 'ip=' + addr)
    next()
  } catch (e) {
    warn('[SOCKET] handshake rejected', 'reason=invalid_token', e.message, 'transport=' + transport, 'origin=' + origin, 'ip=' + addr)
    next(new Error('invalid_token'))
  }
})

io.engine.on('connection_error', (err) => {
  const context = err?.context || {}
  const origin = context?.request?.headers?.origin || '-'
  const xff = context?.request?.headers?.['x-forwarded-for'] || '-'
  const addr = context?.request?.socket?.remoteAddress || '-'
  warn('[SOCKET:engine] connection_error', 'code=' + (err?.code ?? '-'), 'message=' + (err?.message ?? '-'), 'origin=' + origin, 'ip=' + addr, 'xff=' + xff)
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
  
  // Update session with socket ID when connected
  try {
    const socketIdBase64 = Buffer.from(socket.id).toString('base64')
    db.prepare('UPDATE sessions SET socket_id=?, last_activity_at=? WHERE socket_id OR socket_id IS NULL LIMIT 1').run(socketIdBase64, Date.now())
  } catch (err) {
    warn('[SOCKET] update session failed', err.message)
  }
  
  // Notify all sessions of this user about online status
  const allSessions = selectSessionsByUserStmt.all(userId) || []
  for (const sess of allSessions) {
    if (sess.socket_id) {
      io.to(sess.socket_id).emit('user:online', {
        userId,
        onlineUserIds: Array.from(onlineUsers.keys()),
      })
    }
  }
  
  io.emit('presence:update', { onlineUserIds: Array.from(onlineUsers.keys()) })
  log('[SOCKET] connected', 'user=' + userId, 'socket=' + socket.id)

  const wsId = defaultWs.id

  const leaveMessageRooms = () => {
    for (const room of socket.rooms) {
      if (room === socket.id) continue
      socket.leave(room)
    }
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
    displayName: latestUser?.display_name || latestUser?.displayName || '',
    nameStyle: normalizeNameStyle(latestUser?.name_style ?? latestUser?.nameStyle ?? ''),
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

  const terminateCall = (callId, reason, endedBy = null) => {
    const existing = activeCalls.get(callId)
    if (!existing) return
    publishCallHistoryMessage(existing, reason, endedBy)
    const payload = {
      ...formatCallPayload(existing),
      reason: reason || 'ended',
      endedBy: endedBy || '',
    }
    cleanupCall(callId)
    emitToUser(existing.callerId, 'call:ended', payload)
    emitToUser(existing.calleeId, 'call:ended', payload)
    log('[CALL] ended', 'call=' + callId, 'reason=' + payload.reason, 'by=' + (payload.endedBy || '-'))
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
    const messages = currentChannelId ? publicMessages(listMessages.all(currentChannelId, limit, offset)).reverse() : []
    socket.emit('init:response', { workspaces: [{ id: wsId, name: 'Home' }], channels, activeChannelId: currentChannelId, messages })
  })

  socket.on('channel:switch', ({ channelId }) => {
    if (!channelId) return
    log('[SOCKET] channel:switch', 'user=' + userId, 'channel=' + channelId)
    clearTypingForChannel(currentChannelId)
    if (channelId.startsWith('dm:')) {
      if (!canAccessDirectChannel(channelId, userId)) return
      const normalized = normalizeDirectChannelId(channelId)
      if (!normalized) return
      ensureChannelJoined(normalized)
      const msgs = publicMessages(listMessages.all(normalized, 50, 0)).reverse()
      socket.emit('channel:opened', { channelId: normalized, messages: msgs })
      return
    }
    userRecord = loadUser() || userRecord
    const access = resolveChannelAccess(userRecord, channelId)
    if (!access.allowed) return
    ensureChannelJoined(channelId)
    const msgs = publicMessages(listMessages.all(channelId, 50, 0)).reverse()
    socket.emit('channel:opened', { channelId, messages: msgs })
  })

  socket.on('message:send', ({ channelId, content, replyTo }) => {
    if (!channelId || !content) return
    let targetChannel = channelId
    let directParticipants = null
    if (channelId.startsWith('dm:')) {
      if (!canAccessDirectChannel(channelId, userId)) return
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
    let replyTargetId = null
    if (hasMessageReplyColumn) {
      if (replyTo === null || typeof replyTo === 'undefined' || replyTo === '') {
        replyTargetId = null
      } else if (typeof replyTo === 'string') {
        const parent = findMessageById.get(replyTo)
        if (!parent || parent.channel_id !== targetChannel) return
        replyTargetId = replyTo
      } else {
        return
      }
    }
    const id = uuidv4()
    const now = Date.now()
    insertMessage.run(id, targetChannel, userId, content, now, replyTargetId)
    const inserted = selectMessageFullById.get(id)
    const payload = publicMessage(inserted)
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
    try {
      const senderUser = selectUserById.get(userId)
      const senderName = senderUser?.display_name || senderUser?.username || 'Пользователь'
      const recipients = directParticipants
        ? directParticipants
        : getChannelAudienceUserIds(selectChannelByIdStmt.get(targetChannel))
      const pushRecipients = recipients.filter((id) => id && id !== userId && !onlineUsers.has(id))
      if (pushRecipients.length) {
        const channelName = directParticipants
          ? senderName
          : (selectChannelByIdStmt.get(targetChannel)?.name || 'Чат')
        queuePushForUsers(pushRecipients, {
          messageId: payload.id,
          channelId: targetChannel,
          channelName,
          senderName,
        })
      }
    } catch (err) {
      warn('[PUSH] queue failed', err?.message || err)
    }
    clearTypingForChannel(targetChannel)
  })

  socket.on('messages:load', ({ channelId, limit = 50, offset = 0 }) => {
    if (!channelId) return
    log('[SOCKET] messages:load', 'user=' + userId, 'channel=' + channelId, 'limit=' + limit, 'offset=' + offset)
    let targetChannel = channelId
    if (channelId.startsWith('dm:')) {
      if (!canAccessDirectChannel(channelId, userId)) return
      const normalized = normalizeDirectChannelId(channelId)
      if (!normalized) return
      targetChannel = normalized
    } else {
      userRecord = loadUser() || userRecord
      const access = resolveChannelAccess(userRecord, channelId)
      if (!access.allowed) return
      targetChannel = channelId
    }
    const msgs = publicMessages(listMessages.all(targetChannel, limit, offset)).reverse()
    socket.emit('messages:page', { channelId: targetChannel, messages: msgs, offset, limit })
  })

  socket.on('typing', ({ channelId, state }) => {
    if (!channelId) return
    let targetChannel = channelId
    if (channelId.startsWith('dm:')) {
      if (!canAccessDirectChannel(channelId, userId)) return
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

  socket.on('call:start', ({ channelId } = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {}
    if (!channelId || !channelId.startsWith('dm:')) {
      reply({ ok: false, error: 'direct_call_only' })
      return
    }
    if (!canAccessDirectChannel(channelId, userId)) {
      reply({ ok: false, error: 'forbidden' })
      return
    }
    if (callByUser.has(userId)) {
      reply({ ok: false, error: 'call_busy' })
      return
    }
    const normalizedChannelId = normalizeDirectChannelId(channelId)
    const parsed = parseDirectChannelId(normalizedChannelId)
    const calleeId = parsed?.first === userId ? parsed.second : parsed?.first
    if (!calleeId) {
      reply({ ok: false, error: 'invalid_channel' })
      return
    }
    if (callByUser.has(calleeId)) {
      reply({ ok: false, error: 'peer_busy' })
      return
    }
    const calleeSocketId = onlineUsers.get(calleeId)
    if (!calleeSocketId) {
      reply({ ok: false, error: 'peer_offline' })
      return
    }
    const call = {
      id: uuidv4(),
      channelId: normalizedChannelId,
      callerId: userId,
      calleeId,
      status: 'ringing',
      createdAt: Date.now(),
      acceptedAt: 0,
      timeoutId: null,
    }
    call.timeoutId = setTimeout(() => {
      terminateCall(call.id, 'missed', null)
    }, CALL_RING_TIMEOUT_MS)
    activeCalls.set(call.id, call)
    callByUser.set(call.callerId, call.id)
    callByUser.set(call.calleeId, call.id)
    const payload = formatCallPayload(call)
    socket.emit('call:outgoing', payload)
    emitToUser(calleeId, 'call:incoming', payload)
    log('[CALL] start', 'call=' + call.id, 'caller=' + userId, 'callee=' + calleeId, 'channel=' + normalizedChannelId)
    reply({ ok: true, callId: call.id })
  })

  socket.on('call:accept', ({ callId } = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {}
    const call = activeCalls.get(callId)
    if (!call) {
      reply({ ok: false, error: 'call_not_found' })
      return
    }
    if (call.calleeId !== userId) {
      reply({ ok: false, error: 'forbidden' })
      return
    }
    if (call.status !== 'ringing') {
      reply({ ok: false, error: 'call_not_ringing' })
      return
    }
    call.status = 'accepted'
    call.acceptedAt = Date.now()
    clearCallTimer(call)
    const payload = formatCallPayload(call)
    emitToUser(call.callerId, 'call:accepted', payload)
    emitToUser(call.calleeId, 'call:accepted', payload)
    log('[CALL] accepted', 'call=' + call.id, 'callee=' + userId)
    reply({ ok: true })
  })

  socket.on('call:decline', ({ callId } = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {}
    const call = activeCalls.get(callId)
    if (!call) {
      reply({ ok: false, error: 'call_not_found' })
      return
    }
    if (call.callerId !== userId && call.calleeId !== userId) {
      reply({ ok: false, error: 'forbidden' })
      return
    }
    const reason = call.calleeId === userId ? 'declined' : 'cancelled'
    terminateCall(call.id, reason, userId)
    reply({ ok: true })
  })

  socket.on('call:end', ({ callId } = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {}
    const call = activeCalls.get(callId)
    if (!call) {
      reply({ ok: true })
      return
    }
    if (call.callerId !== userId && call.calleeId !== userId) {
      reply({ ok: false, error: 'forbidden' })
      return
    }
    terminateCall(call.id, 'ended', userId)
    reply({ ok: true })
  })

  socket.on('disconnect', () => {
    const activeCallId = callByUser.get(userId)
    if (activeCallId) {
      const call = activeCalls.get(activeCallId)
      if (call) {
        const reason = call.status === 'accepted' ? 'disconnected' : 'cancelled'
        terminateCall(activeCallId, reason, userId)
      } else {
        callByUser.delete(userId)
      }
    }
    
    // Clear socket_id from sessions when disconnecting
    try {
      db.prepare('UPDATE sessions SET socket_id=NULL, last_activity_at=? WHERE socket_id AND socket_id=?')
        .run(Date.now(), Buffer.from(socket.id).toString('base64'))
    } catch (err) {
      warn('[SOCKET] clear session socket_id failed', err.message)
    }
    
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

  emitChannelListForUser(userId)
})

process.on('unhandledRejection', (reason) => {
  logError('Unhandled rejection', reason)
})

process.on('uncaughtException', (err) => {
  logError('Uncaught exception', err?.stack || err?.message || err)
})

process.on('warning', (warning) => {
  warn('Process warning', warning?.name || 'Warning', warning?.message || '')
})

server.listen(PORT, () => {
  log('Server listening on', PORT)
  log('[BOOT] CORS origins =', origins.join(','))
  log('[BOOT] NODE_ENV =', process.env.NODE_ENV || 'development')
  log('[BOOT] uploads dir =', path.resolve(UPLOAD_DIR))
})



