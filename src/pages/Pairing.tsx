import { Link } from 'react-router-dom';
import { useDeviceContext } from '../contexts/DeviceContext';
import { useHeartbeat, usePairing, useRuntime, useSync } from '../hooks/useRuntime';
import { PairingCodeDisplay, CredentialInjectionForm } from '../components/pairing';
import { runtimeConfig } from '../config/runtime';
import { getPostRegistrationRoute } from '../services/runtime';

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold ${
        ok ? 'bg-emerald-900/50 text-emerald-300' : 'bg-amber-900/50 text-amber-300'
      }`}
    >
      {label}
    </span>
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case 'waiting_for_registration':
      return 'Waiting for Admin Claim';
    case 'paired':
      return 'Admin Claimed — Waiting for Deployment';
    case 'registered':
      return 'Registered — Acquiring Credentials';
    case 'pairing':
      return 'Pairing…';
    default:
      return status.replace(/_/g, ' ');
  }
}

export default function Pairing() {
  const { deviceInfo, loading, error } = useDeviceContext();
  const {
    pairingCode,
    pairingId,
    registrationStatus,
    retryPairing,
    isReady,
    needsCredentials,
  } = usePairing();
  const { connectionStatus, store, simulatorSessionActive } = useRuntime();
  const { syncState, runSyncNow } = useSync();
  const { lastHeartbeatAt, heartbeatOk } = useHeartbeat();

  if (runtimeConfig.isSimulator && !simulatorSessionActive && !pairingCode && registrationStatus === 'idle') {
    return (
      <main className="flex h-full flex-col items-center justify-center gap-6 p-8 text-center">
        <h1 className="p6-title">Select a Simulator Profile</h1>
        <p className="max-w-md text-slate-400">
          Choose XT2145, XC4055, or HD226 from the simulator launcher.
        </p>
        <Link
          to="/simulator"
          className="rounded-xl bg-p6-cyan px-8 py-3 text-sm font-semibold text-black"
        >
          Open Simulator Launcher
        </Link>
      </main>
    );
  }

  if (loading && !deviceInfo) {
    return (
      <main className="flex h-full items-center justify-center">
        <p className="text-slate-400">Collecting device information…</p>
      </main>
    );
  }

  return (
    <main className="p6-device-status flex h-full flex-col items-center justify-center gap-6 overflow-y-auto p-8">
      <div className="w-full max-w-lg text-center">
        <p className="p6-caption mb-2 text-p6-cyan">Perform6 Runtime</p>
        <h1 className="p6-title mb-2">Device Status</h1>
        <p className="p6-body text-p6-text-muted">{statusLabel(registrationStatus)}</p>
      </div>

      {error && (
        <p className="rounded-lg border border-red-800 bg-red-950/40 px-4 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      {deviceInfo && (
        <dl className="grid w-full max-w-lg gap-3 rounded-xl border border-slate-700 bg-slate-900/60 p-5 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Device Name</dt>
            <dd>{deviceInfo.deviceName}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Model</dt>
            <dd>{deviceInfo.model}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Serial</dt>
            <dd className="font-mono text-xs">{deviceInfo.serialNumber}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Pairing ID</dt>
            <dd className="font-mono text-[10px]">{pairingId ?? '—'}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Phase</dt>
            <dd>{syncState.runtimePhase}</dd>
          </div>
        </dl>
      )}

      {!isReady && pairingCode && (
        <PairingCodeDisplay code={pairingCode} status={registrationStatus} />
      )}

      {needsCredentials && <CredentialInjectionForm />}

      <div className="flex flex-wrap items-center justify-center gap-3">
        <StatusBadge
          ok={connectionStatus === 'online'}
          label={`Connection: ${connectionStatus}`}
        />
        {isReady ? (
          <StatusBadge ok={heartbeatOk} label={`Heartbeat: ${heartbeatOk ? 'OK' : 'Failed'}`} />
        ) : (
          <StatusBadge
            ok={registrationStatus === 'waiting_for_registration'}
            label={statusLabel(registrationStatus)}
          />
        )}
      </div>

      {lastHeartbeatAt && isReady && (
        <p className="text-xs text-slate-500">Last heartbeat: {lastHeartbeatAt}</p>
      )}

      <div className="flex flex-wrap justify-center gap-3">
        {registrationStatus === 'error' && (
          <button
            type="button"
            className="rounded-xl bg-p6-cyan px-6 py-2 text-sm font-semibold text-black"
            onClick={retryPairing}
          >
            Retry Pairing
          </button>
        )}

        {isReady && deviceInfo && (
          <>
            <button
              type="button"
              className="rounded-xl border border-slate-600 px-6 py-2 text-sm"
              onClick={() => void runSyncNow()}
              disabled={syncState.inProgress}
            >
              {syncState.inProgress ? 'Syncing…' : 'Sync Now'}
            </button>
            <Link
              to={getPostRegistrationRoute(deviceInfo.hardwareProfile)}
              className="rounded-xl bg-p6-cyan px-6 py-2 text-sm font-semibold text-black"
            >
              Open Runtime UI
            </Link>
          </>
        )}
      </div>

      {store.playbackState.manifest && (
        <p className="text-xs text-slate-500">
          Manifest · {store.playbackState.manifest.screens.length} screen(s) · Day{' '}
          {store.playbackState.manifest.deployment.currentDay}
        </p>
      )}
    </main>
  );
}
