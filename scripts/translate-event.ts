// Trigger translation for an existing event
const eventId = process.argv[2];
const title = process.argv[3];
const description = process.argv[4];

if (!eventId || !title) {
  console.error('Usage: bun run scripts/translate-event.ts <event-id> <title> [description]');
  console.error('Example: bun run scripts/translate-event.ts "abc-123" "Event Title" "Event Description"');
  process.exit(1);
}

console.log(`Triggering translation for event: ${eventId}`);
console.log(`  Title: ${title}`);
if (description) {
  console.log(`  Description: ${description.substring(0, 100)}...`);
}

const fields = [];
if (title) {
  fields.push({ field_name: "title", text: title });
}
if (description) {
  fields.push({ field_name: "description", text: description });
}

// Use absolute URL - works both locally and in production
const apiUrl = process.env.NEXT_PUBLIC_SITE_URL
  ? `${process.env.NEXT_PUBLIC_SITE_URL}/api/translate`
  : 'http://localhost:3000/api/translate';

fetch(apiUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    content_type: 'event',
    content_id: eventId,
    fields,
    detect_language: true,
  }),
})
  .then(response => {
    if (response.ok) {
      console.log('\n✓ Translation triggered! The event will be translated to all 12 languages in the background.');
      console.log('  Languages: en, vi, ko, zh, ru, fr, ja, ms, th, de, es, id');
      console.log('\nCheck the content_translations table to see the translations.');
    } else {
      return response.text().then(text => {
        console.error('Translation failed:', text);
        process.exit(1);
      });
    }
  })
  .catch(error => {
    console.error('Translation trigger failed:', error);
    process.exit(1);
  });
