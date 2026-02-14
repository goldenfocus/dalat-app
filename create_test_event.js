#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase
const supabase = createClient(
  'https://aljcmodwjqlznzcydyor.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFsamNtb2R3anFsem56Y3lkeW9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2MjMwMzUsImV4cCI6MjA4MjE5OTAzNX0.X4a1xKPuz-EJY17pg61fT3DG_Fax5SkHPs3WX-WJlBw'
);

async function createTestEvent() {
  const now = new Date();
  const startTime = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Tomorrow
  const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000); // 2 hours later
  
  const eventData = {
    slug: `yang-test-event-${Date.now()}`,
    previous_slugs: [],
    title: "⚡ Yang's Test Event - AI Demo",
    description: "This is a test event created by Yang (AI assistant) to demonstrate automated event creation capabilities for DALAT.app. Please delete after testing! 🤖",
    starts_at: startTime.toISOString(),
    ends_at: endTime.toISOString(),
    timezone: "Asia/Ho_Chi_Minh",
    location_name: "Virtual - AI Testing Lab",
    address: "Cyberspace, Internet",
    status: "published",
    tribe_visibility: "public",
    is_online: true,
    online_link: "https://meet.google.com/test-yang-ai-demo",
    price_type: "free",
    capacity: 100,
    // Default required fields
    created_by: "00000000-0000-0000-0000-000000000000", // Will need actual user ID
    ai_tags: ["AI", "Demo", "Testing", "Yang", "Automation"],
    spam_score: 0,
    source_locale: "en"
  };
  
  try {
    console.log('Creating test event:', eventData.title);
    console.log('Event slug:', eventData.slug);
    
    const { data, error } = await supabase
      .from('events')
      .insert([eventData])
      .select();
    
    if (error) {
      console.error('❌ Error creating event:', error);
      return null;
    }
    
    console.log('✅ Event created successfully!');
    console.log('Event ID:', data[0].id);
    console.log('Event URL: https://dalat.app/events/' + data[0].slug);
    
    return data[0];
  } catch (err) {
    console.error('❌ Unexpected error:', err);
    return null;
  }
}

async function deleteTestEvent(eventId) {
  try {
    console.log('🗑️ Deleting test event:', eventId);
    
    const { error } = await supabase
      .from('events')
      .delete()
      .eq('id', eventId);
    
    if (error) {
      console.error('❌ Error deleting event:', error);
      return false;
    }
    
    console.log('✅ Event deleted successfully!');
    return true;
  } catch (err) {
    console.error('❌ Unexpected error deleting event:', err);
    return false;
  }
}

async function main() {
  console.log('⚡ Yang AI Assistant - Event Creation Demo\n');
  
  // Create the event
  const event = await createTestEvent();
  if (!event) return;
  
  console.log('\n⏰ Event will be automatically deleted in 30 seconds...');
  
  // Wait 30 seconds then delete it
  setTimeout(async () => {
    await deleteTestEvent(event.id);
    console.log('\n🎉 Demo complete! Event lifecycle demonstrated successfully.');
    process.exit(0);
  }, 30000);
}

if (require.main === module) {
  main();
}