import path from "node:path";
import { defineConfig } from "prisma/config";

/**
 * Banco local: arquivo SQLite na raiz do projeto (achei.db).
 * Em produção (Vercel) use Turso: defina TURSO_DATABASE_URL e TURSO_AUTH_TOKEN.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.TURSO_DATABASE_URL ?? `file:${path.join(process.cwd(), "achei.db")}`,
  },
});
