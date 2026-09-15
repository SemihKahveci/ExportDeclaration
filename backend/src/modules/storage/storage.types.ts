export type StoredObject = {
  key: string;
  absolutePath: string;
  size: number;
  sha256: string;
};

export interface StorageProvider {
  put(params: { key: string; data: Buffer }): Promise<StoredObject>;
  resolve(key: string): string;
  delete(key: string): Promise<void>;
}
