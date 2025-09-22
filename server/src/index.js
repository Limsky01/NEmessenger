import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import http from 'http';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

const app = express();
const server = http.createServer(app);
const origins = process.env.ORIGIN ? process.env.ORIGIN.split(',').map(s=>s.trim()) : ['*'];
const io = new Server(server, { cors: { origin: origins, methods: ['GET','POST'] } });

app.use(cors({ origin: origins, credentials: true }));
app.use(express.json());

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

const db = new Database('messenger.db');
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    avatar_seed TEXT
  );
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    name TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS conversation_members (
    conversation_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    PRIMARY KEY (conversation_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`);

let globalConv = db.prepare("SELECT id FROM conversations WHERE type='global' LIMIT 1").get();
if (!globalConv) {
  const id = uuidv4();
  db.prepare("INSERT INTO conversations (id,type,name,created_at) VALUES (?,?,?,?)")
    .run(id, 'global', 'Global Chat', Date.now());
  globalConv = { id };
}

const publicUser = (u) => ({ id: u.id, username: u.username, avatar_seed: u.avatar_seed });
const getUserByUsername = db.prepare("SELECT * FROM users WHERE username = ?");

app.post('/api/register', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  const id = uuidv4();
  const hash = bcrypt.hashSync(password, 10);
  try {
    db.prepare("INSERT INTO users (id, username, password_hash, avatar_seed) VALUES (?,?,?,?)")
      .run(id, username, hash, username);
  } catch (e) {
    return res.status(400).json({ error: 'username_taken' });
  }
  const token = jwt.sign({ id, username }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id, username } });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const u = getUserByUsername.get(username);
  if (!u) return res.status(401).json({ error: 'invalid_credentials' });
  if (!bcrypt.compareSync(password, u.password_hash)) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }
  const token = jwt.sign({ id: u.id, username: u.username }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: publicUser(u) });
});

app.get('/api/users', (req, res) => {
  res.json({ users: db.prepare("SELECT id, username, avatar_seed FROM users ORDER BY username ASC").all() });
});

const onlineUsers = new Map();
const typingState = new Map();

const listMessages = db.prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?");
const insertMessage = db.prepare("INSERT INTO messages (id,conversation_id,sender_id,content,created_at) VALUES (?,?,?,?,?)");

const createDmConversation = (uid1, uid2) => {
  const pair = [uid1, uid2].sort().join(':');
  const existing = db.prepare("SELECT * FROM conversations WHERE type='dm' AND name=?").get(pair);
  if (existing) return existing.id;
  const id = uuidv4();
  const now = Date.now();
  db.prepare("INSERT INTO conversations (id,type,name,created_at) VALUES (?,?,?,?)").run(id, 'dm', pair, now);
  db.prepare("INSERT INTO conversation_members (conversation_id,user_id) VALUES (?,?)").run(id, uid1);
  db.prepare("INSERT INTO conversation_members (conversation_id,user_id) VALUES (?,?)").run(id, uid2);
  return id;
};

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('no_token'));
  try { socket.user = jwt.verify(token, JWT_SECRET); next(); }
  catch (e) { next(new Error('invalid_token')); }
});

io.on('connection', (socket) => {
  const userId = socket.user.id;
  onlineUsers.set(userId, socket.id);
  socket.join(globalConv.id);
  io.emit('presence:update', { onlineUserIds: Array.from(onlineUsers.keys()) });

  socket.on('init:request', ({ limit = 50, offset = 0 } = {}) => {
    const msgs = listMessages.all(globalConv.id, limit, offset).reverse();
    socket.emit('init:response', { globalConversationId: globalConv.id, messages: msgs });
  });

  socket.on('message:send', ({ conversationId, content }) => {
    if (!content || !conversationId) return;
    const id = uuidv4();
    const now = Date.now();
    insertMessage.run(id, conversationId, userId, content, now);
    const payload = { id, conversationId, senderId: userId, content, createdAt: now };
    io.to(conversationId).emit('message:new', payload);
  });

  socket.on('typing', ({ conversationId, isTyping }) => {
    if (!conversationId) return;
    if (!typingState.has(conversationId)) typingState.set(conversationId, new Set());
    const set = typingState.get(conversationId);
    if (isTyping) set.add(userId); else set.delete(userId);
    socket.to(conversationId).emit('typing:update', { conversationId, userIds: Array.from(set) });
  });

  socket.on('dm:open', ({ userId: otherId }) => {
    if (!otherId) return;
    const convId = createDmConversation(userId, otherId);
    socket.join(convId);
    const msgs = listMessages.all(convId, 50, 0).reverse();
    socket.emit('dm:opened', { conversationId: convId, messages: msgs });
  });

  socket.on('messages:load', ({ conversationId, limit = 50, offset = 0 }) => {
    const msgs = listMessages.all(conversationId, limit, offset).reverse();
    socket.emit('messages:page', { conversationId, messages: msgs, offset, limit });
  });

  socket.on('join:conversation', ({ conversationId }) => { if (conversationId) socket.join(conversationId); });

  socket.on('disconnect', () => {
    onlineUsers.delete(userId);
    io.emit('presence:update', { onlineUserIds: Array.from(onlineUsers.keys()) });
  });
});

server.listen(PORT, () => {
  console.log('Server listening on ' + PORT);
});
