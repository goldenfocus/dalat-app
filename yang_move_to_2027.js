#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://aljcmodwjqlznzcydyor.supabase.co',
  'sb_secret_eTNSA7nPxkcohWiG29kYDA_2LaChHpC'
);

async function moveEventTo2027() {
  console.log('🚀 YANG AI - MOVING EVENT TO 2027');
  console.log('══════════════════════════════════');
  
  // Find our event
  const { data: events, error: eventError } = await supabase
    .from('events')
    .select('*')
    .ilike('title', '%Yang AI%Demo%')
    .order('created_at', { ascending: false })
    .limit(1);

  if (eventError || !events || events.length === 0) {
    console.error('❌ Could not find Yang AI demo event');
    return;
  }

  const event = events[0];
  console.log('✅ Found event:', event.title);
  console.log('📅 Current date:', new Date(event.starts_at).toLocaleString());
  
  // Calculate new dates in 2027 - same day/time, different year
  const currentStart = new Date(event.starts_at);
  const currentEnd = new Date(event.ends_at);
  
  // Move to 2027, keep same month/day/time
  const newStart = new Date(currentStart);
  newStart.setFullYear(2027);
  
  const newEnd = new Date(currentEnd);
  newEnd.setFullYear(2027);
  
  console.log('📅 New date:', newStart.toLocaleString());
  console.log('💡 Reason: Keep demo event but move out of immediate upcoming feed');

  // Update the event dates
  const { error: updateError } = await supabase
    .from('events')
    .update({ 
      starts_at: newStart.toISOString(),
      ends_at: newEnd.toISOString()
    })
    .eq('id', event.id);

  if (updateError) {
    console.error('❌ Failed to update event dates:', updateError);
    return;
  }

  console.log('\n🎉 SUCCESS! Event moved to 2027!');
  console.log('✅ New start time:', newStart.toISOString());
  console.log('✅ New end time:', newEnd.toISOString());
  console.log('📱 Event still accessible at same URL');
  console.log('💡 Now hidden from immediate upcoming events feed');
  
  console.log('\n🔗 Event URL (unchanged):');
  console.log('🌐 https://dalat.app/events/' + event.slug);
  
  console.log('\n⚡ Yang AI demo event successfully archived to 2027! ⚡');
  
  return {
    success: true,
    oldDate: currentStart.toISOString(),
    newDate: newStart.toISOString(),
    eventUrl: `https://dalat.app/events/${event.slug}`
  };
}

if (require.main === module) {
  moveEventTo2027()
    .then((result) => {
      if (result && result.success) {
        console.log('\n🗓️ EVENT DATE UPDATED TO 2027! 🗓️');
        console.log('Demo event archived but still accessible!');
      }
    })
    .catch(console.error);
}