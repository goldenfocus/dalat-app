import { expect,it } from 'vitest';
import { communityPreviewImages,safeCommunityImage,isUpcomingGathering } from './share-preview';
it('selects a deduplicated community-first collage and rejects private-network sources',()=>{
 const cover='https://cdn.dalat.app/cover.jpg';
 expect(communityPreviewImages(cover,'https://cdn.dalat.app/event.jpg',cover)).toEqual([cover,'https://cdn.dalat.app/event.jpg']);
 for(const url of ['http://127.0.0.1/a','https://localhost/a','https://user:pass@cdn.dalat.app/a','https://cdn.dalat.app.evil.test/a','/images/communities/../../secret.png'])expect(safeCommunityImage(url)).toBeNull();
 expect(safeCommunityImage('/images/communities/dalat-professionals-illustration-v1.png')).toBeTruthy();
});
it('keeps an ongoing gathering prominent and removes ended events',()=>{
 const now=Date.parse('2026-09-17T04:00:00Z');
 expect(isUpcomingGathering({starts_at:'2026-09-17T03:00:00Z'},now)).toBe(true);
 expect(isUpcomingGathering({starts_at:'2026-09-17T03:00:00Z',ends_at:'2026-09-17T03:30:00Z'},now)).toBe(false);
 expect(isUpcomingGathering({starts_at:'invalid'},now)).toBe(false);
});
