import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const pgPort = Number(process.env.E2E_PG_PORT || "5499");
const webPort = Number(process.env.E2E_WEB_PORT || "3100");

function runAsyncChild(command, args, env) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { env, stdio: "inherit" });
    proc.on("error", reject);
    proc.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Child exited with code ${code}`));
    });
  });
}

async function main() {
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

  const pgServer = new PGLiteSocketServer({
    db: pg,
    host: "127.0.0.1",
    port: pgPort,
    maxConnections: 20,
  });
  await pgServer.start();
  console.log(`✔ E2E PostgreSQL wire server listening on 127.0.0.1:${pgPort}`);

  const env = {
    ...process.env,
    DATABASE_URL: `postgresql://postgres:postgres@127.0.0.1:${pgPort}/postgres?sslmode=disable&connection_limit=1`,
    AUTH_SECRET: process.env.AUTH_SECRET || "e2e-test-auth-secret-32-characters-long!!",
    AUTH_TRUST_HOST: "true",
    NEXT_PUBLIC_APP_URL: `http://localhost:${webPort}`,
    DEMO_MODE: "true",
    SEED_DEMO: "true",
    DEMO_PASSWORD: process.env.DEMO_PASSWORD || "e2e-demo-password-123",
  };

  // Async spawn so parent event loop continues serving PGLiteSocketServer TCP connections!
  const tsxCli = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
  await runAsyncChild(process.execPath, [tsxCli, "prisma/seed.ts"], env);

  const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextBin, "start", "-p", String(webPort)], {
    env,
    stdio: "inherit",
  });

  const shutdown = async () => {
    child.kill();
    await pgServer.stop().catch(() => {});
    await pg.close().catch(() => {});
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
