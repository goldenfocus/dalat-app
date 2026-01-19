/**
 * Cloudflare Stream API Client
 *
 * Handles live streaming operations with Cloudflare Stream:
 * - Creating live inputs (RTMPS/WebRTC ingest)
 * - Getting stream status
 * - Managing playback URLs
 *
 * Cloudflare Stream uses WHIP for WebRTC ingest and WHEP for playback.
 * See: https://developers.cloudflare.com/stream/webrtc-beta/
 */

import type { CloudflareStreamInput } from '@/lib/types';

const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4';

interface CloudflareApiResponse<T> {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  messages: string[];
  result: T;
}

interface CreateLiveInputOptions {
  // Recording settings
  recording?: {
    mode: 'off' | 'automatic';
    allowedOrigins?: string[];
    timeoutSeconds?: number;
  };
  // Metadata for tracking
  meta?: Record<string, string>;
}

interface LiveInputStatus {
  uid: string;
  state: 'connected' | 'disconnected';
  isInput: boolean;
  videoUID?: string; // If recording, the recorded video's UID
}

/**
 * Check if Cloudflare Stream is configured
 */
export function isCloudflareStreamConfigured(): boolean {
  return !!(
    process.env.CLOUDFLARE_ACCOUNT_ID &&
    process.env.CLOUDFLARE_STREAM_API_TOKEN
  );
}

/**
 * Get Cloudflare credentials (throws if not configured)
 */
function getCredentials(): { accountId: string; apiToken: string } {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_STREAM_API_TOKEN;

  if (!accountId || !apiToken) {
    throw new Error(
      'Cloudflare Stream not configured. Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_STREAM_API_TOKEN environment variables.'
    );
  }

  return { accountId, apiToken };
}

/**
 * Make authenticated request to Cloudflare API
 */
async function cloudflareRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const { accountId, apiToken } = getCredentials();

  const url = `${CLOUDFLARE_API_BASE}/accounts/${accountId}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const data: CloudflareApiResponse<T> = await response.json();

  if (!data.success) {
    const errorMessage = data.errors.map((e) => e.message).join(', ');
    throw new Error(`Cloudflare API error: ${errorMessage}`);
  }

  return data.result;
}

/**
 * Create a new live input for streaming
 *
 * Returns RTMPS URL + stream key for OBS/mobile apps,
 * and WebRTC URLs for browser-based streaming.
 */
export async function createLiveInput(
  options: CreateLiveInputOptions = {}
): Promise<CloudflareStreamInput> {
  const body: Record<string, unknown> = {
    // Default to automatic recording for VOD replay
    recording: options.recording ?? {
      mode: 'automatic',
      timeoutSeconds: 30, // End recording 30s after disconnect
    },
  };

  if (options.meta) {
    body.meta = options.meta;
  }

  return cloudflareRequest<CloudflareStreamInput>('/stream/live_inputs', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * Get live input details by UID
 */
export async function getLiveInput(
  liveInputId: string
): Promise<CloudflareStreamInput> {
  return cloudflareRequest<CloudflareStreamInput>(
    `/stream/live_inputs/${liveInputId}`
  );
}

/**
 * Get live input connection status
 */
export async function getLiveInputStatus(
  liveInputId: string
): Promise<LiveInputStatus> {
  const input = await getLiveInput(liveInputId);

  return {
    uid: input.uid,
    state: input.status?.current?.state ?? 'disconnected',
    isInput: true,
  };
}

/**
 * Delete a live input
 */
export async function deleteLiveInput(liveInputId: string): Promise<void> {
  await cloudflareRequest<null>(`/stream/live_inputs/${liveInputId}`, {
    method: 'DELETE',
  });
}

/**
 * List all live inputs (paginated)
 */
export async function listLiveInputs(options?: {
  include_counts?: boolean;
}): Promise<CloudflareStreamInput[]> {
  const params = new URLSearchParams();
  if (options?.include_counts) {
    params.set('include_counts', 'true');
  }

  const queryString = params.toString();
  const path = `/stream/live_inputs${queryString ? `?${queryString}` : ''}`;

  return cloudflareRequest<CloudflareStreamInput[]>(path);
}

/**
 * Get the WebRTC playback URL for a live input
 * This is the WHEP URL that viewers use to watch the stream
 */
export function getWebRTCPlaybackUrl(liveInputId: string): string {
  const { accountId } = getCredentials();
  return `https://customer-${accountId}.cloudflarestream.com/${liveInputId}/webRTC/play`;
}

/**
 * Get the HLS playback URL for a live input
 * Fallback for browsers that don't support WebRTC
 */
export function getHLSPlaybackUrl(liveInputId: string): string {
  const { accountId } = getCredentials();
  return `https://customer-${accountId}.cloudflarestream.com/${liveInputId}/manifest/video.m3u8`;
}

/**
 * Get the RTMPS ingest URL and stream key from a live input
 */
export function getRTMPSIngestInfo(input: CloudflareStreamInput): {
  url: string;
  streamKey: string;
} {
  return {
    url: input.rtmps.url,
    streamKey: input.rtmps.streamKey,
  };
}

/**
 * Verify Cloudflare Stream webhook signature
 *
 * Cloudflare signs webhooks with HMAC-SHA256 using the webhook secret.
 * Header: Webhook-Signature: time=<timestamp>,sig1=<signature>
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string
): boolean {
  const webhookSecret = process.env.CLOUDFLARE_STREAM_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.warn('CLOUDFLARE_STREAM_WEBHOOK_SECRET not set, skipping signature verification');
    return true; // Allow in development
  }

  // Parse the signature header
  const parts = signature.split(',').reduce(
    (acc, part) => {
      const [key, value] = part.split('=');
      acc[key] = value;
      return acc;
    },
    {} as Record<string, string>
  );

  const timestamp = parts.time;
  const sig1 = parts.sig1;

  if (!timestamp || !sig1) {
    return false;
  }

  // Verify timestamp is within 5 minutes
  const timestampSeconds = parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestampSeconds) > 300) {
    return false; // Timestamp too old or too far in future
  }

  // Compute expected signature
  const crypto = require('crypto');
  const signedPayload = `${timestamp}.${payload}`;
  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(signedPayload)
    .digest('hex');

  // Constant-time comparison
  return crypto.timingSafeEqual(
    Buffer.from(sig1),
    Buffer.from(expectedSignature)
  );
}

/**
 * Webhook event types from Cloudflare Stream
 */
export type CloudflareWebhookEventType =
  | 'live_input.connected'
  | 'live_input.disconnected'
  | 'video.ready' // Recording is ready
  | 'video.error';

export interface CloudflareWebhookEvent {
  uid: string;
  type: CloudflareWebhookEventType;
  time: string; // ISO timestamp
  liveInput?: {
    uid: string;
  };
  video?: {
    uid: string;
    status: string;
  };
}
