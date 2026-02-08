// Tony Miller Exhibition API
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    );
    
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('id', '9258d8c9-da9e-4c13-86ef-4d7d54e4d740')
      .single();
      
    if (error) throw error;
    
    res.status(200).json({
      status: 'SUCCESS: Tony Miller Exhibition Found!',
      event: data
    });
    
  } catch (err) {
    res.status(500).json({
      error: 'Failed to fetch Tony Miller exhibition',
      message: err.message
    });
  }
}