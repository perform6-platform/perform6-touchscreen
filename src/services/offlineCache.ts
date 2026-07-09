import type { CachedMediaMeta } from './media';

const MEDIA_STORE = 'perform6-media-meta';

class OfflineCacheService {
  private memory = new Map<string, CachedMediaMeta>();

  async storeMediaMeta(meta: CachedMediaMeta): Promise<void> {
    this.memory.set(meta.assetId, meta);
    try {
      const all = this.readLocal();
      all[meta.assetId] = meta;
      localStorage.setItem(MEDIA_STORE, JSON.stringify(all));
    } catch {
      // IndexedDB / filesystem can replace this later
    }
  }

  async getMediaMeta(assetId: string): Promise<CachedMediaMeta | null> {
    if (this.memory.has(assetId)) return this.memory.get(assetId)!;
    const all = this.readLocal();
    const meta = all[assetId] ?? null;
    if (meta) this.memory.set(assetId, meta);
    return meta;
  }

  async listMediaMeta(): Promise<CachedMediaMeta[]> {
    const all = this.readLocal();
    return Object.values(all);
  }

  async clear(): Promise<void> {
    this.memory.clear();
    localStorage.removeItem(MEDIA_STORE);
  }

  private readLocal(): Record<string, CachedMediaMeta> {
    try {
      const raw = localStorage.getItem(MEDIA_STORE);
      return raw ? (JSON.parse(raw) as Record<string, CachedMediaMeta>) : {};
    } catch {
      return {};
    }
  }
}

export const offlineCacheService = new OfflineCacheService();
