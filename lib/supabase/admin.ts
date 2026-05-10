import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';
import { type Database } from '@/lib/database.types';

function required(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function createAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

  return createClient<Database>(env.supabaseUrl, required('SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY', serviceKey), {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
