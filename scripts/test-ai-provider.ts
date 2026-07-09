/**
 * Live smoke test for the free AI provider chain.
 * Run: npx tsx scripts/test-ai-provider.ts  (with LOCAL_AI_URL etc. in env)
 * Not run in CI — hits real providers.
 */
import { aiChat, aiChatJson } from "@/lib/ai/provider";
import { clusterArticles } from "@/lib/news/clusterer";
import { batchTranslateFields } from "@/lib/google-translate";
import { processNewsCluster } from "@/lib/news/content-processor";

const REAL_ARTICLE = {
  sourceId: "thanhnien",
  sourceUrl: "https://thanhnien.vn/test-lien-khuong",
  sourceName: "Thanh Niên",
  title: "'Tín đồ' mê Đà Lạt chú ý: Sân bay Liên Khương đã chốt ngày mở cửa lại",
  content:
    "Sân bay Liên Khương (Đức Trọng, Lâm Đồng) sẽ hoạt động trở lại từ ngày 15.7 sau thời gian sửa chữa đường băng. " +
    "Đại diện Cảng hàng không Liên Khương cho biết các hãng bay đã lên kế hoạch khai thác trở lại các đường bay đến Đà Lạt " +
    "từ TP.HCM, Hà Nội và Đà Nẵng. Du khách được khuyến cáo kiểm tra lịch bay trước khi khởi hành.",
  imageUrls: [],
  publishedAt: new Date().toISOString(),
};

async function main() {
  console.log("=== 1. aiChat basic ===");
  const t0 = Date.now();
  const basic = await aiChat({ prompt: "Say OK", maxTokens: 10 });
  console.log(`(${Date.now() - t0}ms)`, basic.slice(0, 50));

  console.log("\n=== 2. clusterer on real article ===");
  const t1 = Date.now();
  const { clusters, skipped } = await clusterArticles([REAL_ARTICLE]);
  console.log(
    `(${Date.now() - t1}ms) clusters=${clusters.length} skipped=${skipped.length}`,
    clusters[0]?.keywords
  );
  if (clusters.length !== 1) throw new Error("FAIL: article should cluster, not skip");

  console.log("\n=== 3. batchTranslateFields (short fields) ===");
  const t2 = Date.now();
  const { detectedLocale, translations } = await batchTranslateFields([
    { field_name: "title", text: "Sân bay Liên Khương mở cửa trở lại từ 15.7" },
    { field_name: "description", text: "Tin vui cho du khách yêu Đà Lạt!" },
  ]);
  const locales = Object.keys(translations).filter(
    (l) => Object.keys(translations[l as keyof typeof translations] ?? {}).length > 0
  );
  console.log(`(${Date.now() - t2}ms) detected=${detectedLocale} locales=${locales.length}/12`);
  console.log("  en:", translations.en);
  console.log("  ko:", translations.ko?.title, "| ja:", translations.ja?.title);
  if (locales.length < 11) throw new Error(`FAIL: only ${locales.length}/12 locales translated`);

  console.log("\n=== 4. full news content generation ===");
  const t3 = Date.now();
  const content = await processNewsCluster(clusters[0]);
  console.log(`(${Date.now() - t3}ms)`);
  console.log("  title:", content.title);
  console.log("  slug:", content.suggestedSlug);
  console.log("  story chars:", content.storyContent.length);
  console.log("  meta:", content.metaDescription.slice(0, 100));
  console.log("  tags:", content.newsTags);
  if (!content.title || content.storyContent.length < 300) {
    throw new Error("FAIL: generated content too thin");
  }

  console.log("\nALL PASS");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
