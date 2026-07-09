import { runtimeConfig } from '../config/runtime';
import type {
  DeviceAuthContext,
  SyncCheckRequest,
  SyncCheckResponseData,
  SyncDownloadCompleteRequest,
  SyncStatusRequest,
} from '../shared/types/api';
import { apiFetchData } from './api';
import { toBackendDisplayTarget } from '../shared/displayTarget';
import type { DisplayTarget, HardwareProfile } from '../shared/types';

export interface SyncCheckOptions {
  cachedMediaVersionIds?: string[];
  displayTarget?: DisplayTarget;
  clusterMember?: SyncCheckRequest['clusterMember'];
  hardwareProfile?: HardwareProfile;
}

function buildSyncHeaders(auth: DeviceAuthContext, options: SyncCheckOptions) {
  const displayTarget =
    options.displayTarget != null
      ? toBackendDisplayTarget(options.displayTarget)
      : auth.displayTarget;
  const clusterMember = options.clusterMember ?? auth.clusterMember;

  const headers: Record<string, string> = {};
  if (displayTarget) headers['X-Display-Target'] = displayTarget;
  if (clusterMember) headers['X-Cluster-Member'] = clusterMember;

  return headers;
}

export async function checkSync(
  auth: DeviceAuthContext,
  options: SyncCheckOptions = {},
): Promise<SyncCheckResponseData> {
  const body: SyncCheckRequest = {
    runtimeVersion: runtimeConfig.runtimeVersion,
    cachedMediaVersionIds: options.cachedMediaVersionIds ?? [],
  };

  if (options.displayTarget) {
    body.displayTarget = toBackendDisplayTarget(options.displayTarget);
  }
  if (options.clusterMember) {
    body.clusterMember = options.clusterMember;
  }

  const extraHeaders = buildSyncHeaders(auth, options);

  return apiFetchData<SyncCheckResponseData>('/sync/check', {
    method: 'POST',
    token: auth.apiToken,
    deviceId: auth.deviceId,
    headers: extraHeaders,
    body: JSON.stringify(body),
  });
}

export async function reportDownloadComplete(
  auth: DeviceAuthContext,
  payload: SyncDownloadCompleteRequest,
): Promise<void> {
  await apiFetchData<unknown>('/sync/download-complete', {
    method: 'POST',
    token: auth.apiToken,
    deviceId: auth.deviceId,
    body: JSON.stringify(payload),
  });
}

export async function reportSyncStatus(
  auth: DeviceAuthContext,
  payload: SyncStatusRequest,
): Promise<void> {
  await apiFetchData<unknown>('/sync/status', {
    method: 'POST',
    token: auth.apiToken,
    deviceId: auth.deviceId,
    body: JSON.stringify(payload),
  });
}
