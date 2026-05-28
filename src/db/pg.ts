/**
 * PostgreSQL Connection Pool
 * Manages database connections with automatic retries
 */

import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

export const pool = new Pool({
  host: config.postgres.host,
  port: config.postgres.port,
  database: config.postgres.database,
  user: config.postgres.user,
  password: config.postgres.password,
  max: config.postgres.max,
  idleTimeoutMillis: config.postgres.idleTimeoutMillis,
  connectionTimeoutMillis: config.postgres.connectionTimeoutMillis,
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL pool error:', err);
});

pool.on('connect', () => {
  console.log('🔌 PostgreSQL client connected');
});

/**
 * Test database connection
 * @throws Error if connection fails
 */
export async function testConnection(): Promise<void> {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT NOW() as now, version() as version');
    const { now, version } = result.rows[0];
    console.log('✅ PostgreSQL connected');
    console.log(`   Time: ${now}`);
    console.log(`   Version: ${version.split(' ')[0]} ${version.split(' ')[1]}`);
  } finally {
    client.release();
  }
}

/**
 * Query helper with error logging
 */
export async function query<T extends pg.QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<pg.QueryResult<T>> {
  const start = Date.now();
  try {
    const result = await pool.query<T>(text, params);
    const duration = Date.now() - start;
    if (duration > 100) {
      console.warn(`⚠️  Slow query (${duration}ms): ${text.substring(0, 100)}...`);
    }
    return result;
  } catch (err) {
    console.error('❌ Query error:', text, err);
    throw err;
  }
}

/**
 * Graceful shutdown
 */
export async function close(): Promise<void> {
  await pool.end();
  console.log('📴 PostgreSQL pool closed');
}
