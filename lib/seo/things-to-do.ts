import type { Locale } from "@/lib/types";

export const THINGS_TO_DO_PATH = "/things-to-do-in-dalat";

function guideUrl(locale: Locale, path: string): string {
  const normalizedPath =
    path === "/" ? "" : path.startsWith("/") ? path : `/${path}`;
  return locale === "en"
    ? `https://dalat.app${normalizedPath}`
    : `https://dalat.app/${locale}${normalizedPath}`;
}

export type ThingsToDoItem = {
  title: string;
  description: string;
  href: string;
  bestFor: string;
};

type ThingsToDoCopy = {
  metaTitle: string;
  metaDescription: string;
  eyebrow: string;
  title: string;
  answer: string;
  updatedLabel: string;
  liveHeading: string;
  liveDescription: string;
  emptyLive: string;
  browseEvents: string;
  guideHeading: string;
  guideDescription: string;
  practicalHeading: string;
  practicalPoints: string[];
  faqHeading: string;
  items: ThingsToDoItem[];
  faqs: Array<{ question: string; answer: string }>;
};

const EN_COPY: ThingsToDoCopy = {
  metaTitle: "Things to Do in Dalat: Local Events & Experiences",
  metaDescription:
    "Find the best things to do in Dalat right now: live events, cafes, food, nightlife, hiking, art and festivals, with fresh local listings.",
  eyebrow: "Local guide · updated from live listings",
  title: "Things to do in Dalat",
  answer:
    "The best things to do in Dalat combine its pine-covered outdoors with the city’s creative local life: hike, linger in a cafe, eat around the market, then check what is happening tonight. This guide pairs those reliable ideas with real events from ĐàLạt.app, so you can choose what to do now instead of reading a static tourist list.",
  updatedLabel: "Live event listings refresh throughout the day.",
  liveHeading: "What’s happening in Dalat now",
  liveDescription:
    "These are real, published events. Open a listing for its current time, venue and attendance details.",
  emptyLive:
    "No current listings are available in this window. Browse the full calendar or use the ideas below while the local schedule fills in.",
  browseEvents: "Browse all upcoming events",
  guideHeading: "8 genuinely good ways to experience Dalat",
  guideDescription:
    "Pick one outdoor idea, one food or coffee stop, and one event for a balanced day in the city.",
  practicalHeading: "A simple Dalat plan",
  practicalPoints: [
    "Morning: walk or hike while the air is cool, then stop for locally grown coffee.",
    "Afternoon: explore a gallery, workshop, cafe or neighborhood venue.",
    "Evening: eat in town, then check tonight’s live music, meetup or festival schedule.",
  ],
  faqHeading: "Dalat trip questions",
  items: [
    {
      title: "See what’s on tonight",
      description:
        "Start with the city’s current live music, workshops, meetups and community gatherings.",
      href: "/tonight",
      bestFor: "A plan that is actually happening",
    },
    {
      title: "Build a local weekend",
      description:
        "Use the Friday-to-Sunday schedule to anchor a short trip around real events.",
      href: "/this-weekend",
      bestFor: "Short stays and spontaneous plans",
    },
    {
      title: "Slow down in Dalat’s cafes",
      description:
        "Coffee is part of the rhythm here; browse cafes that also host music, art and gatherings.",
      href: "/cafes",
      bestFor: "Coffee, conversation and rainy hours",
    },
    {
      title: "Walk and hike the highlands",
      description:
        "Trade traffic for pine air, hills and trails around Vietnam’s cool highland city.",
      href: "/hiking",
      bestFor: "Clear mornings and active days",
    },
    {
      title: "Find food worth stopping for",
      description:
        "Browse restaurants and neighborhood venues, then pair dinner with a nearby event.",
      href: "/restaurants",
      bestFor: "Local flavors and an easy evening",
    },
    {
      title: "Catch Dalat after dark",
      description:
        "Look beyond the night market for bars, performances and intimate local venues.",
      href: "/bars",
      bestFor: "Nightlife and live music",
    },
    {
      title: "Explore art and creative spaces",
      description:
        "Find galleries and community spaces where exhibitions, screenings and workshops happen.",
      href: "/galleries",
      bestFor: "Culture and indoor afternoons",
    },
    {
      title: "Plan around a festival",
      description:
        "Check seasonal celebrations and multi-day programs before locking in your dates.",
      href: "/festivals",
      bestFor: "Big weekends and special trips",
    },
  ],
  faqs: [
    {
      question: "What are the best things to do in Dalat?",
      answer:
        "Mix Dalat’s outdoors, coffee and food with something from the live local calendar. Hiking, cafes, galleries, markets, live music and seasonal festivals make a well-rounded visit.",
    },
    {
      question: "What can I do in Dalat tonight?",
      answer:
        "Check the Tonight page for currently published music, workshops, meetups and community events. Listings show the event time and venue so you can verify the plan before going.",
    },
    {
      question: "How many days should I spend in Dalat?",
      answer:
        "Two or three full days work well for a first visit: one outdoors day, one city and cafe day, and an evening built around a local event. Add time if you want slower mornings or longer hikes.",
    },
    {
      question: "Are Dalat, Da Lat and Đà Lạt the same place?",
      answer:
        "Yes. Đà Lạt is the Vietnamese spelling; Da Lat and Dalat are common unaccented spellings for the same highland city in Vietnam.",
    },
  ],
};

