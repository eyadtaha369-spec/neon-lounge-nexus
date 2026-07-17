import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  // Fall back to a no-op client shape so the app doesn't crash in environments
  // without env vars; components handle missing data gracefully.
  console.warn("Supabase env vars missing — running in offline mode.");
}

export const supabase = createClient(
  url ?? "http://localhost",
  anonKey ?? "public-anon-key",
  {
    auth: { persistSession: false },
  },
);

// Stable seed IDs from the migration (so the app can reference menu/inventory
// rows without a round-trip on first load).
export const SEED = {
  menu: {
    espresso: "11111111-1111-1111-1111-111111111101",
    latte: "11111111-1111-1111-1111-111111111102",
    lemonade: "11111111-1111-1111-1111-111111111103",
    soda: "11111111-1111-1111-1111-111111111104",
    chips: "11111111-1111-1111-1111-111111111105",
    water: "11111111-1111-1111-1111-111111111106",
  },
} as const;
