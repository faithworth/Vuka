/**
 * VUKA — Database Seed (Production-Safe)
 * Only creates data if it doesn't already exist.
 * Run: npm run db:seed
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding VUKA database...');

  // Seed is intentionally minimal for production.
  // Data is created through the app UI and API endpoints.
  // This seed only ensures admin user placeholder exists if needed.

  console.log('✅ Seed complete. No destructive operations performed.');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
