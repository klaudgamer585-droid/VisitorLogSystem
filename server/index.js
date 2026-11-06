import 'dotenv/config';
import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pool from './db.js';
import { RETURNING_PROFILES, SAMPLE_VISITORS } from './seed-data.js';
import { formatVisitor, validateVisitor } from './visitors.js';

const app = express();
const port = Number(process.env.API_PORT || 3001);
const host = process.env.API_HOST || '127.0.0.1';
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const staticDirectory = path.join(projectRoot, 'dist');
app.use(express.json({ limit: '16kb' }));
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'",
  });
  next();
});

function sendError(res, error, fallbackMessage) {
  console.error(fallbackMessage, error);
  const validationError = error.statusCode === 400;
  res.status(validationError ? 400 : 500).json({
    error: validationError ? error.message : fallbackMessage,
  });
}

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    sendError(res, error, 'Could not connect to the visitor database.');
  }
});

app.get('/api/profiles', async (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);

  try {
    const [rows] = search
      ? await pool.execute(
        `SELECT full_name, last_purpose
         FROM visitor_profiles
         WHERE full_name LIKE CONCAT('%', ?, '%')
         ORDER BY updated_at DESC, full_name ASC
         LIMIT ?`,
        [search.replace(/[\\%_]/g, '\\$&'), limit],
      )
      : await pool.execute(
        `SELECT full_name, last_purpose
         FROM visitor_profiles
         ORDER BY updated_at DESC, full_name ASC
         LIMIT ?`,
        [limit],
      );

    res.json(rows.map((row) => ({
      name: row.full_name,
      contact: '',
      purpose: row.last_purpose,
    })));
  } catch (error) {
    sendError(res, error, 'Could not load visitor profiles.');
  }
});

app.get('/api/visitors/active', async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT v.id, p.full_name, p.contact_number, v.purpose,
        DATE_FORMAT(v.checked_in_at, '%d %b %Y - %h:%i %p') AS entry_time
      FROM visitor_visits v
      JOIN visitor_profiles p ON p.id = v.profile_id
      WHERE v.checked_out_at IS NULL
      ORDER BY v.checked_in_at DESC, v.id DESC
    `);
    res.json(rows.map(formatVisitor));
  } catch (error) {
    sendError(res, error, 'Could not load active visitors.');
  }
});

app.get('/api/visitors/roster', async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT v.id, p.full_name, p.contact_number, v.purpose,
        DATE_FORMAT(v.checked_in_at, '%d %b %Y - %h:%i %p') AS entry_time,
        DATE_FORMAT(v.checked_out_at, '%d %b %Y - %h:%i %p') AS checkout_time,
        CASE WHEN v.checked_out_at IS NULL THEN 'Inside' ELSE 'Checked out' END AS status
      FROM visitor_visits v
      JOIN visitor_profiles p ON p.id = v.profile_id
      ORDER BY v.checked_in_at DESC, v.id DESC
    `);
    res.json(rows.map((row) => ({
      id: String(row.id),
      name: row.full_name,
      contact: row.contact_number,
      purpose: row.purpose,
      entryTime: row.entry_time,
      checkoutTime: row.checkout_time,
      status: row.status,
    })));
  } catch (error) {
    sendError(res, error, 'Could not load the visitor roster.');
  }
});

app.post('/api/visitors/check-in', async (req, res) => {
  let connection;
  try {
    const { fullName, contact, purpose } = validateVisitor(req.body);
    connection = await pool.getConnection();
    await connection.beginTransaction();

    await connection.execute(
      `INSERT INTO visitor_profiles (full_name, contact_number, last_purpose)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         contact_number = VALUES(contact_number),
         last_purpose = VALUES(last_purpose),
         updated_at = CURRENT_TIMESTAMP`,
      [fullName, contact, purpose],
    );

    const [profiles] = await connection.execute(
      'SELECT id FROM visitor_profiles WHERE full_name = ?',
      [fullName],
    );
    const [result] = await connection.execute(
      'INSERT INTO visitor_visits (profile_id, purpose, checked_in_at) VALUES (?, ?, NOW())',
      [profiles[0].id, purpose],
    );
    const [visits] = await connection.execute(`
      SELECT v.id, p.full_name, p.contact_number, v.purpose,
        DATE_FORMAT(v.checked_in_at, '%d %b %Y - %h:%i %p') AS entry_time
      FROM visitor_visits v
      JOIN visitor_profiles p ON p.id = v.profile_id
      WHERE v.id = ?
    `, [result.insertId]);

    await connection.commit();
    res.status(201).json(formatVisitor(visits[0]));
  } catch (error) {
    if (connection) await connection.rollback();
    sendError(res, error, 'Could not check in this visitor.');
  } finally {
    connection?.release();
  }
});

