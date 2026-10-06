/**
 * Verifica a instalação e diz o que falta. Uso: npm run doctor
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import net from "node:net";

const root = process.cwd();
const results: { ok: boolean; label: string; fix?: string }[] = [];
const add = (ok: boolean, label: string, fix?: string) => results.push({ ok, label, fix });

// 1. Node
const major = Number(process.versions.node.split(".")[0]);
add(major >= 20, `Node ${process.versions.node}`, "Instale o Node 20 ou mais novo: https://nodejs.org");

// 1b. NODE_ENV forçado no sistema atrapalha a instalação e o modo dev
const nodeEnv = process.env.NODE_ENV;
add(
  !nodeEnv || nodeEnv === "development",
  nodeEnv ? `NODE_ENV=${nodeEnv} definido no sistema` : "NODE_ENV não definido",
  "Remova NODE_ENV do seu ~/.zshrc ou ~/.bash_profile, ou use o iniciar.command (ele corrige sozinho)",
);

// 2. Dependências
for (const dep of ["next", "playwright", "node-html-parser", "@prisma/client", "zod", "nodemailer"]) {
  const ok = existsSync(path.join(root, "node_modules", dep));
  add(ok, `Pacote ${dep}`, "Rode: npm install");
}

// 3. Prisma client gerado com a coluna nova
try {
  const clientDir = path.join(root, "node_modules", ".prisma", "client");
  const idx = existsSync(path.join(clientDir, "index.js")) ? readFileSync(path.join(clientDir, "index.js"), "utf8") : "";
  const schemaFile = path.join(clientDir, "schema.prisma");
  const schema = existsSync(schemaFile) ? readFileSync(schemaFile, "utf8") : idx;
  add(schema.includes("precise"), "Prisma client atualizado", "Rode: npx prisma generate");
} catch {
  add(false, "Prisma client atualizado", "Rode: npx prisma generate");
}

// 4. Banco
const db = path.join(root, "achei.db");
add(existsSync(db), "Banco de dados achei.db", "Rode: npm run db:push");

// 5. .env
add(existsSync(path.join(root, ".env")), "Arquivo .env (opcional)", "Rode: cp .env.example .env");

// 6. Chromium do Playwright
async function checkBrowser() {
  try {
    const { chromium } = await import("playwright");
    let exe = "";
    try {
      exe = chromium.executablePath();
    } catch {
      exe = "";
    }
    const ok = Boolean(exe) && existsSync(exe);
    add(ok, `Chromium do navegador invisível${ok ? "" : " (ausente)"}`, "Rode: npm run browser:install");
  } catch {
    add(false, "Playwright carrega", "Rode: npm install");
  }
}

// 7. Porta 3000
function checkPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, "127.0.0.1");
  });
}

(async () => {
  await checkBrowser();
  const free = await checkPort(3000);
  add(free, free ? "Porta 3000 livre" : "Porta 3000 ocupada (outro servidor rodando?)", "Feche o outro processo ou rode: npx next dev -p 3001");

  console.log("\nDiagnóstico do Achei\n");
  for (const r of results) {
    console.log(`  ${r.ok ? "OK    " : "FALTA "} ${r.label}${!r.ok && r.fix ? `\n         -> ${r.fix}` : ""}`);
  }
  const missing = results.filter((r) => !r.ok && !r.label.includes("opcional") && !r.label.startsWith("Porta"));
  console.log(missing.length === 0 ? "\nTudo certo. Rode: npm run dev\n" : `\n${missing.length} item(ns) para corrigir. Ou rode tudo de uma vez: npm run setup\n`);
})();
