import bcrypt from 'bcrypt';
import { queryOne, queryAll, runQuery } from './database.js';
import type { User } from '../../types/index.js';
import { config } from '../config.js';

const SALT_ROUNDS = 12;

// =============================================================================
// DATABASE ROW TYPES
// =============================================================================

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  role: string;
  created_at: string;
  last_login_at: string | null;
}

interface SessionRow {
  id: string;
  user_id: number;
  created_at: string;
  expires_at: string;
  revoked: number;
}

// =============================================================================
// MAPPERS
// =============================================================================

function mapUserRow(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    role: row.role as 'admin' | 'user',
    createdAt: new Date(row.created_at),
    lastLoginAt: row.last_login_at ? new Date(row.last_login_at) : undefined,
  };
}

// =============================================================================
// USER OPERATIONS
// =============================================================================

export async function createUser(
  username: string,
  password: string,
  role: 'admin' | 'user' = 'user'
): Promise<User> {
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  runQuery(
    'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
    [username, passwordHash, role]
  );

  const user = getUserByUsername(username);
  if (!user) throw new Error('Failed to create user');

  return user;
}

export function getUserById(id: number): User | undefined {
  const row = queryOne<UserRow>('SELECT * FROM users WHERE id = ?', [id]);
  return row ? mapUserRow(row) : undefined;
}

export function getUserByUsername(username: string): User | undefined {
  const row = queryOne<UserRow>('SELECT * FROM users WHERE username = ?', [username]);
  return row ? mapUserRow(row) : undefined;
}

export async function verifyPassword(username: string, password: string): Promise<User | null> {
  const row = queryOne<UserRow>('SELECT * FROM users WHERE username = ?', [username]);
  if (!row) return null;

  const valid = await bcrypt.compare(password, row.password_hash);
  if (!valid) return null;

  // Update last login time
  runQuery('UPDATE users SET last_login_at = ? WHERE id = ?', [
    new Date().toISOString(),
    row.id,
  ]);

  return mapUserRow(row);
}

export function listUsers(): User[] {
  const rows = queryAll<UserRow>('SELECT * FROM users ORDER BY created_at DESC');
  return rows.map(mapUserRow);
}

export async function updateUserPassword(userId: number, newPassword: string): Promise<void> {
  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  runQuery('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, userId]);
}

export function deleteUser(userId: number): boolean {
  const result = runQuery('DELETE FROM users WHERE id = ?', [userId]);
  return result.changes > 0;
}

// =============================================================================
// SESSION OPERATIONS
// =============================================================================

export function createSession(
  sessionId: string,
  userId: number,
  expiresAt: Date
): void {
  runQuery(
    'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)',
    [sessionId, userId, expiresAt.toISOString()]
  );
}

export function isSessionValid(sessionId: string): boolean {
  const row = queryOne<SessionRow>(
    'SELECT * FROM sessions WHERE id = ? AND revoked = 0 AND expires_at > ?',
    [sessionId, new Date().toISOString()]
  );
  return !!row;
}

export function revokeSession(sessionId: string): void {
  runQuery('UPDATE sessions SET revoked = 1 WHERE id = ?', [sessionId]);
}

export function revokeAllUserSessions(userId: number): void {
  runQuery('UPDATE sessions SET revoked = 1 WHERE user_id = ?', [userId]);
}

export function cleanupExpiredSessions(): number {
  const result = runQuery('DELETE FROM sessions WHERE expires_at < ?', [
    new Date().toISOString(),
  ]);
  return result.changes;
}

// =============================================================================
// INITIALIZATION
// =============================================================================

export async function ensureAdminUser(): Promise<void> {
  const existingAdmin = getUserByUsername(config.adminUsername);
  if (existingAdmin) {
    return;
  }

  console.log(`Creating default admin user: ${config.adminUsername}`);
  await createUser(config.adminUsername, config.adminPassword, 'admin');
  console.log('Default admin user created successfully');
}
