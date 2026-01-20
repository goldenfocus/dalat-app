/**
 * Add filter & geolocation i18n keys to all 12 locale files
 * Run with: node scripts/add-filter-i18n.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LOCALES = ['en', 'vi', 'ko', 'zh', 'ru', 'fr', 'ja', 'ms', 'th', 'de', 'es', 'id'];

// Translations for each locale
const translations = {
  en: {
    filters: {
      title: "Filters",
      categories: "Categories",
      price: "Price",
      priceAll: "All Events",
      priceFree: "Free Only",
      pricePaid: "Paid Only",
      dateRange: "Date Range",
      distance: "Distance",
      nearMe: "Near Me",
      thisWeekend: "This Weekend",
      freeEvents: "Free Events",
      trending: "Trending",
      apply: "Apply Filters",
      clear: "Clear All",
      activeFilters: "Active Filters",
      viewMode: {
        list: "List",
        grid: "Grid",
        map: "Map",
        calendar: "Calendar"
      },
      calendarView: {
        month: "Month",
        week: "Week",
        day: "Day",
        agenda: "Agenda"
      }
    },
    geolocation: {
      requestPermission: "Enable location to see events near you",
      permissionDenied: "Location permission denied",
      errorTimeout: "Location request timed out",
      enable: "Enable Location"
    }
  },
  vi: {
    filters: {
      title: "Bộ lọc",
      categories: "Danh mục",
      price: "Giá",
      priceAll: "Tất cả sự kiện",
      priceFree: "Chỉ miễn phí",
      pricePaid: "Chỉ có phí",
      dateRange: "Khoảng thời gian",
      distance: "Khoảng cách",
      nearMe: "Gần tôi",
      thisWeekend: "Cuối tuần này",
      freeEvents: "Sự kiện miễn phí",
      trending: "Xu hướng",
      apply: "Áp dụng bộ lọc",
      clear: "Xóa tất cả",
      activeFilters: "Bộ lọc đang hoạt động",
      viewMode: {
        list: "Danh sách",
        grid: "Lưới",
        map: "Bản đồ",
        calendar: "Lịch"
      },
      calendarView: {
        month: "Tháng",
        week: "Tuần",
        day: "Ngày",
        agenda: "Chương trình"
      }
    },
    geolocation: {
      requestPermission: "Bật vị trí để xem sự kiện gần bạn",
      permissionDenied: "Quyền truy cập vị trí bị từ chối",
      errorTimeout: "Yêu cầu vị trí hết thời gian",
      enable: "Bật vị trí"
    }
  },
};

// For other locales, use English as fallback (you can translate later)
const englishFallback = {
  filters: translations.en.filters,
  geolocation: translations.en.geolocation
};

translations.ko = englishFallback;
translations.zh = englishFallback;
translations.ru = englishFallback;
translations.fr = englishFallback;
translations.ja = englishFallback;
translations.ms = englishFallback;
translations.th = englishFallback;
translations.de = englishFallback;
translations.es = englishFallback;
translations.id = englishFallback;

console.log('🌍 Adding filter i18n keys to all locale files...\n');

for (const locale of LOCALES) {
  const filePath = join(__dirname, '..', 'messages', `${locale}.json`);

  try {
    // Read existing file
    const content = readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);

    // Add new keys if they don't exist
    if (!data.filters) {
      data.filters = translations[locale].filters;
      console.log(`✅ Added filters to ${locale}.json`);
    } else {
      console.log(`⏭️  Skipped ${locale}.json (filters already exist)`);
    }

    if (!data.geolocation) {
      data.geolocation = translations[locale].geolocation;
      console.log(`✅ Added geolocation to ${locale}.json`);
    } else {
      console.log(`⏭️  Skipped ${locale}.json (geolocation already exist)`);
    }

    // Write back with nice formatting
    writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');

  } catch (error) {
    console.error(`❌ Error processing ${locale}.json:`, error.message);
  }
}

console.log('\n✨ Done! All locale files updated.');
