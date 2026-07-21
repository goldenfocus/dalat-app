// Content analyzers for moment AI metadata (SEO captions).
// Vision inference runs on the Mac mini caption worker via caption_jobs —
// these modules provide the prompts, types, and output validation. Audio
// analysis (text-only) still runs inline through the free provider chain.

export {
  IMAGE_ANALYSIS_PROMPT,
  IMAGE_PROMPT_VERSION,
  normalizeImageAnalysis,
  type ImageAnalysis,
} from "./image-analyzer";
export {
  getKeyFrameUrls,
  keyFrameTimestamps,
  getCloudflareTranscript,
  buildVideoAnalysisPrompt,
  normalizeVideoAnalysis,
  VIDEO_PROMPT_VERSION,
  type VideoAnalysis,
} from "./video-analyzer";
export { analyzeAudio, type AudioAnalysis } from "./audio-analyzer";
