import Database from 'better-sqlite3';
import { readFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { config } from '../config.js';

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!db) {
    // Ensure directory exists
    const dbDir = dirname(config.dbPath);
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }

    db = new Database(config.dbPath);

    // Enable WAL mode for better concurrent read performance
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('synchronous = NORMAL');
    db.pragma('cache_size = -10000'); // 10MB cache
    db.pragma('temp_store = MEMORY');
  }

  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export function runMigrations(): void {
  const database = getDatabase();

  // Get current directory for migrations
  // From dist/src/db/database.js, go up 3 levels to /app, then to migrations/
  const migrationsDir = join(dirname(new URL(import.meta.url).pathname), '../../../migrations');

  // Check if migrations table exists
  const tableExists = database
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'")
    .get();

  if (!tableExists) {
    database.exec(`
      CREATE TABLE migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  // Get applied migrations
  const appliedMigrations = database.prepare('SELECT name FROM migrations').all() as {
    name: string;
  }[];
  const appliedSet = new Set(appliedMigrations.map((m) => m.name));

  // Find and apply pending migrations - automatically discover all .sql files
  if (!existsSync(migrationsDir)) {
    console.warn(`Migrations directory not found: ${migrationsDir}`);
    return;
  }

  const migrationFiles = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort(); // Sort alphabetically to ensure proper execution order (001_, 002_, etc.)

  for (const file of migrationFiles) {
    if (appliedSet.has(file)) {
      continue;
    }

    const migrationPath = join(migrationsDir, file);
    if (!existsSync(migrationPath)) {
      console.warn(`Migration file not found: ${migrationPath}`);
      continue;
    }

    const sql = readFileSync(migrationPath, 'utf-8');

    console.log(`Applying migration: ${file}`);

    database.exec(sql);
    database.prepare('INSERT INTO migrations (name) VALUES (?)').run(file);

    console.log(`Applied migration: ${file}`);
  }
}

// Type-safe query helpers
export function queryOne<T>(sql: string, params?: unknown[]): T | undefined {
  const stmt = getDatabase().prepare(sql);
  return (params ? stmt.get(...params) : stmt.get()) as T | undefined;
}

export function queryAll<T>(sql: string, params?: unknown[]): T[] {
  const stmt = getDatabase().prepare(sql);
  return (params ? stmt.all(...params) : stmt.all()) as T[];
}

export function runQuery(sql: string, params?: unknown[]): Database.RunResult {
  const stmt = getDatabase().prepare(sql);
  return params ? stmt.run(...params) : stmt.run();
}

export function transaction<T>(fn: () => T): T {
  const database = getDatabase();
  return database.transaction(fn)();
}