const VI_COPY: ThingsToDoCopy = {
  metaTitle: "Đà Lạt Có Gì Chơi: Sự Kiện & Trải Nghiệm Địa Phương",
  metaDescription:
    "Khám phá Đà Lạt có gì chơi ngay lúc này: sự kiện, quán cà phê, ẩm thực, nhạc sống, hiking, nghệ thuật và lễ hội được cập nhật liên tục.",
  eyebrow: "Cẩm nang địa phương · cập nhật từ lịch sự kiện thật",
  title: "Đà Lạt có gì chơi?",
  answer:
    "Một ngày đáng nhớ ở Đà Lạt thường kết hợp thiên nhiên đồi thông với nhịp sống sáng tạo của thành phố: đi bộ, ghé quán cà phê, ăn quanh chợ rồi xem tối nay có gì. Cẩm nang này nối những gợi ý bền vững đó với sự kiện thật trên ĐàLạt.app để bạn chọn được một kế hoạch đang diễn ra.",
  updatedLabel: "Lịch sự kiện được làm mới nhiều lần trong ngày.",
  liveHeading: "Đang diễn ra và sắp tới ở Đà Lạt",
  liveDescription:
    "Đây là các sự kiện đã được đăng công khai. Mở từng sự kiện để kiểm tra giờ, địa điểm và thông tin tham dự mới nhất.",
  emptyLive:
    "Hiện chưa có sự kiện phù hợp trong khung thời gian này. Bạn có thể xem toàn bộ lịch hoặc chọn một gợi ý bên dưới.",
  browseEvents: "Xem tất cả sự kiện sắp tới",
  guideHeading: "8 cách thật sự hay để trải nghiệm Đà Lạt",
  guideDescription:
    "Chọn một hoạt động ngoài trời, một điểm ăn uống hoặc cà phê và một sự kiện để có một ngày cân bằng.",
  practicalHeading: "Một lịch trình Đà Lạt đơn giản",
  practicalPoints: [
    "Buổi sáng: đi bộ hoặc hiking khi trời mát, sau đó thưởng thức cà phê địa phương.",
    "Buổi chiều: khám phá phòng tranh, workshop, quán cà phê hoặc không gian cộng đồng.",
    "Buổi tối: ăn trong thành phố rồi xem lịch nhạc sống, gặp gỡ hoặc lễ hội tối nay.",
  ],
  faqHeading: "Câu hỏi khi đi Đà Lạt",
  items: [
    {
      title: "Xem tối nay có gì",
      description:
        "Bắt đầu với nhạc sống, workshop, meetup và hoạt động cộng đồng đang có lịch thật.",
      href: "/tonight",
      bestFor: "Một kế hoạch chắc chắn đang diễn ra",
    },
    {
      title: "Lên kế hoạch cuối tuần",
      description:
        "Dùng lịch từ thứ Sáu đến Chủ Nhật để sắp xếp chuyến đi ngắn quanh các sự kiện thật.",
      href: "/this-weekend",
      bestFor: "Chuyến đi ngắn và kế hoạch ngẫu hứng",
    },
    {
      title: "Chậm lại ở quán cà phê",
      description:
        "Khám phá những quán cà phê còn tổ chức âm nhạc, nghệ thuật và gặp gỡ cộng đồng.",
      href: "/cafes",
      bestFor: "Cà phê, trò chuyện và những giờ mưa",
    },
    {
      title: "Đi bộ giữa cao nguyên",
      description:
        "Rời phố đông để tận hưởng đồi thông, không khí mát và những cung đường quanh thành phố.",
      href: "/hiking",
      bestFor: "Buổi sáng quang đãng và ngày năng động",
    },
    {
      title: "Tìm một bữa ăn đáng nhớ",
      description:
        "Duyệt nhà hàng và địa điểm khu phố, rồi kết hợp bữa tối với sự kiện gần đó.",
      href: "/restaurants",
      bestFor: "Hương vị địa phương và buổi tối nhẹ nhàng",
    },
    {
      title: "Khám phá Đà Lạt về đêm",
      description:
        "Đi xa hơn chợ đêm để tìm quán bar, buổi diễn và những địa điểm nhỏ thân mật.",
      href: "/bars",
      bestFor: "Cuộc sống về đêm và nhạc sống",
    },
    {
      title: "Ghé không gian nghệ thuật",
      description:
        "Tìm phòng tranh và không gian cộng đồng có triển lãm, chiếu phim hoặc workshop.",
      href: "/galleries",
      bestFor: "Văn hóa và buổi chiều trong nhà",
    },
    {
      title: "Sắp lịch theo lễ hội",
      description:
        "Kiểm tra lễ hội theo mùa và chương trình nhiều ngày trước khi chốt thời gian đi.",
      href: "/festivals",
      bestFor: "Cuối tuần lớn và chuyến đi đặc biệt",
    },
  ],
  faqs: [
    {
      question: "Đà Lạt có gì chơi?",
      answer:
        "Hãy kết hợp thiên nhiên, cà phê và ẩm thực Đà Lạt với một hoạt động trong lịch sự kiện thật. Hiking, phòng tranh, chợ, nhạc sống và lễ hội theo mùa tạo nên chuyến đi đa dạng.",
    },
    {
      question: "Tối nay ở Đà Lạt có gì?",
      answer:
        "Xem trang Tối Nay để tìm nhạc sống, workshop, meetup và hoạt động cộng đồng đã được đăng. Mỗi trang sự kiện có giờ và địa điểm để bạn kiểm tra trước khi đi.",
    },
    {
      question: "Nên đi Đà Lạt mấy ngày?",
      answer:
        "Hai hoặc ba ngày trọn vẹn phù hợp cho lần đầu: một ngày ngoài trời, một ngày quanh thành phố và quán cà phê, cùng một buổi tối theo lịch sự kiện địa phương.",
    },
    {
      question: "Dalat, Da Lat và Đà Lạt có phải cùng một nơi?",
      answer:
        "Đúng. Đà Lạt là cách viết tiếng Việt; Da Lat và Dalat là hai cách viết không dấu phổ biến của cùng một thành phố cao nguyên ở Việt Nam.",
    },
  ],
};

