'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Volume2, VolumeX, Maximize, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface StreamPlayerProps {
  playbackUrl: string | null;
  autoplay?: boolean;
  muted?: boolean;
  className?: string;
  onError?: (error: string) => void;
}

type PlayerState = 'loading' | 'playing' | 'paused' | 'error' | 'offline';

export function StreamPlayer({
  playbackUrl,
  autoplay = true,
  muted: initialMuted = true,
  className,
  onError,
}: StreamPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playerState, setPlayerState] = useState<PlayerState>('loading');
  const [isMuted, setIsMuted] = useState(initialMuted);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const getHLSUrl = useCallback((whepUrl: string): string => {
    return whepUrl.replace('/webRTC/play', '/manifest/video.m3u8');
  }, []);

  useEffect(() => {
    if (!playbackUrl || !videoRef.current) {
      setPlayerState('offline');
      return;
    }

    const video = videoRef.current;
    setPlayerState('loading');
    setErrorMessage(null);
    const hlsUrl = getHLSUrl(playbackUrl);

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = hlsUrl;
      video.muted = isMuted;
      if (autoplay) video.play().catch(() => {});
    } else {
      import('hls.js').then(({ default: Hls }) => {
        if (Hls.isSupported()) {
          const hls = new Hls({ lowLatencyMode: true, backBufferLength: 30 });
          hls.loadSource(hlsUrl);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            video.muted = isMuted;
            if (autoplay) video.play().catch(() => {});
          });
          hls.on(Hls.Events.ERROR, (_, data) => {
            if (data.fatal) {
              setPlayerState('error');
              setErrorMessage('Stream playback failed');
              onError?.('Stream playback failed');
            }
          });
          return () => hls.destroy();
        } else {
          setPlayerState('error');
          setErrorMessage('Your browser does not support live streaming');
          onError?.('Browser not supported');
        }
      }).catch(() => {
        setPlayerState('error');
        setErrorMessage('Failed to initialize player');
      });
    }

    const handlePlaying = () => setPlayerState('playing');
    const handlePause = () => setPlayerState('paused');
    const handleWaiting = () => setPlayerState('loading');
    const handleError = () => {
      setPlayerState('error');
      setErrorMessage('Stream playback error');
      onError?.('Stream playback error');
    };

    video.addEventListener('playing', handlePlaying);
    video.addEventListener('pause', handlePause);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('error', handleError);
    };
  }, [playbackUrl, autoplay, isMuted, getHLSUrl, onError]);

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const toggleFullscreen = () => {
    if (videoRef.current) {
      if (document.fullscreenElement) document.exitFullscreen();
      else videoRef.current.requestFullscreen();
    }
  };

  const retry = () => {
    if (videoRef.current && playbackUrl) {
      const hlsUrl = getHLSUrl(playbackUrl);
      videoRef.current.src = hlsUrl;
      videoRef.current.load();
      videoRef.current.play().catch(() => {});
    }
  };

  if (!playbackUrl) {
    return (
      <div className={cn('relative aspect-video bg-black flex items-center justify-center', className)}>
        <div className="text-white/60 text-center">
          <AlertCircle className="h-8 w-8 mx-auto mb-2" />
          <p>Stream offline</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('relative aspect-video bg-black group', className)}>
      <video ref={videoRef} className="w-full h-full object-contain" playsInline muted={isMuted} />

      {playerState === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <RefreshCw className="h-8 w-8 text-white animate-spin" />
        </div>
      )}

      {playerState === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
          <AlertCircle className="h-8 w-8 text-red-400 mb-2" />
          <p className="text-white mb-4">{errorMessage || 'Playback error'}</p>
          <Button variant="outline" size="sm" onClick={retry}>
            <RefreshCw className="h-4 w-4 mr-2" />Retry
          </Button>
        </div>
      )}

      <div className={cn(
        'absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent',
        'opacity-0 group-hover:opacity-100 transition-opacity'
      )}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {playerState === 'playing' && (
              <span className="flex items-center gap-1.5 text-white text-sm">
                <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />LIVE
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/20" onClick={toggleMute}>
              {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/20" onClick={toggleFullscreen}>
              <Maximize className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {isMuted && playerState === 'playing' && (
        <button className="absolute inset-0 flex items-center justify-center cursor-pointer" onClick={toggleMute}>
          <div className="bg-black/60 text-white px-3 py-2 rounded-lg text-sm flex items-center gap-2">
            <VolumeX className="h-4 w-4" />Tap for sound
          </div>
        </button>
      )}
    </div>
  );
}
