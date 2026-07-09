import { Link } from 'react-router-dom';
import { DisplayScreen } from '../display-ui';
import { findScreenForTarget, getCurrentVideo } from '../services/playback';
import { resolveMediaFileUrl } from '../services/manifest';
import { useRuntime, useSync } from '../hooks/useRuntime';

const SCREENS = [
  { target: 'SCREEN_1' as const, label: 'Screen 1 — Start Here' },
  { target: 'SCREEN_2' as const, label: 'Screen 2 — Phase 1' },
  { target: 'SCREEN_3' as const, label: 'Screen 3 — Phase 2' },
];

export default function XC4055Simulator() {
  const { store, deviceInfo } = useRuntime();
  const { syncState } = useSync();
  const manifest = store.playbackState.manifest;

  return (
    <main className="p6-xc4055-sim flex h-full flex-col gap-3 overflow-hidden p-3">
      <header className="flex shrink-0 items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-p6-cyan">XC4055 Simulator</p>
          <h1 className="text-lg font-bold">Three HDMI Outputs</h1>
          <p className="text-xs text-slate-500">
            {deviceInfo?.serialNumber} · Phase: {syncState.runtimePhase}
          </p>
        </div>
        <Link to="/dashboard" className="text-xs text-slate-400 underline">
          Dashboard
        </Link>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-3">
        {SCREENS.map(({ target, label }) => {
          const screen = manifest ? findScreenForTarget(manifest, target) : undefined;
          const video = getCurrentVideo(screen);
          const videoSrc = video?.url ? resolveMediaFileUrl(video.url) : null;
          return (
            <DisplayScreen
              key={target}
              label={label}
              videoSrc={videoSrc}
              meta={{
                day: screen?.rotationDay ?? manifest?.deployment.currentDay,
                library: manifest?.deployment.libraryName,
                rotation: manifest?.deployment.rotationId,
              }}
            />
          );
        })}
      </div>
    </main>
  );
}
