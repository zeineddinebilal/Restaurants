import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (addr && typeof addr === "object") {
        const p = addr.port;
        srv.close(() => resolve(p));
      } else {
        srv.close(() => reject(new Error("Could not determine free port")));
      }
    });
    srv.on("error", reject);
  });
}

export async function startEphemeralPrismaPostgres() {
  const pg = new PGlite();
  const migrationsDir = path.join(process.cwd(), "prisma", "migrations");
  const dirs = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  for (const dir of dirs) {
    const sql = fs.readFileSync(path.join(migrationsDir, dir, "migration.sql"), "utf8");
    await pg.exec(sql);
  }

  const port = await findFreePort();
  const server = new PGLiteSocketServer({
    db: pg,
    host: "127.0.0.1",
    port,
    maxConnections: 20,
  });
  await server.start();

  const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable&connection_limit=1`;
  const prisma = new PrismaClient({
    datasources: {
      db: { url: databaseUrl },
    },
  });

  return {
    pg,
    server,
    prisma,
    databaseUrl,
    async stop() {
      await prisma.$disconnect();
      await server.stop();
      await pg.close();
    },
  };
}
