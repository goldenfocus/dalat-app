// Re-export Inngest client and all functions
export { inngest } from './client';
export {
  processScheduledNotifications,
  onRsvpCreated,
  onRsvpCancelled,
  onRsvpInterested,
} from './functions/scheduled-notifications';
export { onCommentCreated } from './functions/comment-notifications';
export { dailyBlogSummary } from './functions/daily-blog-summary';
export { dailyEventDiscovery, manualEventDiscovery } from './functions/event-discovery';
export {
  processMomentMetadata,
  processVideoWhenReady,
  processPendingMoments,
  reprocessMoment,
} from './functions/moment-processing';

// SEO Agent Swarm (14 agents)
export { strategyCommander } from './functions/seo/strategy-commander';
export { keywordScout } from './functions/seo/keyword-scout';
export { newsHarvester } from './functions/seo/news-harvester';
export { socialSentinel } from './functions/seo/social-sentinel';
export { eventIntelligence } from './functions/seo/event-intelligence';
export { pillarArchitect } from './functions/seo/pillar-architect';
export { contentForge } from './functions/seo/content-forge';
export { seoSurgeon } from './functions/seo/seo-surgeon';
export { translationBackfill } from './functions/seo/translation-backfill';
export { visualAlchemist } from './functions/seo/visual-alchemist';
export { qualityGate } from './functions/seo/quality-gate';
export { distributionHub } from './functions/seo/distribution-hub';
export { analyticsOracle } from './functions/seo/analytics-oracle';
export { internalLinker } from './functions/seo/internal-linker';