export function getThingsToDoCopy(locale: Locale): ThingsToDoCopy {
  return locale === "vi" ? VI_COPY : EN_COPY;
}

export function buildThingsToDoSchemas(
  locale: Locale,
): Array<Record<string, unknown>> {
  const copy = getThingsToDoCopy(locale);
  const pageUrl = guideUrl(locale, THINGS_TO_DO_PATH);

  return [
    {
      "@context": "https://schema.org",
      "@type": ["WebPage", "CollectionPage"],
      "@id": `${pageUrl}#webpage`,
      url: pageUrl,
      name: copy.metaTitle,
      description: copy.metaDescription,
      inLanguage: locale,
      about: {
        "@type": "TouristDestination",
        name: "Đà Lạt",
        alternateName: ["Da Lat", "Dalat"],
        geo: {
          "@type": "GeoCoordinates",
          latitude: 11.9404,
          longitude: 108.4583,
        },
        address: {
          "@type": "PostalAddress",
          addressLocality: "Đà Lạt",
          addressRegion: "Lâm Đồng",
          addressCountry: "VN",
        },
      },
      mainEntity: {
        "@type": "ItemList",
        numberOfItems: copy.items.length,
        itemListElement: copy.items.map((item, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: item.title,
          description: item.description,
          url: guideUrl(locale, item.href),
        })),
      },
      isPartOf: { "@id": `${guideUrl(locale, "/")}#website` },
      publisher: {
        "@type": "Organization",
        name: "ĐàLạt.app",
        url: "https://dalat.app",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: locale === "vi" ? "Trang chủ" : "Home",
          item: guideUrl(locale, "/"),
        },
        {
          "@type": "ListItem",
          position: 2,
          name: copy.title,
          item: pageUrl,
        },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: copy.faqs.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: { "@type": "Answer", text: faq.answer },
      })),
    },
  ];
}
