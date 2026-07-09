import { runtimeConfig } from '../config/runtime';
import {
  fromBackendDisplayTarget,
  XC4055_HDMI_TARGETS,
  XC4055_SCREEN_LABELS,
} from '../shared/displayTarget';
import type {
  BackendPlaybackManifest,
  BackendTargetManifest,
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
): PlaybackScreen | null {
  const video = pickVideoForSlot(slot, rotationDay);
  if (!video?.fileUrl && !(slot?.items?.length)) return null;
  const asset = video ? videoItemToMediaAsset(video) : null;
  const playlist = (slot?.items ?? [])
    .filter((i) => i.fileUrl)
    .map(videoItemToMediaAsset);

  return {
    id,
    label: label || slot?.label || id,
    displayTarget: extras?.displayTarget,
    clusterMember: extras?.clusterMember,
    currentVideo: asset ?? undefined,
    playlist: playlist.length > 0 ? playlist : asset ? [asset] : [],
    rotationDay,
  };
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

  const defaultSlots: Array<[DisplayTarget, string, PlaybackSlotContent | undefined]> = [
    ['SCREEN_1', 'Start Here', content.startHere ?? content.default],
    ['SCREEN_2', 'Phase 1', content.phase1],
    ['SCREEN_3', 'Phase 2', content.phase2],
  ];

  for (const [target, label, slot] of defaultSlots) {
    const screen = slotToScreen(`screen-${target}`, label, slot, rotationDay, {
      displayTarget: target,
    });
    if (screen) screens.push(screen);
  }

  return screens;
}

function parseTargetManifest(
  targetManifest: BackendTargetManifest,
  rotationDay: number,
): PlaybackScreen[] {
  const targets = targetManifest.targets ?? {};
  const screens: PlaybackScreen[] = [];

  for (const hdmi of XC4055_HDMI_TARGETS) {
    const target = targets[hdmi];
    if (!target) continue;

    const displayTarget = fromBackendDisplayTarget(hdmi);
    const label = XC4055_SCREEN_LABELS[hdmi] ?? hdmi;

    if ('content' in target && target.content) {
      const manifest = target as BackendPlaybackManifest;
      const slot =
        manifest.content?.startHere ??
        manifest.content?.phase1 ??
        manifest.content?.phase2 ??
        manifest.content?.default;
      const screen = slotToScreen(`screen-${hdmi}`, label, slot, rotationDay, {
        displayTarget,
      });
      if (screen) screens.push(screen);
    } else {
      const screen = slotToScreen(`screen-${hdmi}`, label, target as PlaybackSlotContent, rotationDay, {
        displayTarget,
      });
      if (screen) screens.push(screen);
    }
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

  if (
    profile === 'XC4055' &&
    syncData.config?.resolutionMode === 'logical' &&
    syncData.targetManifest?.targets
  ) {
    screens = parseTargetManifest(syncData.targetManifest, rotationDay);
  } else if (syncData.playbackManifest) {
    screens = manifestToScreens(syncData.playbackManifest, profile);
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
