/**
 * OpenStreetMap data fetcher via Overpass API.
 * Returns GeoJSON features for buildings, roads, water, and parks.
 */

import osmtogeojsonImport from "osmtogeojson";
const osmtogeojson = osmtogeojsonImport.default || osmtogeojsonImport;

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

/**
 * Fetch OSM data for a bounding box.
 * @param {number} south
 * @param {number} west
 * @param {number} north
 * @param {number} east
 * @param {function} onProgress - called with status string
 * @returns {Promise<{buildings: Array, roads: Array, water: Array, parks: Array}>}
 */
export async function fetchOSMData(south, west, north, east, onProgress = () => {}) {
  const bbox = `${south},${west},${north},${east}`;

  const query = `
    [out:json][timeout:90][bbox:${bbox}];
    (
      way["building"];
      relation["building"];
      way["highway"];
      way["natural"="water"];
      relation["natural"="water"];
      way["leisure"="park"];
      way["landuse"="grass"];
    );
    out body;>;out skel qt;
  `;

  onProgress("Fetching map data...");

  const response = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!response.ok) {
    throw new Error(`Overpass API error: ${response.status} ${response.statusText}`);
  }

  onProgress("Parsing map data...");
  const osmData = await response.json();
  const geojson = osmtogeojson(osmData);

  onProgress("Categorizing features...");

  const buildings = [];
  const roads = [];
  const water = [];
  const parks = [];

  for (const feature of geojson.features) {
    const props = feature.properties || {};
    const tags = props.tags || props;

    if (tags.building) {
      buildings.push(feature);
    } else if (tags.highway) {
      roads.push(feature);
    } else if (tags.natural === "water") {
      water.push(feature);
    } else if (tags.leisure === "park" || tags.landuse === "grass") {
      parks.push(feature);
    }
  }

  onProgress(`Found ${buildings.length} buildings, ${roads.length} roads`);

  return { buildings, roads, water, parks };
}

/**
 * Geocode a city name to lat/lng using Nominatim.
 * @param {string} query - city name
 * @returns {Promise<{lat: number, lng: number, displayName: string, bbox: number[]}>}
 */
export async function geocodeCity(query) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;

  const res = await fetch(url, {
    headers: { "User-Agent": "KaijuCity/1.0 (game prototype)" },
  });

  const results = await res.json();
  if (results.length === 0) throw new Error(`City not found: ${query}`);

  const r = results[0];
  return {
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
    displayName: r.display_name,
    bbox: r.boundingbox.map(parseFloat), // [south, north, west, east]
  };
}
