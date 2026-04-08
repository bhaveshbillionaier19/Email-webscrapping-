import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATE_FILE = path.resolve(__dirname, "../state.json");

export async function loadState() {
  try {
    await access(STATE_FILE);
  } catch {
    return {};
  }

  try {
    const contents = await readFile(STATE_FILE, "utf8");
    return contents.trim() ? JSON.parse(contents) : {};
  } catch {
    return {};
  }
}

export async function saveState(state) {
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}
