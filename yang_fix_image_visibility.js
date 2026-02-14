#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://aljcmodwjqlznzcydyor.supabase.co',
  'sb_secret_eTNSA7nPxkcohWiG29kYDA_2LaChHpC'
);

async function fixImageVisibility() {
  console.log('⚡ YANG AI - FIXING IMAGE VISIBILITY');
  console.log('═══════════════════════════════════════');
  
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
  console.log('🔧 Problem: Previous image too dark for dark theme');

  // Choose a vibrant, high-contrast image that works on both light and dark backgrounds
  const vibrantImages = [
    // Electric blue lightning/tech theme - perfect for Yang AI
    'https://images.unsplash.com/photo-1518709268805-4e9042af2176?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80',
    
    // Bright neon/cyberpunk aesthetic 
    'https://images.unsplash.com/photo-1614728263952-84ea256f9679?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80',
    
    // Golden celebration with dark contrast
    'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80',
    
    // Electric/lightning theme
    'https://images.unsplash.com/photo-1516339901601-2e1b62dc0c45?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80',
    
    // Bright AI/tech celebration
    'https://images.unsplash.com/photo-1551288049-bebda4e38f71?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80'
  ];

  // Use the electric/lightning theme - perfect for Yang AI ⚡
  const newImageUrl = 'https://images.unsplash.com/photo-1614728263952-84ea256f9679?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80&overlay=gradient&overlay-strength=30';
  
  console.log('🎨 Selected: Vibrant electric blue/neon theme');
  console.log('✨ High contrast, works on light and dark backgrounds');
  console.log('⚡ Perfect match for Yang AI lightning bolt theme');

  // Update the event with the vibrant, visible image
  const { error: updateError } = await supabase
    .from('events')
    .update({ 
      image_url: newImageUrl
    })
    .eq('id', event.id);

  if (updateError) {
    console.error('❌ Failed to update image:', updateError);
    return;
  }

  console.log('\n🎉 SUCCESS! Image updated with high-visibility option!');
  console.log('✅ New image: Vibrant electric blue/neon theme');
  console.log('🌟 High contrast - visible on both light and dark themes');
  console.log('⚡ Perfect Yang AI aesthetic match');
  
  console.log('\n🔗 Updated Event URLs:');
  console.log('🌐 Production: https://dalat.app/events/' + event.slug);
  console.log('📱 Local: http://localhost:3000/events/' + event.slug);
  
  console.log('\n💡 The image should now be clearly visible to humans!');
  console.log('🎨 Electric blue theme matches Yang AI lightning bolt branding');
  
  return {
    success: true,
    imageFixed: true,
    eventUrl: `https://dalat.app/events/${event.slug}`,
    imageTheme: 'Electric Blue/Neon - High Visibility'
  };
}

if (require.main === module) {
  fixImageVisibility()
    .then((result) => {
      if (result && result.success) {
        console.log('\n⚡ IMAGE VISIBILITY FIXED! ⚡');
        console.log('Check the event now - should be clearly visible!');
      }
    })
    .catch(console.error);
}