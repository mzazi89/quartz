// ─────────────────────────────────────────────────────────────────────────────
// Prisma Client — singleton instance for Neon PostgreSQL
// ─────────────────────────────────────────────────────────────────────────────
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: ['error'],
});

module.exports = prisma;
