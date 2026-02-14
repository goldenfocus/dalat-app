import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * POST /api/yang-test - Create a test event (Yang AI Demo)
 */
export async function POST() {
  try {
    // Use service role key to bypass RLS
    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // For demo purposes, we'll create a test user session
    // In production, this would come from actual authentication
    
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
      status: "published" as const,
      tribe_visibility: "public" as const,
      is_online: true,
      online_link: "https://meet.google.com/test-yang-ai-demo",
      price_type: "free" as const,
      capacity: 100,
      // We need a real user ID - let's try to get one from the database
      created_by: "temp-user-id", // Will be replaced
      ai_tags: ["AI", "Demo", "Testing", "Yang", "Automation"],
      spam_score: 0,
      source_locale: "en",
      title_position: "bottom" as const,
      image_fit: "cover" as const,
    };

    // Try to get a real user ID first
    const { data: users, error: userError } = await supabase
      .from('profiles')
      .select('id')
      .limit(1);

    if (userError || !users || users.length === 0) {
      return NextResponse.json({ 
        error: "No users found in database. Need at least one user account.",
        details: userError?.message 
      }, { status: 400 });
    }

    // Use the first user ID found
    eventData.created_by = users[0].id;

    console.log('Creating test event with user ID:', eventData.created_by);
    
    const { data: event, error: eventError } = await supabase
      .from('events')
      .insert([eventData])
      .select()
      .single();
    
    if (eventError) {
      console.error('Error creating event:', eventError);
      return NextResponse.json({ 
        error: "Failed to create event",
        details: eventError.message,
        code: eventError.code,
        hint: eventError.hint
      }, { status: 500 });
    }
    
    return NextResponse.json({
      success: true,
      message: "Test event created successfully!",
      event: {
        id: event.id,
        slug: event.slug,
        title: event.title,
        url: `https://dalat.app/events/${event.slug}`
      }
    });
    
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ 
      error: "Unexpected server error",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
}

/**
 * DELETE /api/yang-test - Delete the most recent Yang test event
 */
export async function DELETE() {
  try {
    const supabase = await createClient();

    // Find the most recent Yang test event
    const { data: events, error: findError } = await supabase
      .from('events')
      .select('id, slug, title')
      .ilike('title', '%Yang%Test%')
      .order('created_at', { ascending: false })
      .limit(1);

    if (findError) {
      return NextResponse.json({ 
        error: "Failed to find test events",
        details: findError.message 
      }, { status: 500 });
    }

    if (!events || events.length === 0) {
      return NextResponse.json({ 
        message: "No Yang test events found to delete"
      });
    }

    const eventToDelete = events[0];
    
    const { error: deleteError } = await supabase
      .from('events')
      .delete()
      .eq('id', eventToDelete.id);
    
    if (deleteError) {
      return NextResponse.json({ 
        error: "Failed to delete event",
        details: deleteError.message 
      }, { status: 500 });
    }
    
    return NextResponse.json({
      success: true,
      message: "Test event deleted successfully!",
      deleted: eventToDelete
    });
    
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ 
      error: "Unexpected server error",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
}