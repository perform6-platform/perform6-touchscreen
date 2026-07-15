import { runtimeConfig } from '../config/runtime';
import {
  fromBackendDisplayTarget,
  XC4055_HDMI_TARGETS,
  XC4055_SCREEN_FALLBACK_LABELS,
} from '../shared/displayTarget';
import type {
  BackendLogicalScreen,
  BackendPlaybackManifest,
  BackendTargetManifest,
  BackendTargetScreenContent,
  PlaybackSlotContent,
  PlaybackVideoItem,
  SyncCheckResponseData,
} from '../shared/types/api';
import type {
  ClusterMember,
  DisplayTarget,
  HardwareProfile,
  MediaAsset,
  PlaybackManifest,
  PlaybackScreen,
} from '../shared/types';

export function resolveMediaFileUrl(fileUrl: string): string {
  if (!fileUrl) return '';
  if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) return fileUrl;
  const apiOrigin = runtimeConfig.apiBaseUrl.replace(/\/api\/v1\/?$/, '');
  return `${apiOrigin}${fileUrl.startsWith('/') ? fileUrl : `/${fileUrl}`}`;
}

export function computeRotationDay(rotationStartDate?: string, fallbackDay = 1): number {
  if (!rotationStartDate) return fallbackDay;
  const start = new Date(rotationStartDate);
  const today = new Date();
  if (Number.isNaN(start.getTime())) return fallbackDay;
  start.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((today.getTime() - start.getTime()) / 86_400_000);
  return (Math.max(diffDays, 0) % 36) + 1;
}

export function pickVideoForSlot(
  slot: PlaybackSlotContent | undefined,
  rotationDay: number,
): PlaybackVideoItem | null {
  const items = slot?.items ?? [];
  if (items.length === 0) return null;
  if (slot?.isRotating) {
    return items.find((i) => i.day === rotationDay) ?? items[0] ?? null;
  }
  return items[0] ?? null;
}

function videoItemToMediaAsset(item: PlaybackVideoItem): MediaAsset {
  const url = item.fileUrl ? resolveMediaFileUrl(item.fileUrl) : '';
  return {
    id: item.mediaVersionId ?? item.video ?? url,
    type: 'video',
    url,
    title: item.video ?? 'Video',
    durationSeconds: item.durationSeconds,
    loop: !item.day,
  };
}

function slotToScreen(
  id: string,
  label: string,
  slot: PlaybackSlotContent | undefined,
  rotationDay: number,
  extras?: { displayTarget?: DisplayTarget; clusterMember?: ClusterMember },
  /** Keep empty panes so XC4055 still shows the assigned category name. */
  allowEmpty = false,
): PlaybackScreen | null {
  const video = pickVideoForSlot(slot, rotationDay);
  const hasContent = Boolean(video?.fileUrl) || Boolean(slot?.items?.length);
  if (!hasContent && !allowEmpty) return null;

  const asset = video?.fileUrl ? videoItemToMediaAsset(video) : null;
  const playlist = (slot?.items ?? [])
    .filter((i) => i.fileUrl)
    .map(videoItemToMediaAsset);

  return {
    id,
    label: slot?.label || label || id,
    displayTarget: extras?.displayTarget,
    clusterMember: extras?.clusterMember,
    currentVideo: asset ?? undefined,
    playlist: playlist.length > 0 ? playlist : asset ? [asset] : [],
    rotationDay,
  };
}

function isLogicalResolutionMode(mode: string | undefined): boolean {
  if (!mode) return false;
  const normalized = mode.toLowerCase();
  return (
    normalized === 'logical' ||
    normalized === 'logical-screen-map' ||
    normalized.includes('logical')
  );
}

function extractSlotContent(
  target: BackendTargetScreenContent | PlaybackSlotContent | undefined,
): PlaybackSlotContent | undefined {
  if (!target || typeof target !== 'object') return undefined;
  if ('slotContent' in target && target.slotContent) {
    return target.slotContent;
  }
  if ('items' in target || 'label' in target || 'isRotating' in target) {
    return target as PlaybackSlotContent;
  }
  return undefined;
}

function parseTargetManifest(
  targetManifest: BackendTargetManifest,
  rotationDay: number,
): PlaybackScreen[] {
  const targets = targetManifest.targets ?? {};
  const screens: PlaybackScreen[] = [];
  const usedTargets = new Set<DisplayTarget>();

  const ensureScreen = (
    displayTarget: DisplayTarget,
    slot: PlaybackSlotContent | undefined,
    fallbackLabel: string,
  ) => {
    if (usedTargets.has(displayTarget)) return;
    usedTargets.add(displayTarget);
    const screen = slotToScreen(
      `screen-${displayTarget}`,
      fallbackLabel,
      slot,
      rotationDay,
      { displayTarget },
      true,
    );
    if (screen) screens.push(screen);
  };

  for (const hdmi of XC4055_HDMI_TARGETS) {
    const target = targets[hdmi];
    const displayTarget = fromBackendDisplayTarget(hdmi);
    if (!displayTarget) continue;
    const slot = extractSlotContent(target);
    const fallback =
      XC4055_SCREEN_FALLBACK_LABELS[displayTarget] ?? `Screen ${displayTarget}`;
    ensureScreen(displayTarget, slot, slot?.label ?? fallback);
  }

  // Also accept SCREEN_1 / SCREEN_2 keys if backend uses logical keys.
  for (const [key, target] of Object.entries(targets)) {
    const displayTarget = fromBackendDisplayTarget(key);
    if (!displayTarget || usedTargets.has(displayTarget)) continue;
    const slot = extractSlotContent(target);
    ensureScreen(
      displayTarget,
      slot,
      slot?.label ?? XC4055_SCREEN_FALLBACK_LABELS[displayTarget] ?? key,
    );
  }

  // Fallback: screens[] array on target manifest
  if (screens.length === 0 && Array.isArray(targetManifest.screens)) {
    for (const logical of targetManifest.screens as BackendLogicalScreen[]) {
      const displayTarget = logical.screenKey
        ? fromBackendDisplayTarget(logical.screenKey)
        : undefined;
      if (!displayTarget) continue;
      ensureScreen(
        displayTarget,
        logical.slotContent,
        logical.slotContent?.label ??
          XC4055_SCREEN_FALLBACK_LABELS[displayTarget] ??
          logical.screenKey ??
          displayTarget,
      );
    }
  }

  return screens.sort((a, b) => {
    const order = { SCREEN_1: 1, SCREEN_2: 2, SCREEN_3: 3 } as const;
    return (order[a.displayTarget!] ?? 9) - (order[b.displayTarget!] ?? 9);
  });
}

