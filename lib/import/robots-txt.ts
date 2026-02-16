/**
 * robots.txt compliance checker.
 * Caches robots.txt per domain for 24 hours.
 * All news scrapers must check this before fetching.
 */

interface RobotsRules {
  disallow: string[];
  allow: string[];
  fetchedAt: number;
}

const robotsCache: Record<string, RobotsRules> = {};
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const USER_AGENT = 'DalatApp';

function getDomain(url: string): string {
  const parsed = new URL(url);
  return `${parsed.protocol}//${parsed.hostname}`;
}

async function fetchRobotsTxt(domain: string): Promise<RobotsRules> {
  const rules: RobotsRules = { disallow: [], allow: [], fetchedAt: Date.now() };

  try {
    const res = await fetch(`${domain}/robots.txt`, {
      headers: { 'User-Agent': `Mozilla/5.0 (compatible; ${USER_AGENT}/1.0; +https://dalat.app)` },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return rules;

    const text = await res.text();
    let relevantSection = false;

    for (const line of text.split('\n')) {
      const trimmed = line.trim().toLowerCase();

      if (trimmed.startsWith('user-agent:')) {
        const agent = trimmed.slice('user-agent:'.length).trim();
        relevantSection = agent === '*' || agent.toLowerCase().includes('dalatapp');
      } else if (relevantSection && trimmed.startsWith('disallow:')) {
        const path = trimmed.slice('disallow:'.length).trim();
        if (path) rules.disallow.push(path);
      } else if (relevantSection && trimmed.startsWith('allow:')) {
        const path = trimmed.slice('allow:'.length).trim();
        if (path) rules.allow.push(path);
      }
    }
  } catch {
    // Failed to fetch robots.txt — allow by default (conservative)
  }

  return rules;
}

/**
 * Checks if a URL is allowed by the target site's robots.txt.
 * Returns true if allowed, false if disallowed.
 */
export async function isAllowedByRobots(url: string): Promise<boolean> {
  const domain = getDomain(url);
  const cached = robotsCache[domain];

  let rules: RobotsRules;
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    rules = cached;
  } else {
    rules = await fetchRobotsTxt(domain);
    robotsCache[domain] = rules;
  }

  const path = new URL(url).pathname;

  // Check allow rules first (more specific wins)
  for (const allowed of rules.allow) {
    if (path.startsWith(allowed)) return true;
  }

  // Check disallow rules
  for (const disallowed of rules.disallow) {
    if (path.startsWith(disallowed)) return false;
  }

  // Not mentioned = allowed
  return true;
}
