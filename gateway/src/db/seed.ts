/**
 * Database Seed Script
 * Creates initial admin user
 */

import { getDatabase } from './database.js';
import { createUser, getUserByUsername } from './users.js';

async function seed() {
  console.log('Initializing database...');
  getDatabase(); // Initialize database

  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminUsername || !adminPassword) {
    console.error('ADMIN_USERNAME and ADMIN_PASSWORD environment variables are required');
    process.exit(1);
  }

  if (adminPassword.length < 8) {
    console.error('ADMIN_PASSWORD must be at least 8 characters');
    process.exit(1);
  }

  // Check if admin already exists
  const existingAdmin = getUserByUsername(adminUsername);
  if (existingAdmin) {
    console.log(`User '${adminUsername}' already exists, skipping...`);
    return;
  }

  // Create admin user
  console.log(`Creating admin user '${adminUsername}'...`);
  const user = await createUser(adminUsername, adminPassword, 'admin');
  console.log(`Admin user created with ID: ${user.id}`);

  console.log('Seed complete!');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