app.post('/api/visitors/check-out-by-name', async (req, res) => {
  const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim() : '';
  if (!fullName || fullName.length > 120) {
    return res.status(400).json({ error: 'Enter the full name used at check-in.' });
  }

  try {
    const [visits] = await pool.execute(
      `SELECT v.id
       FROM visitor_visits v
       JOIN visitor_profiles p ON p.id = v.profile_id
       WHERE LOWER(p.full_name) = LOWER(?) AND v.checked_out_at IS NULL
       ORDER BY v.checked_in_at DESC, v.id DESC
       LIMIT 1`,
      [fullName],
    );
    if (visits.length === 0) {
      return res.status(404).json({ error: 'No active record found matching that name.' });
    }
    const [result] = await pool.execute(
      'UPDATE visitor_visits SET checked_out_at = NOW() WHERE id = ? AND checked_out_at IS NULL',
      [visits[0].id],
    );
    if (result.affectedRows !== 1) {
      return res.status(404).json({ error: 'No active record found matching that name.' });
    }
    res.json({ checkedOut: true });
  } catch (error) {
    sendError(res, error, 'Could not check out this visitor.');
  }
});

app.post('/api/visitors/:id/check-out', async (req, res) => {
  try {
    const [result] = await pool.execute(
      `UPDATE visitor_visits
       SET checked_out_at = NOW()
       WHERE id = ? AND checked_out_at IS NULL`,
      [req.params.id],
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'No active record found matching that visitor.' });
    }
    res.json({ checkedOut: true });
  } catch (error) {
    sendError(res, error, 'Could not check out this visitor.');
  }
});

app.post('/api/visitors/reset-samples', async (_req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    await connection.query(
      'UPDATE visitor_visits SET checked_out_at = NOW() WHERE checked_out_at IS NULL',
    );

    for (const visitor of SAMPLE_VISITORS) {
      const [profiles] = await connection.execute(
        'SELECT id FROM visitor_profiles WHERE full_name = ?',
        [visitor.name],
      );
      if (profiles.length === 0) {
        const seedProfile = RETURNING_PROFILES.find((profile) => profile.name === visitor.name);
        const [result] = await connection.execute(
          `INSERT INTO visitor_profiles (full_name, contact_number, last_purpose)
           VALUES (?, ?, ?)`,
          [seedProfile.name, seedProfile.contact, seedProfile.purpose],
        );
        profiles.push({ id: result.insertId });
      }
      await connection.execute(
        'INSERT INTO visitor_visits (profile_id, purpose, checked_in_at) VALUES (?, ?, ?)',
        [profiles[0].id, visitor.purpose, visitor.entryTime],
      );
    }

    await connection.commit();
    res.json({ reset: true });
  } catch (error) {
    if (connection) await connection.rollback();
    sendError(res, error, 'Could not restore the sample visitor roster.');
  } finally {
    connection?.release();
  }
});

if (existsSync(staticDirectory)) {
  app.use(express.static(staticDirectory, { index: false, maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(staticDirectory, 'index.html'));
  });
}

async function start() {
  await pool.query('SELECT 1');
  app.listen(port, host, () => {
    console.log(`VisitorLog listening at http://${host}:${port}`);
  });
}

start().catch((error) => {
  console.error('VisitorLog API could not connect to MariaDB. Run "npm run db:setup" and verify that MariaDB is running.', error.message);
  process.exitCode = 1;
});
