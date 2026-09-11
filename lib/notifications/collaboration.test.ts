import { it, expect } from 'vitest';
import { getNotificationTemplate } from './templates';
it('uses a private destination, stable retry tag, and no answer content in push', () => {
 const result = getNotificationTemplate({ type: 'collaboration_update', userId: 'yan', locale: 'en', actionId: 'action-123' });
 expect(result.push.primaryActionUrl).toBe('https://phuong.dalat.app');
 expect(result.push.tag).toBe('phuong-action-123');
 expect(result.push.body).toBe('Phương shared an update in your private planner.');
 expect(result.email).toBeUndefined();
});
