import { VENUE_MARKER_COLORS } from "@/lib/constants/venue-types";

/**
 * Create a venue marker element for the map.
 * Different styles based on venue activity:
 * - Gray: No upcoming events
 * - Green: Has upcoming events (shows count badge)
 * - Red pulsing: Event happening now
 */
export function createVenueMarkerElement(
  theme: "light" | "dark",
  upcomingCount: number = 0,
  isHappeningNow: boolean = false,
  isSelected: boolean = false
): HTMLElement {
  // Determine color based on state
  let bgColor: string;
  if (isHappeningNow) {
    bgColor = VENUE_MARKER_COLORS.happening[theme];
  } else if (upcomingCount > 0) {
    bgColor = VENUE_MARKER_COLORS.active[theme];
  } else {
    bgColor = VENUE_MARKER_COLORS.default[theme];
  }

  const markerDiv = document.createElement("div");
  markerDiv.className = "relative cursor-pointer";
  markerDiv.style.transition = "transform 0.2s ease-out";
  markerDiv.style.transform = isSelected ? "scale(1.15)" : "scale(1)";

  if (isHappeningNow) {
    markerDiv.setAttribute("data-happening", "true");
  }
  if (upcomingCount > 0) {
    markerDiv.setAttribute("data-upcoming-count", upcomingCount.toString());
  }
  markerDiv.setAttribute("data-venue-marker", "true");

  const container = document.createElement("div");
  container.style.cssText = "position: relative; display: flex; flex-direction: column; align-items: center;";

  // Add pulsing ring for happening now
  if (isHappeningNow) {
    const pulseRing = document.createElement("div");
    pulseRing.style.cssText = `
      position: absolute;
      top: -4px;
      left: -4px;
      right: -4px;
      bottom: 8px;
      border-radius: 24px;
      border: 2px solid ${VENUE_MARKER_COLORS.happening[theme]};
      animation: pulse-ring 1.5s ease-out infinite;
      pointer-events: none;
    `;
    container.appendChild(pulseRing);
  }

  const pill = document.createElement("div");
  pill.setAttribute("data-marker-pill", "true");
  pill.style.cssText = `
    background: ${bgColor};
    border-radius: 20px;
    padding: 6px 10px;
    display: flex;
    align-items: center;
    gap: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25), 0 2px 4px rgba(0, 0, 0, 0.1);
    border: 2px solid white;
    position: relative;
    z-index: 1;
  `;

  // Building SVG icon (different from event's calendar icon)
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M19 21V5a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5m-4 0h4");
  path.setAttribute("stroke", "white");
  path.setAttribute("stroke-width", "2");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.appendChild(path);
  pill.appendChild(svg);

  // Add event count badge if has upcoming events
  if (upcomingCount > 0) {
    const countSpan = document.createElement("span");
    countSpan.style.cssText = `
      color: white;
      font-size: 11px;
      font-weight: 600;
      line-height: 1;
    `;
    countSpan.textContent = upcomingCount.toString();
    pill.appendChild(countSpan);
  }

  // Triangle pointer
  const pointer = document.createElement("div");
  pointer.style.cssText = `
    width: 0;
    height: 0;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-top: 8px solid ${bgColor};
    margin-top: -2px;
    filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.15));
    position: relative;
    z-index: 1;
  `;

  container.appendChild(pill);
  container.appendChild(pointer);
  markerDiv.appendChild(container);

  return markerDiv;
}
