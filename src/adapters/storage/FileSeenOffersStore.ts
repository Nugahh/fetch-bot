import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { SeenOffersStore } from "../../domain/ports/SeenOffersStore.js";

interface StateFile {
  ids: string[];
  updatedAt: string;
}

/**
 * Stores already-notified offer IDs in a JSON file.
 *
 * On GitHub Actions this file is persisted between runs either via the cache
 * action or by committing it back to the repo (see the workflow). A missing or
 * unreadable file is treated as "nothing seen yet".
 */
export class FileSeenOffersStore implements SeenOffersStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<Set<string>> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as StateFile;
      return new Set(Array.isArray(parsed.ids) ? parsed.ids : []);
    } catch {
      return new Set();
    }
  }

  async save(ids: Set<string>): Promise<void> {
    const payload: StateFile = {
      ids: [...ids].sort(),
      updatedAt: new Date().toISOString(),
    };
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  }
}
