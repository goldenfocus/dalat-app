import { describe, expect, it } from 'vitest';

import { getCloudflareWebhookEventType } from './cloudflare-stream';

describe('getCloudflareWebhookEventType', () => {
  it('normalizes a ready Stream VOD payload without a type field', () => {
    expect(getCloudflareWebhookEventType({
      uid: 'video-1',
      readyToStream: true,
      status: { state: 'ready', pctComplete: '100.000000' },
    })).toBe('video.ready');
  });

  it('normalizes a failed Stream VOD payload without a type field', () => {
    expect(getCloudflareWebhookEventType({
      uid: 'video-2',
      readyToStream: false,
      status: {
        state: 'error',
        errorReasonCode: 'ERR_MALFORMED_VIDEO',
        errorReasonText: 'Malformed video',
      },
    })).toBe('video.error');
  });

  it('preserves typed live input events', () => {
    expect(getCloudflareWebhookEventType({
      uid: 'input-1',
      type: 'live_input.connected',
    })).toBe('live_input.connected');
  });
});
