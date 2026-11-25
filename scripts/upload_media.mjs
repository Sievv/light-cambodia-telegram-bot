// Upload every file in media/ to the R2 bucket bound as FILES in wrangler.toml.
// The Worker serves them at /files/<name>; `npm run qa:import` links answers to them.
//
//   npm run media:upload
import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const BUCKET = "lab-training-files";
const TYPES = { ".pdf": "application/pdf", ".mp4": "video/mp4", ".png": "image/png", ".jpg": "image/jpeg" };

const dir = new URL("../media/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
for (const name of readdirSync(dir)) {
  const path = join(dir, name);
  if (!statSync(path).isFile()) continue;
  if (!/^[\w.-]+$/.test(name)) {
    console.error(`Skipped "${name}": use only letters, digits, _ . - in file names.`);
    continue;
  }
  const type = TYPES[name.slice(name.lastIndexOf(".")).toLowerCase()] ?? "application/octet-stream";
  console.log(`Uploading ${name} (${(statSync(path).size / 1e6).toFixed(1)} MB)…`);
  execFileSync(
    "npx",
    ["wrangler", "r2", "object", "put", `${BUCKET}/${name}`, "--file", path, "--content-type", type, "--remote"],
    { stdio: "inherit", shell: process.platform === "win32" },
  );
}
