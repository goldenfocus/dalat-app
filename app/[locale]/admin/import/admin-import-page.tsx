"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2,
  CheckCircle,
  AlertCircle,
  Download,
  Search,
  Calendar,
  MapPin,
  Clock,
  Play,
  RefreshCw,
  ExternalLink,
  Lightbulb,
  Zap,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Copy,
  Facebook,
  Globe,
} from "lucide-react";

interface ImportResult {
  success: boolean;
  message: string;
  eventSlug?: string;
}

interface BulkResult {
  url: string;
  success: boolean;
  message: string;
  eventSlug?: string;
}

interface ImportedEvent {
  id: string;
  slug: string;
  title: string;
  starts_at: string;
  source_platform: string;
  created_at: string;
  external_chat_url: string;
}

interface DiscoveredVenue {
  name: string;
  facebookUrl?: string;
  website?: string;
  address?: string;
}

interface ScheduleStatus {
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
  venueCount: number;
}

// Collapsible help section component
function HelpSection({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="rounded-lg border border-dashed border-blue-300 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full p-3 text-left"
      >
        <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
          <HelpCircle className="w-4 h-4" />
          <span className="text-sm font-medium">{title}</span>
        </div>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-blue-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-blue-500" />
        )}
      </button>
      {isOpen && (
        <div className="px-3 pb-3 text-sm text-blue-800 dark:text-blue-300">
          {children}
        </div>
      )}
    </div>
  );
}

// Tip component
function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
      <Lightbulb className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
      <p className="text-sm text-amber-800 dark:text-amber-300">{children}</p>
    </div>
  );
}

