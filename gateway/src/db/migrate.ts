/**
 * Database Migration Script
 * Runs all pending migrations
 */

import { getDatabase, runMigrations } from './database.js';

function migrate() {
  console.log('Running database migrations...');

  try {
    getDatabase(); // Initialize database
    runMigrations();
    console.log('Migrations complete!');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
