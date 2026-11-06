import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createConnection } from 'mysql2/promise';
import { RETURNING_PROFILES, SAMPLE_VISITORS } from './seed-data.js';

const database = process.env.MARIADB_DATABASE || 'visitorlog';
const appUser = process.env.MARIADB_USER || 'visitorlog_app';
const appHost = process.env.MARIADB_HOST || '127.0.0.1';
const appPassword = process.env.MARIADB_PASSWORD || randomBytes(32).toString('base64url');
const envPath = new URL('../.env', import.meta.url);

function quoteIdentifier(identifier) {
  if (!/^[a-zA-Z0-9_]+$/.test(identifier)) {
    throw new Error('Database and user names may only contain letters, numbers, and underscores.');
  }
  return `\`${identifier}\``;
}

async function setup() {
  const connection = await createConnection({
    host: process.env.MARIADB_ADMIN_HOST || '127.0.0.1',
    port: Number(process.env.MARIADB_PORT || 3306),
    user: process.env.MARIADB_ADMIN_USER || 'root',
    password: process.env.MARIADB_ADMIN_PASSWORD || '',
    charset: 'utf8mb4',
  });

  try {
    const databaseName = quoteIdentifier(database);
    const userName = connection.escape(appUser);
    const userHost = connection.escape(appHost);
    const password = connection.escape(appPassword);

    await connection.query(`CREATE DATABASE IF NOT EXISTS ${databaseName} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await connection.query(`CREATE USER IF NOT EXISTS ${userName}@${userHost} IDENTIFIED BY ${password}`);
    await connection.query(`ALTER USER ${userName}@${userHost} IDENTIFIED BY ${password}`);
    await connection.query(`GRANT SELECT, INSERT, UPDATE ON ${databaseName}.* TO ${userName}@${userHost}`);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS ${databaseName}.visitor_profiles (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        full_name VARCHAR(120) NOT NULL,
        contact_number VARCHAR(50) NOT NULL,
        last_purpose VARCHAR(100) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_visitor_profiles_full_name (full_name),
        KEY ix_visitor_profiles_updated_at (updated_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS ${databaseName}.visitor_visits (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        profile_id BIGINT UNSIGNED NOT NULL,
        purpose VARCHAR(100) NOT NULL,
        checked_in_at DATETIME NOT NULL,
        checked_out_at DATETIME NULL,
        CONSTRAINT fk_visitor_visits_profile
          FOREIGN KEY (profile_id) REFERENCES ${databaseName}.visitor_profiles(id),
        KEY ix_visitor_visits_active (checked_out_at, checked_in_at),
        KEY ix_visitor_visits_profile (profile_id, checked_in_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    for (const profile of RETURNING_PROFILES) {
      await connection.execute(
        `INSERT IGNORE INTO ${databaseName}.visitor_profiles (full_name, contact_number, last_purpose)
         VALUES (?, ?, ?)`,
        [profile.name, profile.contact, profile.purpose],
      );
    }

    const [[{ visitCount }]] = await connection.query(
      `SELECT COUNT(*) AS visitCount FROM ${databaseName}.visitor_visits`,
    );

    if (Number(visitCount) === 0) {
      for (const visitor of SAMPLE_VISITORS) {
        await connection.execute(
          `INSERT INTO ${databaseName}.visitor_visits (profile_id, purpose, checked_in_at)
           SELECT id, ?, ? FROM ${databaseName}.visitor_profiles WHERE full_name = ?`,
          [visitor.purpose, visitor.entryTime, visitor.name],
        );
      }
    }

    const settings = {
      MARIADB_HOST: appHost,
      MARIADB_PORT: process.env.MARIADB_PORT || 3306,
      MARIADB_DATABASE: database,
      MARIADB_USER: appUser,
      MARIADB_PASSWORD: appPassword,
      MARIADB_ADMIN_USER: process.env.MARIADB_ADMIN_USER || 'root',
      MARIADB_ADMIN_PASSWORD: process.env.MARIADB_ADMIN_PASSWORD || '',
      API_PORT: process.env.API_PORT || 3001,
    };
    const envContents = Object.entries(settings)
      .map(([key, value]) => `${key}=${JSON.stringify(String(value))}`)
      .join('\n') + '\n';
    writeFileSync(envPath, envContents, { encoding: 'utf8', mode: 0o600 });

    console.log(`MariaDB database "${database}" is ready.`);
    console.log('The application account has SELECT, INSERT, and UPDATE access only.');
    console.log(`Database settings saved to ${fileURLToPath(envPath)}`);
  } finally {
    await connection.end();
  }
}

setup().catch((error) => {
  console.error('MariaDB setup failed:', error.message);
  process.exitCode = 1;
});
