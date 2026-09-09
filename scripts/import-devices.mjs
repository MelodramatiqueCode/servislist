#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const source = process.argv[2] || join(root, "data", "balena-export.json");

const raw = JSON.parse(readFileSync(source, "utf8"));
const list = Array.isArray(raw) ? raw : raw.devices;
if (!Array.isArray(list)) {
  console.error("Invalid Balena export");
  process.exit(1);
}

const res = await fetch("http://127.0.0.1:3000/api/import-devices", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(list),
});

const json = await res.json();
console.log(json);
if (!res.ok) process.exit(1);

// Also write normalized offline copy via API response count
mkdirSync(join(root, "data"), { recursive: true });
writeFileSync(join(root, "data", "balena-export.json"), JSON.stringify(list));
console.log(`Saved export (${list.length})`);
