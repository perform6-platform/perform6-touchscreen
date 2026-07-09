import type { MediaAsset } from '../shared/types';
import { offlineCacheService } from './offlineCache';
import { resolveMediaFileUrl } from './manifest';

export interface CachedMediaMeta {
  assetId: string;
  url: string;
  type: MediaAsset['type'];
  cachedAt: string;
  sizeBytes?: number;
}

export async function resolveMediaUrl(asset: MediaAsset): Promise<string> {
  const cached = await offlineCacheService.getMediaMeta(asset.id);
  const url = cached?.url ?? asset.url;
  return resolveMediaFileUrl(url);
}

export async function simulateDownload(asset: MediaAsset): Promise<CachedMediaMeta> {
  const resolvedUrl = resolveMediaFileUrl(asset.url);
  const meta: CachedMediaMeta = {
    assetId: asset.id,
    url: resolvedUrl,
    type: asset.type,
    cachedAt: new Date().toISOString(),
  };
  await offlineCacheService.storeMediaMeta(meta);
  return meta;
}

export async function prefetchPlaylist(assets: MediaAsset[]): Promise<CachedMediaMeta[]> {
  return Promise.all(assets.map(simulateDownload));
}
