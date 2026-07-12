import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// ponytail: null when unconfigured so the app stays usable anonymously
// instead of crashing at module load (accounts are an optional feature).
export const supabase = url && anonKey ? createClient(url, anonKey) : null;