function manifestToScreens(
  manifest: BackendPlaybackManifest,
  profile: HardwareProfile,
): PlaybackScreen[] {
  const rotationDay =
    manifest.rotationDay ?? computeRotationDay(manifest.rotationStartDate);
  const content = manifest.content ?? {};
  const screens: PlaybackScreen[] = [];

  if (profile === 'XT2145') {
    const slots: Array<[string, PlaybackSlotContent | undefined]> = [
      ['touch-default', content.default ?? content.startHere],
      ['start-here', content.startHere],
      ['phase1', content.phase1],
      ['phase2', content.phase2],
      ['full-program', content.fullProgram],
    ];
    for (const [id, slot] of slots) {
      const screen = slotToScreen(id, slot?.label ?? id, slot, rotationDay);
      if (screen) screens.push(screen);
    }
    return screens.length > 0 ? screens : [];
  }

  // If logical screens are embedded on the playback manifest, prefer them.
  if (Array.isArray(manifest.screens) && manifest.screens.length > 0) {
    return parseTargetManifest(
      { targets: {}, screens: manifest.screens },
      rotationDay,
    );
  }

  if (manifest.targets && Object.keys(manifest.targets).length > 0) {
    return parseTargetManifest({ targets: manifest.targets }, rotationDay);
  }

  const defaultSlots: Array<[DisplayTarget, string, PlaybackSlotContent | undefined]> = [
    ['SCREEN_1', 'Start Here', content.startHere ?? content.default],
    ['SCREEN_2', 'Phase 1', content.phase1],
    ['SCREEN_3', 'Phase 2', content.phase2],
  ];

  for (const [target, label, slot] of defaultSlots) {
    const screen = slotToScreen(`screen-${target}`, slot?.label ?? label, slot, rotationDay, {
      displayTarget: target,
    }, true);
    if (screen) screens.push(screen);
  }

  return screens;
}

export function buildRuntimeManifest(
  syncData: SyncCheckResponseData,
  profile: HardwareProfile,
): PlaybackManifest | null {
  const rotationDay =
    syncData.device?.currentRotationDay ??
    computeRotationDay(syncData.device?.rotationStartDate);

  let screens: PlaybackScreen[] = [];

  const hasTargetPayload = Boolean(
    syncData.targetManifest?.targets &&
      Object.keys(syncData.targetManifest.targets).length > 0,
  );
  const hasLogicalScreens = Boolean(
    syncData.targetManifest?.screens &&
      syncData.targetManifest.screens.length > 0,
  );

  if (
    (profile === 'XC4055' || profile === 'HD226') &&
    (isLogicalResolutionMode(syncData.config?.resolutionMode) ||
      hasTargetPayload ||
      hasLogicalScreens) &&
    syncData.targetManifest
  ) {
    screens = parseTargetManifest(syncData.targetManifest, rotationDay);
  } else if (syncData.playbackManifest) {
    // Same payload sometimes only on playbackManifest when targetManifest aliases it.
    const pm = syncData.playbackManifest;
    if (pm.targets && Object.keys(pm.targets).length > 0) {
      screens = parseTargetManifest({ targets: pm.targets, screens: pm.screens }, rotationDay);
    } else {
      screens = manifestToScreens(pm, profile);
    }
  }

  if (screens.length === 0) return null;

  const deployment = syncData.deployment;
  const pm = syncData.playbackManifest;

  return {
    version: syncData.syncJobId,
    updatedAt: new Date().toISOString(),
    deployment: {
      id: syncData.device?.id ?? 'unknown',
      name: deployment?.deploymentType ?? 'Deployment',
      libraryId: deployment?.fieldCategory ?? '',
      libraryName: `${deployment?.fieldCategory ?? ''} ${deployment?.exerciseVariant ?? ''}`.trim(),
      currentDay: rotationDay,
      totalDays: 36,
      brandingUrl: pm?.branding?.logoUrl,
      rotationId: syncData.device?.rotationStartDate,
    },
    screens,
  };
}

export function getCachedMediaVersionIds(): string[] {
  try {
    const raw = localStorage.getItem('perform6-cached-media-ids');
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function persistCachedMediaVersionIds(ids: string[]): void {
  localStorage.setItem('perform6-cached-media-ids', JSON.stringify(ids));
}

export function addCachedMediaVersionId(id: string): void {
  const ids = getCachedMediaVersionIds();
  if (!ids.includes(id)) {
    persistCachedMediaVersionIds([...ids, id]);
  }
}
