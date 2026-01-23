import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

async function check() {
  // Events at Da Lat center (defaulted)
  const { data: defaulted } = await supabase
    .from("events")
    .select("id, title, location_name, address, latitude, longitude")
    .gte("latitude", 11.94)
    .lte("latitude", 11.941)
    .gte("longitude", 108.458)
    .lte("longitude", 108.459);

  // Events with no coordinates at all
  const { data: noCoords } = await supabase
    .from("events")
    .select("id, title, location_name, address")
    .is("latitude", null);

  console.log("=== Events at Da Lat center (failed geocoding) ===");
  console.log("Count:", defaulted?.length || 0);
  defaulted?.forEach((e) => {
    console.log(`- [${e.id}] ${e.title}`);
    console.log(`  location: ${e.location_name}`);
    console.log(`  address: ${e.address}`);
  });

  console.log("\n=== Events with NULL coordinates ===");
  console.log("Count:", noCoords?.length || 0);
  noCoords?.forEach((e) => {
    console.log(`- [${e.id}] ${e.title} | location: ${e.location_name}`);
  });
}

check();
