import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { runtimeConfig, profileDefaultDeployment } from '../config/runtime';
import {
  pairDevice,
  pollPairingStatus,
  PairingConflictError,
  resolvePairingIdentity,
  createMockManifest,
  prefetchPlaylist,
  getPostRegistrationRoute,
  runSyncEngine,
  sendDeviceHeartbeat,
  getCredentials,
  fetchAndStoreCredentials,
} from '../services';
import { ApiError } from '../services/api';
import type { DeviceInfo, DeviceRegistrationStatus } from '../shared/types';
import type { MockDeviceOptions } from '../shared/mockDevice';
import { isDeviceReady, useDeviceStore } from '../stores/deviceStore';
import { useRuntimeStore } from '../stores/runtimeStore';
import { useDeviceContext } from './DeviceContext';

interface BeginSimulatorProfileOptions extends MockDeviceOptions {
  route: string;
}

interface RuntimeContextValue {
  registrationStatus: DeviceRegistrationStatus;
  pairingCode: string | null;
  isRegistered: boolean;
  isReady: boolean;
  needsCredentials: boolean;
  retryPairing: () => void;
  runSyncNow: () => Promise<void>;
  beginSimulatorProfile: (options: BeginSimulatorProfileOptions) => Promise<void>;
  fetchCredentials: () => Promise<void>;
  resolveCredentials: (deviceId: string) => Promise<void>;
  onCredentialsSaved: () => Promise<void>;
}

const RuntimeContext = createContext<RuntimeContextValue | null>(null);

