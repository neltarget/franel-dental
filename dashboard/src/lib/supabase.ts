import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://qsqlipuyosgdzyphcfts.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_bv8u5Kiq38yg_GfwtKX3vA_NOOGcsR-'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
