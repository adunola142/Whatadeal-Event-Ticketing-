const fs = require('fs');
const crypto = require('crypto');
const { Client } = require('pg');
require('dotenv').config();

async function main() {
  const migrationDir = 'prisma/migrations/20261111120000_password_change_and_platform_settings';
  const migrationName = '20261111120000_password_change_and_platform_settings';
  const sql = fs.readFileSync(`${migrationDir}/migration.sql`, 'utf8');
  const checksum = crypto.createHash('sha256').update(sql).digest('hex');

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    // Already applied?
    const existing = await client.query(
      `SELECT migration_name FROM _prisma_migrations WHERE migration_name = $1`,
      [migrationName],
    );
    if (existing.rows.length > 0) {
      console.log('Already recorded as applied:', migrationName);
      return;
    }

    await client.query('BEGIN');
    // Run each statement (split on blank-line-separated blocks is risky; Prisma
    // migration.sql here has no semicolons inside strings, so a plain split on
    // ';' followed by optional whitespace is safe for this file).
    const statements = sql
      .split(/;\s*(?:\n|$)/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) {
      await client.query(stmt);
    }

    await client.query(
      `INSERT INTO _prisma_migrations
        (id, checksum, migration_name, logs, rolled_back_at, started_at, applied_steps_count, finished_at)
       VALUES ($1, $2, $3, NULL, NULL, now(), 1, now())`,
      [crypto.randomUUID(), checksum, migrationName],
    );
    await client.query('COMMIT');
    console.log('Applied and recorded migration:', migrationName);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
