export type MapLibre = typeof import("maplibre-gl");

// MapLibre builds its web worker from its own source text, so it has to run
// exactly as published: bundled and re-minified by the app build, the worker
// dies with "b is not defined". The published file is served from /public
// (same version as the package, which supplies the types and the stylesheet).
const MAPLIBRE_SRC = "/vendor/maplibre-gl-5.24.0.js";
let mapLibreLoading: Promise<MapLibre> | null = null;

export function loadMapLibre(): Promise<MapLibre> {
  const scope = window as Window & { maplibregl?: MapLibre };
  if (scope.maplibregl) return Promise.resolve(scope.maplibregl);
  mapLibreLoading ??= new Promise<MapLibre>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = MAPLIBRE_SRC;
    script.async = true;
    script.onload = () =>
      scope.maplibregl ? resolve(scope.maplibregl) : reject(new Error("maplibre-gl did not load"));
    script.onerror = () => {
      mapLibreLoading = null;
      reject(new Error("maplibre-gl failed to load"));
    };
    document.head.appendChild(script);
  });
  return mapLibreLoading;
}
