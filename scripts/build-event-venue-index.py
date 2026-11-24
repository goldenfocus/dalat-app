"""Build the Đà Lạt public venue snapshot from Geofabrik's Vietnam OSM PBF.

Usage: python3 -m pip install osmium
       python3 scripts/build-event-venue-index.py /path/to/vietnam.osm.pbf
Source: https://download.geofabrik.de/asia/vietnam/index.html
© OpenStreetMap contributors, ODbL: https://www.openstreetmap.org/copyright
"""
import json
from pathlib import Path
import sys

import osmium


AMENITIES = {
    "cafe": "cafe", "restaurant": "restaurant", "fast_food": "restaurant",
    "bar": "bar", "pub": "bar", "biergarten": "bar",
    "community_centre": "community_center", "arts_centre": "gallery",
    "marketplace": "other", "theatre": "other", "library": "other",
}
TOURISM = {
    "hotel": "hotel", "motel": "hotel", "hostel": "homestay",
    "guest_house": "homestay", "museum": "gallery", "gallery": "gallery",
}
LEISURE = {"park": "park", "garden": "park", "sports_centre": "other"}


def kind(tags):
    if tags.get("access") in {"private", "no"} or tags.get("disused") == "yes" or tags.get("abandoned") == "yes":
        return None
    return (AMENITIES.get(tags.get("amenity")) or TOURISM.get(tags.get("tourism"))
            or LEISURE.get(tags.get("leisure"))
            or ("other" if tags.get("shop") not in {None, "no", "vacant", "yes"} else None)
            or ("coworking" if tags.get("office") == "coworking" else None))


class PublicVenues(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.venues = []

    def add(self, obj, obj_type, lat, lng):
        if not 11.83 <= lat <= 12.09 or not 108.31 <= lng <= 108.65:
            return
        tags = obj.tags
        name = tags.get("name", "").strip()
        category = kind(tags)
        if not category or not name:
            return
        street = tags.get("addr:street", "").strip()
        number = tags.get("addr:housenumber", "").strip()
        full = tags.get("addr:full", "").strip()
        address = full or " ".join(part for part in (number, street) if part)
        if not full and not street:
            address = ""
        self.venues.append({
            "id": f"{obj_type}/{obj.id}", "name": name, "address": address or None,
            "latitude": round(lat, 6), "longitude": round(lng, 6), "venueType": category,
        })

    def node(self, obj):
        if obj.location.valid():
            self.add(obj, "node", obj.location.lat, obj.location.lon)

    def way(self, obj):
        if not obj.tags.get("name") or not kind(obj.tags):
            return
        points = {(n.location.lat, n.location.lon) for n in obj.nodes if n.location.valid()}
        if points:
            self.add(obj, "way", sum(p[0] for p in points) / len(points),
                     sum(p[1] for p in points) / len(points))


source = sys.argv[1]
with osmium.io.Reader(source) as reader:
    timestamp = reader.header().get("osmosis_replication_timestamp")

extract = PublicVenues()
extract.apply_file(source, locations=True)
output = Path(__file__).resolve().parents[1] / "public/data/venues/dalat-openstreetmap.json"
output.write_text(
    "{\n  \"source\": \"https://download.geofabrik.de/asia/vietnam/index.html\",\n"
    "  \"license\": \"https://www.openstreetmap.org/copyright\",\n"
    f"  \"timestamp\": {json.dumps(timestamp)},\n"
    "  \"venues\": [\n"
    + ",\n".join("    " + json.dumps(row, ensure_ascii=False, separators=(",", ":"))
                  for row in sorted(extract.venues, key=lambda row: row["id"]))
    + "\n  ]\n}\n",
    encoding="utf-8",
)
print(f"Extracted {len(extract.venues)} public venues to {output.name}")
