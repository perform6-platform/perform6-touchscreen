import { useCallback, useEffect, useRef, useState } from 'react';
import type { SessionPlayerConfig } from '../components/session/types';
import { useAutoHideControls } from './useAutoHideControls';

export function useSessionPlayer({
  open,
  onClose,
  videoSrc,
  attractMode = false,
  initialTimeRemaining = 275,
  initialProgress = 16,
}: SessionPlayerConfig) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const volumeBeforeMuteRef = useRef(1);
  const {
    visible: controlsVisible,
    reveal: onRevealControls,
    reset: resetControls,
    clearHideTimer,
  } = useAutoHideControls();

  const [paused, setPaused] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(initialTimeRemaining);
  const [progress, setProgress] = useState(initialProgress);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [bufferedRatio, setBufferedRatio] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);

  const syncPlayback = useCallback((shouldPause: boolean) => {
    const video = videoRef.current;
    if (!video) return;
    if (shouldPause) video.pause();
    else void video.play().catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;

    setPaused(false);
    setMuted(false);
    setVolume(1);
    volumeBeforeMuteRef.current = 1;
    setTimeRemaining(initialTimeRemaining);
    setProgress(initialProgress);
    resetControls();

    const video = videoRef.current;
    if (video) {
      video.currentTime = 0;
      void video.play().catch(() => {});
    }

    return clearHideTimer;
  }, [open, initialTimeRemaining, initialProgress, videoSrc, resetControls, clearHideTimer]);

  useEffect(() => {
    if (!open || paused || attractMode) return;

    const interval = window.setInterval(() => {
      setTimeRemaining((t) => (t > 0 ? t - 1 : 0));
      setProgress((p) => (p < 100 ? p + 0.05 : 100));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [open, paused, attractMode]);

  useEffect(() => {
    syncPlayback(paused);
  }, [paused, syncPlayback]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !open) return;

    const updateBuffer = () => {
      if (video.buffered.length > 0 && video.duration > 0) {
        const end = video.buffered.end(video.buffered.length - 1);
        setBufferedRatio(end / video.duration);
      }
    };

    const onLoadedMetadata = () => {
      setVideoDuration(video.duration || 0);
      updateBuffer();
    };

    const onTimeUpdate = () => {
      setVideoCurrentTime(video.currentTime);
      updateBuffer();
    };

    video.volume = volume;
    video.muted = muted;
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('durationchange', onLoadedMetadata);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('progress', updateBuffer);

    if (video.readyState >= 1) onLoadedMetadata();

    return () => {
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('durationchange', onLoadedMetadata);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('progress', updateBuffer);
    };
  }, [open, volume, muted, videoSrc]);

  const handleSeek = useCallback(
    (time: number) => {
      const video = videoRef.current;
      if (!video) return;
      video.currentTime = time;
      setVideoCurrentTime(time);
      onRevealControls();
    },
    [onRevealControls],
  );

  const handleTogglePlay = useCallback(() => {
    setPaused((p) => !p);
    onRevealControls();
  }, [onRevealControls]);

  const handleClose = useCallback(() => {
    clearHideTimer();
    onClose();
  }, [clearHideTimer, onClose]);

  const handleVolumeChange = useCallback(
    (nextVolume: number) => {
      const video = videoRef.current;
      const nextMuted = nextVolume === 0;
      if (nextVolume > 0) volumeBeforeMuteRef.current = nextVolume;
      setMuted(nextMuted);
      setVolume(nextVolume);
      if (video) {
        video.volume = nextVolume;
        video.muted = nextMuted;
      }
      onRevealControls();
    },
    [onRevealControls],
  );

  const handleToggleMute = useCallback(() => {
    const video = videoRef.current;
    if (muted) {
      const restored = volumeBeforeMuteRef.current > 0 ? volumeBeforeMuteRef.current : 1;
      setMuted(false);
      setVolume(restored);
      if (video) {
        video.muted = false;
        video.volume = restored;
      }
    } else {
      volumeBeforeMuteRef.current = volume > 0 ? volume : 1;
      setMuted(true);
      setVolume(0);
      if (video) {
        video.muted = true;
        video.volume = 0;
      }
    }
    onRevealControls();
  }, [onRevealControls, muted, volume]);

  const handleFullscreen = useCallback(() => {
    const el = playerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void el.requestFullscreen?.();
    }
    onRevealControls();
  }, [onRevealControls]);

  return {
    videoRef,
    playerRef,
    paused,
    controlsVisible,
    timeRemaining,
    progress,
    videoCurrentTime,
    videoDuration,
    bufferedRatio,
    volume,
    muted,
    onRevealControls,
    onTogglePlay: handleTogglePlay,
    onSeek: handleSeek,
    onVolumeChange: handleVolumeChange,
    onToggleMute: handleToggleMute,
    onFullscreen: handleFullscreen,
    onClose: handleClose,
  };
}