export function AdminImportPage() {
  // Single URL import
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  // Bulk import
  const [bulkUrls, setBulkUrls] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResults, setBulkResults] = useState<BulkResult[]>([]);

  // Import history
  const [history, setHistory] = useState<ImportedEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // Venue discovery
  const [discovering, setDiscovering] = useState(false);
  const [discoveredVenues, setDiscoveredVenues] = useState<DiscoveredVenue[]>(
    []
  );
  const [searchQuery, setSearchQuery] = useState("Đà Lạt Vietnam");

  // Schedule status
  const [schedule, setSchedule] = useState<ScheduleStatus | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);

  // Load import history on mount
  useEffect(() => {
    loadHistory();
    loadScheduleStatus();
  }, []);

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const response = await fetch("/api/import/history");
      if (response.ok) {
        const data = await response.json();
        setHistory(data.events || []);
      }
    } catch {
      console.error("Failed to load history");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function loadScheduleStatus() {
    try {
      const response = await fetch("/api/import/schedule");
      if (response.ok) {
        const data = await response.json();
        setSchedule(data);
      }
    } catch {
      console.error("Failed to load schedule");
    }
  }

  async function handleSingleImport() {
    if (!url.trim()) return;

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/import/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = await response.json();

      if (response.ok) {
        setResult({
          success: true,
          message: `Imported: ${data.title}`,
          eventSlug: data.slug,
        });
        setUrl("");
        loadHistory();
      } else {
        setResult({
          success: false,
          message: data.error || "Import failed",
        });
      }
    } catch {
      setResult({ success: false, message: "Network error" });
    } finally {
      setLoading(false);
    }
  }

  async function handleBulkImport() {
    const urls = bulkUrls
      .split("\n")
      .map((u) => u.trim())
      .filter((u) => u.length > 0);

    if (urls.length === 0) return;

    setBulkLoading(true);
    setBulkResults([]);

    const results: BulkResult[] = [];

    for (const importUrl of urls) {
      try {
        const response = await fetch("/api/import/url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: importUrl }),
        });

        const data = await response.json();

        results.push({
          url: importUrl,
          success: response.ok,
          message: response.ok ? data.title : data.error,
          eventSlug: data.slug,
        });
      } catch {
        results.push({
          url: importUrl,
          success: false,
          message: "Network error",
        });
      }

      setBulkResults([...results]);
    }

    setBulkLoading(false);
    setBulkUrls("");
    loadHistory();
  }

  async function handleDiscoverVenues() {
    setDiscovering(true);
    setDiscoveredVenues([]);

    try {
      const response = await fetch("/api/import/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery }),
      });

      if (response.ok) {
        const data = await response.json();
        setDiscoveredVenues(data.venues || []);
      }
    } catch {
      console.error("Discovery failed");
    } finally {
      setDiscovering(false);
    }
  }

  async function handleToggleSchedule() {
    setScheduleLoading(true);
    try {
      const response = await fetch("/api/import/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !schedule?.enabled }),
      });

      if (response.ok) {
        await loadScheduleStatus();
      }
    } catch {
      console.error("Failed to toggle schedule");
    } finally {
      setScheduleLoading(false);
    }
  }

  async function handleRunNow() {
    setScheduleLoading(true);
    try {
      const response = await fetch("/api/import/schedule/run", {
        method: "POST",
      });

      if (response.ok) {
        await loadScheduleStatus();
      }
    } catch {
      console.error("Failed to trigger run");
    } finally {
      setScheduleLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header with quick start guide */}
      <div className="space-y-4">
        <div>
          <h1 className="text-3xl font-bold">Event Import</h1>
          <p className="mt-2 text-muted-foreground">
            Import events from Facebook, Eventbrite, and more — automatically or
            manually
          </p>
        </div>

        {/* Quick Start Guide */}
        <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Zap className="w-5 h-5 text-primary" />
              Quick Start Guide
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-3 gap-4 text-sm">
              <div className="flex gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/20 text-primary font-bold shrink-0">
                  1
                </div>
                <div>
                  <p className="font-medium">Find an event</p>
                  <p className="text-muted-foreground">
                    Copy the URL from Facebook or Eventbrite
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/20 text-primary font-bold shrink-0">
                  2
                </div>
                <div>
                  <p className="font-medium">Paste & Import</p>
                  <p className="text-muted-foreground">
                    Paste the URL below and click Import
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/20 text-primary font-bold shrink-0">
                  3
                </div>
                <div>
                  <p className="font-medium">Done!</p>
                  <p className="text-muted-foreground">
                    Event is live with all details imported
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="import" className="space-y-6">
        <TabsList className="grid grid-cols-4 w-full max-w-xl">
          <TabsTrigger value="import" className="gap-1.5">
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Import</span>
          </TabsTrigger>
          <TabsTrigger value="discover" className="gap-1.5">
            <Search className="w-4 h-4" />
            <span className="hidden sm:inline">Discover</span>
          </TabsTrigger>
          <TabsTrigger value="schedule" className="gap-1.5">
            <Calendar className="w-4 h-4" />
            <span className="hidden sm:inline">Auto</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <Clock className="w-4 h-4" />
            <span className="hidden sm:inline">History</span>
            {history.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs bg-primary/20 rounded-full">
                {history.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ==================== IMPORT TAB ==================== */}
        <TabsContent value="import" className="space-y-6">
          {/* Single URL Import */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="w-5 h-5" />
                Quick Import
              </CardTitle>
              <CardDescription>
                Paste a single event URL to import it instantly
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="https://facebook.com/events/123456789..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSingleImport()}
                  className="flex-1 font-mono text-sm"
                />
                <Button
                  onClick={handleSingleImport}
                  disabled={loading || !url.trim()}
                  className="min-w-[100px]"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Import"
                  )}
                </Button>
              </div>

              {result && (
                <div
                  className={`flex items-center gap-2 p-3 rounded-lg ${
                    result.success
                      ? "bg-green-500/10 text-green-600 dark:text-green-400"
                      : "bg-red-500/10 text-red-600 dark:text-red-400"
                  }`}
                >
                  {result.success ? (
                    <CheckCircle className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                  <span className="flex-1">{result.message}</span>
                  {result.eventSlug && (
                    <a
                      href={`/events/${result.eventSlug}`}
                      className="underline font-medium"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View Event
                    </a>
                  )}
                </div>
              )}

              {/* Supported URLs */}
              <div className="grid sm:grid-cols-3 gap-3 pt-2">
                <div className="flex items-center gap-2 p-2 rounded-lg border">
                  <Facebook className="w-4 h-4 text-blue-600" />
                  <div className="text-xs">
                    <p className="font-medium">Facebook Events</p>
                    <p className="text-muted-foreground">
                      facebook.com/events/...
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-lg border">
                  <Globe className="w-4 h-4 text-orange-600" />
                  <div className="text-xs">
                    <p className="font-medium">Eventbrite</p>
                    <p className="text-muted-foreground">eventbrite.com/e/...</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-lg border">
                  <Globe className="w-4 h-4 text-purple-600" />
                  <div className="text-xs">
                    <p className="font-medium">Lu.ma</p>
                    <p className="text-muted-foreground">lu.ma/...</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Bulk Import */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Copy className="w-5 h-5" />
                Bulk Import
              </CardTitle>
              <CardDescription>
                Import multiple events at once — paste one URL per line
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder={`Paste multiple URLs here, one per line:

https://facebook.com/events/123456789
https://facebook.com/events/987654321
https://eventbrite.com/e/some-event-tickets-123`}
                value={bulkUrls}
                onChange={(e) => setBulkUrls(e.target.value)}
                rows={6}
                className="font-mono text-sm"
              />

              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {bulkUrls.split("\n").filter((u) => u.trim()).length} URLs
                  ready to import
                </p>
                <Button
                  onClick={handleBulkImport}
                  disabled={bulkLoading || !bulkUrls.trim()}
                >
                  {bulkLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Importing...
                    </>
                  ) : (
                    "Import All"
                  )}
                </Button>
              </div>

              {bulkResults.length > 0 && (
                <div className="space-y-2 border-t pt-4">
                  <p className="text-sm font-medium">Results:</p>
                  {bulkResults.map((r, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-2 p-2 rounded text-sm ${
                        r.success
                          ? "bg-green-500/10 text-green-600"
                          : "bg-red-500/10 text-red-600"
                      }`}
                    >
                      {r.success ? (
                        <CheckCircle className="w-3 h-3 shrink-0" />
                      ) : (
                        <AlertCircle className="w-3 h-3 shrink-0" />
                      )}
                      <span className="truncate flex-1">{r.message}</span>
                      {r.eventSlug && (
                        <a
                          href={`/events/${r.eventSlug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <HelpSection title="How to find event URLs">
                <ol className="list-decimal list-inside space-y-2 mt-2">
                  <li>
                    Go to the event page on Facebook, Eventbrite, or Lu.ma
                  </li>
                  <li>Copy the full URL from your browser&apos;s address bar</li>
                  <li>Paste it here — the system extracts all event details</li>
                </ol>
                <p className="mt-3 text-xs opacity-75">
                  The importer fetches: title, description, date/time, location,
                  cover image, and organizer info.
                </p>
              </HelpSection>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== DISCOVER TAB ==================== */}
        <TabsContent value="discover" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="w-5 h-5" />
                Discover Venues
              </CardTitle>
              <CardDescription>
                Search Google Maps to find bars, cafes, and venues that might
                host events
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="e.g., Đà Lạt Vietnam, Ho Chi Minh City..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1"
                />
                <Button onClick={handleDiscoverVenues} disabled={discovering}>
                  {discovering ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Search className="w-4 h-4 mr-2" />
                      Search
                    </>
                  )}
                </Button>
              </div>

              <Tip>
                This searches for bars, cafes, music venues, and event spaces.
                Found a venue with events? Go to their Facebook page and import
                individual event URLs.
              </Tip>

              {discoveredVenues.length > 0 && (
                <div className="space-y-3 border-t pt-4">
                  <p className="text-sm font-medium">
                    Found {discoveredVenues.length} venues:
                  </p>
                  <div className="grid gap-2 max-h-96 overflow-y-auto">
                    {discoveredVenues.map((venue, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{venue.name}</p>
                          {venue.address && (
                            <p className="text-sm text-muted-foreground flex items-center gap-1 truncate">
                              <MapPin className="w-3 h-3 shrink-0" />
                              {venue.address}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2 shrink-0 ml-2">
                          {venue.facebookUrl && (
                            <a
                              href={venue.facebookUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs px-2 py-1 bg-blue-500/10 text-blue-600 rounded hover:bg-blue-500/20 transition-colors"
                            >
                              Facebook
                            </a>
                          )}
                          {venue.website && !venue.website.includes("facebook") && (
                            <a
                              href={venue.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs px-2 py-1 bg-gray-500/10 text-gray-600 rounded hover:bg-gray-500/20 transition-colors"
                            >
                              Website
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!discovering && discoveredVenues.length === 0 && (
                <HelpSection title="How venue discovery works" defaultOpen>
                  <div className="space-y-3 mt-2">
                    <p>
                      This tool searches Google Maps via Apify to find potential
                      event venues in a location.
                    </p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Enter a location (city, neighborhood, etc.)</li>
                      <li>Click Search to find venues</li>
                      <li>Click on venue links to check if they have events</li>
                      <li>
                        Copy event URLs from their Facebook/website and import
                        them
                      </li>
                    </ol>
                    <p className="text-xs opacity-75">
                      Note: Uses Apify credits for each search.
                    </p>
                  </div>
                </HelpSection>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== AUTO-SCRAPING TAB ==================== */}
        <TabsContent value="schedule" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Automated Daily Scraping
              </CardTitle>
              <CardDescription>
                Set it and forget it — automatically import new events every day
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {schedule ? (
                <>
                  {/* Status cards */}
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div
                      className={`p-4 rounded-lg border-2 ${
                        schedule.enabled
                          ? "border-green-500/50 bg-green-50/50 dark:bg-green-950/20"
                          : "border-gray-300 dark:border-gray-700"
                      }`}
                    >
                      <p className="text-sm text-muted-foreground">Status</p>
                      <p
                        className={`text-xl font-bold ${
                          schedule.enabled
                            ? "text-green-600 dark:text-green-400"
                            : "text-gray-500"
                        }`}
                      >
                        {schedule.enabled ? "Active" : "Disabled"}
                      </p>
                      {schedule.enabled && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Runs daily at 6:00 AM UTC
                        </p>
                      )}
                    </div>

                    <div className="p-4 rounded-lg border">
                      <p className="text-sm text-muted-foreground">
                        Imported Events
                      </p>
                      <p className="text-xl font-bold">{schedule.venueCount}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Total events from external sources
                      </p>
                    </div>

                    {schedule.lastRun && (
                      <div className="p-4 rounded-lg border">
                        <p className="text-sm text-muted-foreground">
                          Last Run
                        </p>
                        <p className="font-medium flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(schedule.lastRun).toLocaleString()}
                        </p>
                      </div>
                    )}

                    {schedule.nextRun && schedule.enabled && (
                      <div className="p-4 rounded-lg border">
                        <p className="text-sm text-muted-foreground">
                          Next Run
                        </p>
                        <p className="font-medium flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(schedule.nextRun).toLocaleString()}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-3 pt-2">
                    <Button
                      variant={schedule.enabled ? "destructive" : "default"}
                      onClick={handleToggleSchedule}
                      disabled={scheduleLoading}
                      className="min-w-[180px]"
                    >
                      {scheduleLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : schedule.enabled ? (
                        "Disable Auto-Scraping"
                      ) : (
                        "Enable Auto-Scraping"
                      )}
                    </Button>

                    {schedule.enabled && (
                      <Button
                        variant="outline"
                        onClick={handleRunNow}
                        disabled={scheduleLoading}
                      >
                        {scheduleLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <Play className="w-4 h-4 mr-2" />
                            Run Now
                          </>
                        )}
                      </Button>
                    )}

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={loadScheduleStatus}
                      disabled={scheduleLoading}
                    >
                      <RefreshCw
                        className={`w-4 h-4 ${scheduleLoading ? "animate-spin" : ""}`}
                      />
                    </Button>
                  </div>
                </>
              ) : (
                <div className="text-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground mt-2">
                    Loading schedule status...
                  </p>
                </div>
              )}

              <HelpSection title="How auto-scraping works" defaultOpen>
                <div className="space-y-3 mt-2">
                  <p>
                    When enabled, the system automatically scrapes events from
                    tracked venues every day at 6 AM UTC.
                  </p>
                  <div className="space-y-2">
                    <p className="font-medium">What happens:</p>
                    <ol className="list-decimal list-inside space-y-1 text-sm">
                      <li>
                        Apify runs daily and scrapes configured Facebook pages
                      </li>
                      <li>New events are sent to our webhook automatically</li>
                      <li>Events are created with all details (no duplicates)</li>
                      <li>You can see all imports in the History tab</li>
                    </ol>
                  </div>
                  <Tip>
                    Click &quot;Run Now&quot; to trigger an immediate scrape
                    instead of waiting for the scheduled time.
                  </Tip>
                </div>
              </HelpSection>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== HISTORY TAB ==================== */}
        <TabsContent value="history" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Import History
              </CardTitle>
              <CardDescription>
                All events imported from external platforms
              </CardDescription>
            </CardHeader>
            <CardContent>
              {historyLoading ? (
                <div className="text-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                </div>
              ) : history.length === 0 ? (
                <div className="text-center py-12 space-y-4">
                  <div className="w-16 h-16 mx-auto rounded-full bg-muted flex items-center justify-center">
                    <Download className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium">No imported events yet</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Import your first event from the Import tab
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      const tabTrigger = document.querySelector(
                        '[data-state="inactive"][value="import"]'
                      ) as HTMLButtonElement;
                      tabTrigger?.click();
                    }}
                  >
                    Go to Import
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {history.map((event) => (
                    <div
                      key={event.id}
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <a
                          href={`/events/${event.slug}`}
                          className="font-medium hover:underline truncate block"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {event.title}
                        </a>
                        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground mt-1">
                          <span
                            className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                              event.source_platform === "facebook"
                                ? "bg-blue-500/10 text-blue-600"
                                : event.source_platform === "eventbrite"
                                  ? "bg-orange-500/10 text-orange-600"
                                  : "bg-gray-500/10 text-gray-600"
                            }`}
                          >
                            {event.source_platform}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(event.starts_at).toLocaleDateString()}
                          </span>
                          <span className="text-xs">
                            Imported{" "}
                            {new Date(event.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      {event.external_chat_url && (
                        <a
                          href={event.external_chat_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground p-2 shrink-0"
                          title="View original"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
