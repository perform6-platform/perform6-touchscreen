import { Link, useParams } from 'react-router-dom';
import { DisplayScreen } from '../display-ui';
import { findScreenForClusterMember, getCurrentVideo } from '../services/playback';
import type { ClusterMember } from '../shared/types';
import { useRuntime } from '../hooks/useRuntime';

const MEMBERS: ClusterMember[] = ['DEVICE_A', 'DEVICE_B', 'DEVICE_C'];

function parseMember(raw?: string): ClusterMember {
  const normalized = raw?.toUpperCase().replace('-', '_');
  if (normalized === 'DEVICE_A' || normalized === 'DEVICE_B' || normalized === 'DEVICE_C') {
    return normalized;
  }
  return 'DEVICE_A';
}

export default function HD226Simulator() {
  const { member = 'device_a' } = useParams();
  const activeMember = parseMember(member);
  const { store, deviceInfo, updateDeviceProfile } = useRuntime();
  const manifest = store.playbackState.manifest;
  const screen = manifest ? findScreenForClusterMember(manifest, activeMember) : undefined;
  const video = getCurrentVideo(screen);

  return (
    <main className="p6-hd226-sim flex h-full flex-col gap-3 p-4">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-p6-cyan">HD226 Simulator</p>
          <h1 className="text-lg font-bold">Cluster Member · {activeMember}</h1>
          <p className="text-xs text-slate-500">{deviceInfo?.serialNumber}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {MEMBERS.map((m) => (
            <Link
              key={m}
              to={`/simulator/hd226/${m.toLowerCase()}`}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                m === activeMember
                  ? 'bg-p6-cyan text-black'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
              onClick={() =>
                void updateDeviceProfile({ hardwareProfile: 'HD226', clusterMember: m })
              }
            >
              {m}
            </Link>
          ))}
          <Link to="/dashboard" className="self-center text-xs text-slate-400 underline">
            Dashboard
          </Link>
        </div>
      </header>

      <div className="min-h-0 flex-1">
        <DisplayScreen
          label={activeMember}
          videoSrc={video?.url ?? null}
          meta={{
            day: screen?.rotationDay ?? manifest?.deployment.currentDay,
            library: manifest?.deployment.libraryName,
          }}
        />
      </div>
    </main>
  );
}
