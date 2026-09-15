import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { StorageProvider, StoredObject } from "./storage.types.js";

export class LocalFileStorage implements StorageProvider {
  constructor(private readonly rootDir: string) {}

  resolve(key: string): string {
    const normalized = path.normalize(key).replace(/^(\.\.(\/|\\|$))+/, "");
    return path.join(this.rootDir, normalized);
  }

  async put(params: { key: string; data: Buffer }): Promise<StoredObject> {
    const absolutePath = this.resolve(params.key);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, params.data);
    return {
      key: params.key,
      absolutePath,
      size: params.data.length,
      sha256: crypto.createHash("sha256").update(params.data).digest("hex")
    };
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.resolve(key), { force: true });
  }
}
