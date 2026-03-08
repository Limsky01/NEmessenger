const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const db = new Database('messenger_v4.db');

const username = 'NeVoit';
const password = '3451';
const role = 'admin';

// Generate hashed password
const saltRounds = 10;
const passwordHash = bcrypt.hashSync(password, saltRounds);

try {
  const stmt = db.prepare(`
    UPDATE users
    SET password_hash = ?, role = ?
    WHERE username = ?
  `);
  
  const result = stmt.run(passwordHash, role, username);
  
  if (result.changes > 0) {
    console.log(`✓ Пользователь обновлён успешно!`);
    console.log(`  Username: ${username}`);
    console.log(`  Role: ${role}`);
    console.log(`  Password: ${password}`);
  } else {
    console.error(`✗ Пользователь "${username}" не найден`);
    process.exit(1);
  }
} catch (error) {
  console.error('✗ Ошибка при обновлении пользователя:', error.message);
  process.exit(1);
}

db.close();
