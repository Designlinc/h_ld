// lib/db.js — Neon Postgres connection
import { neon } from '@neondatabase/serverless';
 
const sql = process.env.DATABASE_URL
  ? neon(process.env.DATABASE_URL)
  : () => { throw new Error('DATABASE_URL is not configured'); };
 
export default sql;
 
// Helper: run a query and return rows
export async function query(strings, ...values) {
  try {
    return await sql(strings, ...values);
  } catch (err) {
    console.error('DB query error:', err);
    throw err;
  }
}
 
