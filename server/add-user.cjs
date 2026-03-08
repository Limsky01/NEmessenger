const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const db = new Database('messenger_v4.db');

const username = 'NeVoit';
const password = '3451';
const role = 'admin';

// Generate hashed password
const saltRounds = 10;
const passwordHash = bcrypt.hashSync(password, saltRounds);

// Generate user ID
const userId = uuidv4();

try {
  const stmt = db.prepare(`
    INSERT INTO users (id, username, password_hash, role)
    VALUES (?, ?, ?, ?)
  `);
  
  stmt.run(userId, username, passwordHash, role);
  
  console.log(`✓ Пользователь создан успешно!`);
  console.log(`  ID: ${userId}`);
  console.log(`  Username: ${username}`);
  console.log(`  Role: ${role}`);
  console.log(`  Password: ${password}`);
} catch (error) {
  if (error.message.includes('UNIQUE constraint failed')) {
    console.error(`✗ Ошибка: пользователь "${username}" уже существует`);
  } else {
    console.error('✗ Ошибка при создании пользователя:', error.message);
  }
  process.exit(1);
}

db.close();