export function RuntimeProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { deviceInfo, refreshDeviceInfo } = useDeviceContext();

  const pairingCode = useDeviceStore((s) => s.pairingCode);
  const registrationStatus = useDeviceStore((s) => s.registrationStatus);
  const hasCredentials = useDeviceStore((s) => s.hasCredentials);
  const setPairing = useDeviceStore((s) => s.setPairing);
  const setRegistrationStatus = useDeviceStore((s) => s.setRegistrationStatus);
  const clearDeviceStore = useDeviceStore((s) => s.clear);

  const pushDebugLog = useRuntimeStore((s) => s.pushDebugLog);
  const setConnectionStatus = useRuntimeStore((s) => s.setConnectionStatus);
  const setSyncState = useRuntimeStore((s) => s.setSyncState);
  const setPlaybackManifest = useRuntimeStore((s) => s.setPlaybackManifest);
  const setHeartbeat = useRuntimeStore((s) => s.setHeartbeat);
  const pendingRoute = useRuntimeStore((s) => s.pendingRoute);
  const setSimulatorSession = useRuntimeStore((s) => s.setSimulatorSession);

  const pairingStarted = useRef(false);
  const registeredNavigated = useRef(false);
  const activeDeviceInfo = useRef<DeviceInfo | null>(null);

  const credentialFetchStarted = useRef(false);

  const isReady = isDeviceReady();
  const isRegistered = registrationStatus === 'registered';
  const needsCredentials = registrationStatus === 'registered' && !hasCredentials;

  const applyMockManifest = useCallback(async () => {
    const info = activeDeviceInfo.current ?? deviceInfo;
    if (!info) return;
    const manifest = createMockManifest(info.hardwareProfile);
    setPlaybackManifest(manifest);
    await prefetchPlaylist(manifest.screens.flatMap((s) => s.playlist));
    setSyncState({ runtimePhase: 'ready', lastSyncAt: new Date().toISOString() });
    pushDebugLog({ category: 'playback', message: 'Mock manifest loaded', data: manifest });
  }, [deviceInfo, pushDebugLog, setPlaybackManifest, setSyncState]);

  const runSyncNow = useCallback(async () => {
    const auth = getCredentials();
    const info = activeDeviceInfo.current ?? deviceInfo;
    if (!auth || !info) return;

    setSyncState({ inProgress: true, error: null, runtimePhase: 'syncing' });
    pushDebugLog({ category: 'sync', message: 'POST /sync/check started' });

    const result = await runSyncEngine(auth, info.hardwareProfile);

    if (result.success) {
      if (result.manifest) {
        setPlaybackManifest(result.manifest);
        setSyncState({
          lastCheckAt: new Date().toISOString(),
          lastSyncAt: new Date().toISOString(),
          syncJobId: result.syncData?.syncJobId ?? null,
          inProgress: false,
          error: null,
          runtimePhase: 'ready',
        });
        setConnectionStatus('online');
        pushDebugLog({
          category: 'sync',
          message: 'Sync completed',
          data: {
            syncJobId: result.syncData?.syncJobId,
            screens: result.manifest.screens.length,
            ota: result.ota?.updateAvailable
              ? {
                  version: result.ota.version,
                  reachable: result.ota.reachable,
                  downloadUrl: result.ota.downloadUrl,
                }
              : undefined,
          },
        });
      } else {
        setSyncState({
          lastCheckAt: new Date().toISOString(),
          lastSyncAt: new Date().toISOString(),
          syncJobId: result.syncData?.syncJobId ?? null,
          inProgress: false,
          error: 'Sync returned no playback content',
          runtimePhase: 'ready',
        });
        setConnectionStatus('online');
        pushDebugLog({
          category: 'sync',
          message: 'Sync OK but no playback manifest content',
          data: { syncJobId: result.syncData?.syncJobId },
        });
      }
      return;
    }

    if (runtimeConfig.isSimulator) {
      await applyMockManifest();
      setSyncState({ inProgress: false, error: null, runtimePhase: 'ready' });
      setConnectionStatus('online');
      pushDebugLog({
        category: 'sync',
        message: `Sync failed — using mock manifest: ${result.error}`,
      });
      return;
    }

    setSyncState({
      inProgress: false,
      error: result.error ?? 'Sync failed',
      runtimePhase: 'error',
    });
    setConnectionStatus('offline');
    pushDebugLog({ category: 'sync', message: result.error ?? 'Sync failed' });
  }, [
    applyMockManifest,
    deviceInfo,
    pushDebugLog,
    setConnectionStatus,
    setPlaybackManifest,
    setSyncState,
  ]);

  const executePairing = useCallback(
    async (info: DeviceInfo) => {
      if (isDeviceReady()) {
        pushDebugLog({ category: 'pairing', message: 'Skipping pair — credentials already stored' });
        return;
      }

      activeDeviceInfo.current = info;
      pairingStarted.current = true;
      setRegistrationStatus('pairing');
      setConnectionStatus('connecting');
      setSyncState({ runtimePhase: 'unpaired' });
      pushDebugLog({
        category: 'pairing',
        message: `POST /devices/pair as ${info.hardwareProfile}`,
        data: info,
      });

      try {
        const res = await pairDevice(info);
        setPairing({
          pairingId: res.pairingId,
          pairingCode: res.pairingCode,
          registrationStatus: res.registrationStatus,
        });

        const phase =
          res.registrationStatus === 'registered'
            ? 'waiting_credentials'
            : res.registrationStatus === 'paired'
              ? 'waiting_register'
              : 'waiting_claim';
        setSyncState({ runtimePhase: phase });

        if (res.apiToken && res.deviceId) {
          useDeviceStore.getState().setCredentials({
            deviceId: res.deviceId,
            apiToken: res.apiToken,
          });
        }

        pushDebugLog({
          category: 'pairing',
          message: `Pairing code: ${res.pairingCode} (${res.rawStatus})`,
          data: res,
        });
        setConnectionStatus('online');
      } catch (e) {
        if (e instanceof PairingConflictError) {
          setRegistrationStatus('registered');
          setSyncState({ runtimePhase: 'waiting_credentials' });
          pushDebugLog({
            category: 'pairing',
            message: 'Device already registered (409) — fetching credentials',
          });
          setConnectionStatus('online');
          return;
        }

        const isNetworkError = e instanceof TypeError;
        if (runtimeConfig.isSimulator && isNetworkError) {
          const mockCode = Math.floor(100000 + Math.random() * 900000).toString();
          setPairing({
            pairingId: `sim-${info.serialNumber}`,
            pairingCode: mockCode,
            registrationStatus: 'waiting_for_registration',
          });
          setSyncState({ runtimePhase: 'waiting_claim' });
          pushDebugLog({ category: 'pairing', message: `Simulated pairing: ${mockCode}` });
          setConnectionStatus('online');
          return;
        }

        pairingStarted.current = false;
        setRegistrationStatus('error');
        setSyncState({ runtimePhase: 'error' });
        setConnectionStatus('offline');
        pushDebugLog({
          category: 'pairing',
          message: e instanceof ApiError ? `Pairing failed: ${e.message}` : 'Pairing failed',
        });
      }
    },
    [pushDebugLog, setConnectionStatus, setPairing, setRegistrationStatus, setSyncState],
  );

  const beginSimulatorProfile = useCallback(
    async (options: BeginSimulatorProfileOptions) => {
      const { route, ...profileOverrides } = options;
      const hardwareProfile = profileOverrides.hardwareProfile ?? runtimeConfig.hardwareProfile;

      pairingStarted.current = false;
      registeredNavigated.current = false;
      clearDeviceStore();
      setPlaybackManifest(null);
      setSimulatorSession({ active: true, pendingRoute: route });

      const info = await refreshDeviceInfo({
        ...profileOverrides,
        hardwareProfile,
        deploymentType:
          profileOverrides.deploymentType ?? profileDefaultDeployment(hardwareProfile),
        displayTarget:
          hardwareProfile === 'XC4055'
            ? (profileOverrides.displayTarget ?? runtimeConfig.displayTarget)
            : undefined,
        clusterMember:
          hardwareProfile === 'HD226'
            ? (profileOverrides.clusterMember ?? runtimeConfig.clusterMember)
            : undefined,
      });

      await executePairing(info);
    },
    [
      clearDeviceStore,
      executePairing,
      refreshDeviceInfo,
      setPlaybackManifest,
      setSimulatorSession,
    ],
  );

  const fetchCredentials = useCallback(async () => {
    const info = activeDeviceInfo.current ?? deviceInfo;
    const state = useDeviceStore.getState();
    if (!info || isDeviceReady()) return;

    setSyncState({
      credentialsFetching: true,
      credentialsError: null,
      runtimePhase: 'waiting_credentials',
    });
    pushDebugLog({
      category: 'pairing',
      message: 'POST /devices/pairings/credentials',
      data: { pairingId: state.pairingId, serialNumber: info.serialNumber },
    });

    const result = await fetchAndStoreCredentials({
      serialNumber: info.serialNumber,
      pairingId: state.pairingId,
      deviceId: state.deviceId,
      deviceInfo: info,
    });

    if (result.success) {
      setSyncState({ credentialsFetching: false, credentialsError: null, runtimePhase: 'syncing' });
      pushDebugLog({
        category: 'pairing',
        message: 'Credentials acquired',
        data: { deviceId: result.credentials?.deviceId },
      });
      registeredNavigated.current = false;
      await runSyncNow();
      return;
    }

    setSyncState({
      credentialsFetching: false,
      credentialsError: result.notReady
        ? 'Waiting for admin registration to complete…'
        : (result.error ?? 'Credential fetch failed'),
      runtimePhase: 'waiting_credentials',
    });
    pushDebugLog({
      category: 'pairing',
      message: result.error ?? 'Credentials not ready',
    });
  }, [deviceInfo, pushDebugLog, runSyncNow, setSyncState]);

  const resolveCredentials = useCallback(
    async (deviceId: string) => {
      const info = activeDeviceInfo.current ?? deviceInfo;
      if (!info || isDeviceReady()) return;

      setSyncState({ credentialsFetching: true, credentialsError: null });
      pushDebugLog({
        category: 'pairing',
        message: 'POST /devices/credentials/resolve',
        data: { deviceId, serialNumber: info.serialNumber },
      });

      const result = await fetchAndStoreCredentials({
        serialNumber: info.serialNumber,
        deviceId,
        deviceInfo: info,
      });

      if (result.success) {
        setSyncState({ credentialsFetching: false, credentialsError: null, runtimePhase: 'syncing' });
        registeredNavigated.current = false;
        await runSyncNow();
        return;
      }

      setSyncState({
        credentialsFetching: false,
        credentialsError: result.error ?? 'Resolve failed',
        runtimePhase: 'waiting_credentials',
      });
      throw new Error(result.error ?? 'Resolve failed');
    },
    [deviceInfo, pushDebugLog, runSyncNow, setSyncState],
  );

  const onCredentialsSaved = useCallback(async () => {
    registeredNavigated.current = false;
    setSyncState({ runtimePhase: 'syncing' });
    await runSyncNow();
  }, [runSyncNow, setSyncState]);

  const retryPairing = useCallback(() => {
    const info = activeDeviceInfo.current ?? deviceInfo;
    if (!info) return;
    pairingStarted.current = false;
    void executePairing(info);
  }, [deviceInfo, executePairing]);

  useEffect(() => {
    if (runtimeConfig.isSimulator) return;
    if (deviceInfo && registrationStatus === 'idle' && !pairingStarted.current && !isDeviceReady()) {
      void executePairing(deviceInfo);
    }
  }, [deviceInfo, registrationStatus, executePairing]);

  useEffect(() => {
    if (isDeviceReady()) return;
    if (
      registrationStatus !== 'waiting_for_registration' &&
      registrationStatus !== 'paired' &&
      registrationStatus !== 'registered'
    ) {
      return;
    }

    const poll = () => {
      const info = activeDeviceInfo.current ?? deviceInfo;
      if (!info) return;

      void pollPairingStatus(info)
        .then((res) => {
          setPairing({
            pairingId: res.pairingId,
            pairingCode: res.pairingCode,
            registrationStatus: res.registrationStatus,
          });

          if (res.registrationStatus === 'registered') {
            setSyncState({ runtimePhase: 'waiting_credentials' });
            pushDebugLog({
              category: 'pairing',
              message: `REGISTERED — fetching credentials (pairingId: ${res.pairingId})`,
            });
          } else if (res.registrationStatus === 'paired') {
            setSyncState({ runtimePhase: 'waiting_register' });
            pushDebugLog({ category: 'pairing', message: `ADMIN_CLAIMED — complete deployment` });
          }
        })
        .catch(async (e) => {
          if (e instanceof PairingConflictError) {
            const info = activeDeviceInfo.current ?? deviceInfo;
            if (info) {
              try {
                const resolved = await resolvePairingIdentity(info);
                setPairing({
                  pairingId: resolved.pairingId,
                  pairingCode: resolved.pairingCode,
                  registrationStatus: resolved.registrationStatus,
                });
                return;
              } catch {
                // fall through
              }
            }
            setRegistrationStatus('registered');
            setSyncState({ runtimePhase: 'waiting_credentials' });
          }
        });
    };

    poll();
    const id = window.setInterval(poll, runtimeConfig.pairingPollMs);
    return () => window.clearInterval(id);
  }, [
    deviceInfo,
    pushDebugLog,
    registrationStatus,
    setPairing,
    setRegistrationStatus,
    setSyncState,
  ]);

  // Auto-fetch credentials when admin registration completes
  useEffect(() => {
    if (hasCredentials || registrationStatus !== 'registered') {
      credentialFetchStarted.current = false;
      return;
    }

    if (!credentialFetchStarted.current) {
      credentialFetchStarted.current = true;
      void fetchCredentials();
    }

    const id = window.setInterval(() => void fetchCredentials(), runtimeConfig.pairingPollMs);
    return () => window.clearInterval(id);
  }, [fetchCredentials, hasCredentials, registrationStatus]);

  useEffect(() => {
    if (!isDeviceReady() || !deviceInfo) return;
    void runSyncNow();
    const id = window.setInterval(() => void runSyncNow(), runtimeConfig.syncIntervalMs);
    return () => window.clearInterval(id);
  }, [deviceInfo, hasCredentials, runSyncNow]);

  useEffect(() => {
    if (!isDeviceReady() || !deviceInfo || registeredNavigated.current) return;
    registeredNavigated.current = true;
    const route = pendingRoute ?? getPostRegistrationRoute(deviceInfo.hardwareProfile);
    navigate(route, { replace: true });
  }, [deviceInfo, hasCredentials, navigate, pendingRoute]);

  useEffect(() => {
    if (!isDeviceReady()) return;

    const tick = () => {
      const auth = getCredentials();
      if (!auth) return;
      void sendDeviceHeartbeat(auth, { firmwareVersion: deviceInfo?.firmwareVersion })
        .then(() => {
          setHeartbeat({ at: new Date().toISOString(), ok: true });
          pushDebugLog({ category: 'heartbeat', message: 'POST /devices/me/heartbeat OK' });
        })
        .catch(() => {
          setHeartbeat({ at: new Date().toISOString(), ok: false });
        });
    };

    tick();
    const id = window.setInterval(tick, runtimeConfig.heartbeatIntervalMs);
    return () => window.clearInterval(id);
  }, [deviceInfo, hasCredentials, pushDebugLog, setHeartbeat]);

  const value = useMemo(
    () => ({
      registrationStatus,
      pairingCode,
      isRegistered,
      isReady,
      needsCredentials,
      retryPairing,
      runSyncNow,
      beginSimulatorProfile,
      fetchCredentials,
      resolveCredentials,
      onCredentialsSaved,
    }),
    [
      registrationStatus,
      pairingCode,
      isRegistered,
      isReady,
      needsCredentials,
      retryPairing,
      runSyncNow,
      beginSimulatorProfile,
      fetchCredentials,
      resolveCredentials,
      onCredentialsSaved,
    ],
  );

  return <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>;
}

export function useRuntimeContext(): RuntimeContextValue {
  const ctx = useContext(RuntimeContext);
  if (!ctx) throw new Error('useRuntimeContext must be used within RuntimeProvider');
  return ctx;
}
