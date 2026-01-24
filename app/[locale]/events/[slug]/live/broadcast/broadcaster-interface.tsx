'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowLeft, Video, VideoOff, Mic, MicOff, Radio, Copy, Check, AlertCircle, Loader2 } from 'lucide-react';
import { Link } from '@/lib/i18n/routing';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { StreamStatusBadge } from '@/components/streaming';
import { useStreamStatus } from '@/lib/hooks/use-stream-status';
import type { LiveStreamStatus } from '@/lib/types';

interface BroadcasterInterfaceProps {
  event: {
    id: string;
    slug: string;
    title: string;
  };
  existingStream: {
    id: string;
    status: LiveStreamStatus;
    streamKey: string;
    playbackUrl: string | null;
    angleLabel: string | null;
    startedAt: string | null;
  } | null;
  locale: string;
}

export function BroadcasterInterface({ event, existingStream, locale: _locale }: BroadcasterInterfaceProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamData, setStreamData] = useState<{
    id: string;
    rtmpsUrl: string;
    streamKey: string;
    webRTCUrl?: string;
  } | null>(existingStream ? {
    id: existingStream.id,
    rtmpsUrl: 'rtmps://live.cloudflare.com:443/live/',
    streamKey: existingStream.streamKey,
  } : null);
  const [angleLabel, setAngleLabel] = useState(existingStream?.angleLabel || 'Main');
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Camera preview state
  const [hasCamera, setHasCamera] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Real-time stream status
  const { streams } = useStreamStatus({ eventId: event.id, enabled: true });
  const currentStream = streams.find(s => s.id === streamData?.id);
  const streamStatus = currentStream?.status || existingStream?.status || 'idle';
  const viewerCount = currentStream?.current_viewers || 0;

  // Check camera availability
  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices().then(devices => {
      setHasCamera(devices.some(d => d.kind === 'videoinput'));
    });
  }, []);

  // Toggle camera preview
  const toggleCamera = useCallback(async () => {
    if (isCameraOn) {
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setIsCameraOn(false);
      setIsMicOn(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720, facingMode: 'user' },
          audio: true
        });
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setIsCameraOn(true);
        setIsMicOn(true);
      } catch {
        setError('Could not access camera. Please check permissions.');
      }
    }
  }, [isCameraOn]);

  // Toggle mic
  const toggleMic = useCallback(() => {
    if (streamRef.current) {
      const audioTrack = streamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMicOn(audioTrack.enabled);
      }
    }
  }, []);

  // Create stream
  const createStream = async () => {
    setIsCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/streaming/streams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: event.id, angleLabel }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create stream');

      setStreamData({
        id: data.stream.id,
        rtmpsUrl: data.stream.rtmps.url,
        streamKey: data.stream.rtmps.streamKey,
        webRTCUrl: data.stream.webRTC?.url,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create stream');
    } finally {
      setIsCreating(false);
    }
  };

  // End stream
  const endStream = async () => {
    if (!streamData) return;
    setIsEnding(true);
    try {
      await fetch(`/api/streaming/streams/${streamData.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ended' }),
      });
      // Cleanup
      streamRef.current?.getTracks().forEach(track => track.stop());
      setStreamData(null);
      setIsCameraOn(false);
    } catch {
      setError('Failed to end stream');
    } finally {
      setIsEnding(false);
    }
  };

  // Copy to clipboard
  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(track => track.stop());
    };
  }, []);

  const isLive = streamStatus === 'live' || streamStatus === 'connecting' || streamStatus === 'reconnecting';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link
          href={`/events/${event.slug}/live`}
          className="-ml-3 flex items-center gap-2 text-muted-foreground hover:text-foreground active:scale-95 transition-all px-3 py-2 rounded-lg"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to viewer</span>
        </Link>
        {isLive && <StreamStatusBadge status={streamStatus} viewerCount={viewerCount} size="md" />}
      </div>

      <div>
        <h1 className="text-2xl font-bold">Go Live</h1>
        <p className="text-muted-foreground">{event.title}</p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Camera Preview */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Camera Preview</CardTitle>
            <CardDescription>Test your camera before going live</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="aspect-video bg-muted rounded-lg overflow-hidden relative">
              {isCameraOn ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover scale-x-[-1]"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                  <VideoOff className="h-12 w-12 mb-2 opacity-50" />
                  <p className="text-sm">Camera is off</p>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant={isCameraOn ? 'default' : 'outline'}
                onClick={toggleCamera}
                disabled={!hasCamera}
                className="flex-1"
              >
                {isCameraOn ? <Video className="h-4 w-4 mr-2" /> : <VideoOff className="h-4 w-4 mr-2" />}
                {isCameraOn ? 'Camera On' : 'Start Camera'}
              </Button>
              <Button
                variant={isMicOn ? 'default' : 'outline'}
                onClick={toggleMic}
                disabled={!isCameraOn}
              >
                {isMicOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Stream Setup */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Stream Setup</CardTitle>
            <CardDescription>
              {streamData ? 'Use these credentials in OBS or your streaming app' : 'Configure your stream'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!streamData ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="angleLabel">Stream Label</Label>
                  <Input
                    id="angleLabel"
                    value={angleLabel}
                    onChange={(e) => setAngleLabel(e.target.value)}
                    placeholder="e.g., Main Stage, Crowd View"
                  />
                  <p className="text-xs text-muted-foreground">
                    Helps viewers identify your stream angle
                  </p>
                </div>
                <Button onClick={createStream} disabled={isCreating} className="w-full">
                  {isCreating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Radio className="h-4 w-4 mr-2" />
                      Create Stream
                    </>
                  )}
                </Button>
              </>
            ) : (
              <>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>RTMP Server URL</Label>
                    <div className="flex gap-2">
                      <Input value={streamData.rtmpsUrl} readOnly className="font-mono text-xs" />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => copyToClipboard(streamData.rtmpsUrl, 'url')}
                      >
                        {copiedField === 'url' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Stream Key</Label>
                    <div className="flex gap-2">
                      <Input
                        value={streamData.streamKey}
                        readOnly
                        type="password"
                        className="font-mono text-xs"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => copyToClipboard(streamData.streamKey, 'key')}
                      >
                        {copiedField === 'key' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Keep this secret - anyone with this key can stream to your event
                    </p>
                  </div>
                </div>

                <Alert>
                  <AlertDescription className="text-sm">
                    <strong>To go live:</strong> Open OBS or your camera app, paste the Server URL and Stream Key, then start streaming.
                  </AlertDescription>
                </Alert>

                <div className="flex gap-2 pt-2">
                  <div className="flex-1 text-center py-2 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground">Status</p>
                    <p className="font-medium capitalize">{streamStatus}</p>
                  </div>
                  <div className="flex-1 text-center py-2 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground">Viewers</p>
                    <p className="font-medium">{viewerCount}</p>
                  </div>
                </div>

                <Button
                  variant="destructive"
                  onClick={endStream}
                  disabled={isEnding}
                  className="w-full"
                >
                  {isEnding ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Ending...
                    </>
                  ) : (
                    'End Stream'
                  )}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">How to Stream</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
            <li>Click &quot;Create Stream&quot; to get your streaming credentials</li>
            <li>Open OBS Studio, Streamlabs, or your phone&apos;s streaming app</li>
            <li>In settings, set the stream type to &quot;Custom RTMP&quot;</li>
            <li>Paste the Server URL and Stream Key</li>
            <li>Click &quot;Start Streaming&quot; in your app</li>
            <li>Your stream will appear on the viewer page within seconds</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
