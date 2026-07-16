import type { DeviceAuthContext, SyncCheckResponseData } from '../shared/types/api';
import type { HardwareProfile, PlaybackManifest } from '../shared/types';
import {
  addCachedMediaVersionId,
  buildRuntimeManifest,
  getCachedMediaVersionIds,
} from './manifest';
import { simulateDownload } from './media';
import { checkOtaUpdate } from './ota';
import { checkSync, reportDownloadComplete, reportSyncStatus } from './sync';

export interface SyncEngineResult {
  success: boolean;
  manifest: PlaybackManifest | null;
  syncData: SyncCheckResponseData | null;
  ota?: Awaited<ReturnType<typeof checkOtaUpdate>>;
  error?: string;
}

export async function runSyncEngine(
  auth: DeviceAuthContext,
  profile: HardwareProfile,
): Promise<SyncEngineResult> {
  const startMs = Date.now();

  try {
    const syncData = await checkSync(auth, {
      cachedMediaVersionIds: getCachedMediaVersionIds(),
    });

    const uncached = (syncData.media ?? []).filter((m) => !m.cached);

    for (const item of uncached) {
      const downloadStart = Date.now();
      try {
        await simulateDownload({
          id: item.mediaVersionId,
          type: 'video',
          url: item.fileUrl,
          title: item.mediaVersionId,
        });
        addCachedMediaVersionId(item.mediaVersionId);

        await reportDownloadComplete(auth, {
          syncJobId: syncData.syncJobId,
          mediaVersionId: item.mediaVersionId,
          status: 'SUCCESS',
          bytesDownloaded: '0',
          durationMs: Date.now() - downloadStart,
        });
      } catch {
        await reportDownloadComplete(auth, {
          syncJobId: syncData.syncJobId,
          mediaVersionId: item.mediaVersionId,
          status: 'FAILED',
          durationMs: Date.now() - downloadStart,
        });
      }
    }

    await reportSyncStatus(auth, {
      syncJobId: syncData.syncJobId,
      status: 'SUCCESS',
    });

    const manifest = buildRuntimeManifest(syncData, profile);
    const ota = await checkOtaUpdate(syncData.runtime ?? null);

    return {
      success: true,
      manifest,
      syncData,
      ota,
    };
  } catch (e) {
    return {
      success: false,
      manifest: null,
      syncData: null,
      error: e instanceof Error ? e.message : 'Sync failed',
    };
  } finally {
    void startMs;
  }
}
