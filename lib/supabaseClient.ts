import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://juwppanrmaxhwrgpseat.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_z3efnqgL0f8BYFWCMJbNlg_jnsI_wlZ';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
