import type { RefObject } from 'react';
import { cn } from '../../lib/cn';
import { formatSessionTime } from '../../lib/format';
import { VideoControlBar } from '../ui/VideoControlBar';
import type { P6Accent } from '../ui/types';
import type { SessionPlayerStep } from './types';

export type SessionPlayerViewProps = {
  videoRef: RefObject<HTMLVideoElement>;
  playerRef: RefObject<HTMLDivElement>;
  videoSrc: string;
  attractMode?: boolean;
  title?: string;
  step?: SessionPlayerStep;
  currentStepLabel?: string;
  nextStepLabel?: string;
  accent?: P6Accent;
  className?: string;
  paused: boolean;
  controlsVisible: boolean;
  timeRemaining: number;
  progress: number;
  videoCurrentTime: number;
  videoDuration: number;
  bufferedRatio: number;
  volume: number;
  muted: boolean;
  onClose: () => void;
  onRevealControls: () => void;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
  onFullscreen: () => void;
};

function ProgressRing({ progress }: { progress: number }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="p6-session-player__ring">
      <svg width="108" height="108" viewBox="0 0 108 108" aria-hidden>
        <circle
          cx="54"
          cy="54"
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="5"
        />
        <circle
          cx="54"
          cy="54"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 54 54)"
        />
      </svg>
      <div className="p6-session-player__ring-label">
        <span className="p6-session-player__ring-value">{Math.round(progress)}%</span>
        <span className="p6-session-player__ring-text">COMPLETE</span>
      </div>
    </div>
  );
}

function StepIndicator({ current, total }: SessionPlayerStep) {
  return (
    <div className="p6-session-player__steps" aria-hidden>
      <div className="p6-session-player__steps-track">
        <div
          className="p6-session-player__steps-fill"
          style={{ width: `${((current - 1) / (total - 1)) * 100}%` }}
        />
      </div>
      {Array.from({ length: total }, (_, i) => {
        const stepNum = i + 1;
        const isActive = stepNum === current;
        const isDone = stepNum < current;
        return (
          <span
            key={stepNum}
            className={cn(
              'p6-session-player__step-dot',
              isActive && 'p6-session-player__step-dot--active',
              isDone && 'p6-session-player__step-dot--done',
            )}
          />
        );
      })}
    </div>
  );
}

export function SessionPlayerView({
  videoRef,
  playerRef,
  videoSrc,
  attractMode = false,
  title = 'Perform6',
  step = { current: 1, total: 6 },
  currentStepLabel = '',
  nextStepLabel = '',
  accent = 'cyan',
  className,
  paused,
  controlsVisible,
  timeRemaining,
  progress,
  videoCurrentTime,
  videoDuration,
  bufferedRatio,
  volume,
  muted,
  onClose,
  onRevealControls,
  onTogglePlay,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onFullscreen,
}: SessionPlayerViewProps) {
  return (
    <div className="p6-session-player-overlay">
      <div
        ref={playerRef}
        className={cn(
          'p6-session-player',
          `p6-session-player--${accent}`,
          attractMode && 'p6-session-player--attract',
          !controlsVisible && 'p6-session-player--controls-hidden',
          className,
        )}
        role="dialog"
        aria-modal="true"
        aria-label={attractMode ? 'Attract video' : title}
      >
        <div className="p6-session-player__video-wrap">
          <video
            ref={videoRef}
            className="p6-session-player__video"
            src={videoSrc}
            playsInline
            loop
            muted={attractMode}
          />
          <div className="p6-session-player__video-shade" aria-hidden />
        </div>

        <button
          type="button"
          className="p6-session-player__tap-catcher"
          aria-label={attractMode ? 'Return to home' : 'Show controls'}
          onPointerDown={attractMode ? onClose : onRevealControls}
        />

        {!attractMode && (
          <div
            className={cn(
              'p6-session-player__shell',
              !controlsVisible && 'p6-session-player__shell--hidden',
            )}
            onPointerDown={onRevealControls}
          >
            <header className="p6-session-player__header">
              <div>
                <h2 className="p6-session-player__title">{title}</h2>
                <p className="p6-session-player__step-label">
                  Step {step.current} of {step.total}
                </p>
              </div>
              <StepIndicator current={step.current} total={step.total} />
            </header>

            <div className="p6-session-player__main">
              <aside className="p6-session-player__sidebar">
                <div className="p6-session-player__stat">
                  <span className="p6-session-player__stat-label">Time Remaining</span>
                  <span className="p6-session-player__stat-value p6-session-player__stat-value--time">
                    {formatSessionTime(timeRemaining)}
                  </span>
                </div>

                <div className="p6-session-player__stat">
                  <span className="p6-session-player__stat-label">Current Step</span>
                  <span className="p6-session-player__stat-value">{currentStepLabel}</span>
                </div>

                <div className="p6-session-player__stat">
                  <span className="p6-session-player__stat-label">Next Step</span>
                  <span className="p6-session-player__stat-value">{nextStepLabel}</span>
                </div>

                <ProgressRing progress={progress} />
              </aside>
            </div>
          </div>
        )}

        <VideoControlBar
          visible={controlsVisible}
          currentTime={videoCurrentTime}
          duration={videoDuration}
          bufferedRatio={bufferedRatio}
          paused={paused}
          volume={volume}
          muted={muted}
          onTogglePlay={onTogglePlay}
          onSeek={onSeek}
          onVolumeChange={onVolumeChange}
          onToggleMute={onToggleMute}
          onFullscreen={onFullscreen}
          onReturnToMenu={onClose}
          onInteract={onRevealControls}
        />
      </div>
    </div>
  );
}
