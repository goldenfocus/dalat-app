import { Sun, Cloud, Thermometer, Umbrella, Calendar } from "lucide-react";
import { MarkdownRenderer } from "@/components/blog/markdown-renderer";

interface MonthlyTemplateProps {
  storyContent: string;
  month?: string;
  faqData?: Array<{ question: string; answer: string }>;
}

const DALAT_WEATHER: Record<string, { temp: string; rain: string; desc: string; icon: "sun" | "cloud" | "rain" }> = {
  january:   { temp: "14-24°C", rain: "Low",    desc: "Cool and dry — perfect hiking weather", icon: "sun" },
  february:  { temp: "15-25°C", rain: "Low",    desc: "Dry season continues, flower season begins", icon: "sun" },
  march:     { temp: "16-26°C", rain: "Low",    desc: "Warming up, wildflowers blooming", icon: "sun" },
  april:     { temp: "17-27°C", rain: "Medium", desc: "Start of rainy season, afternoon showers", icon: "cloud" },
  may:       { temp: "17-26°C", rain: "High",   desc: "Rain picks up, lush green landscapes", icon: "rain" },
  june:      { temp: "17-25°C", rain: "High",   desc: "Peak rain season, misty mornings", icon: "rain" },
  july:      { temp: "17-25°C", rain: "High",   desc: "Rainy but atmospheric — great cafe weather", icon: "rain" },
  august:    { temp: "17-25°C", rain: "High",   desc: "Wettest month, stunning cloud formations", icon: "rain" },
  september: { temp: "17-25°C", rain: "High",   desc: "Rain tapering off toward month end", icon: "rain" },
  october:   { temp: "16-25°C", rain: "Medium", desc: "Transition month, fewer crowds", icon: "cloud" },
  november:  { temp: "15-24°C", rain: "Low",    desc: "Cool season starts, clear skies return", icon: "sun" },
  december:  { temp: "13-23°C", rain: "Low",    desc: "Coolest month — cozy cafe season, holiday vibes", icon: "sun" },
};

const WeatherIcon = ({ type }: { type: "sun" | "cloud" | "rain" }) => {
  switch (type) {
    case "sun": return <Sun className="w-5 h-5 text-amber-500" />;
    case "cloud": return <Cloud className="w-5 h-5 text-slate-400" />;
    case "rain": return <Umbrella className="w-5 h-5 text-blue-400" />;
  }
};

export function MonthlyTemplate({
  storyContent,
  month,
  faqData,
}: MonthlyTemplateProps) {
  const monthKey = month?.toLowerCase();
  const weather = monthKey ? DALAT_WEATHER[monthKey] : null;

  return (
    <div>
      {/* Weather card */}
      {weather && (
        <div className="mb-8 p-5 rounded-xl border bg-gradient-to-br from-card to-muted/30">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              {month} Weather in Da Lat
            </span>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="flex items-center gap-2">
              <Thermometer className="w-5 h-5 text-red-400" />
              <div>
                <div className="text-lg font-semibold">{weather.temp}</div>
                <div className="text-xs text-muted-foreground">Temperature</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <WeatherIcon type={weather.icon} />
              <div>
                <div className="text-lg font-semibold">{weather.rain}</div>
                <div className="text-xs text-muted-foreground">Rainfall</div>
              </div>
            </div>
            <div className="col-span-3 sm:col-span-1">
              <p className="text-sm text-muted-foreground italic">{weather.desc}</p>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="prose prose-lg dark:prose-invert max-w-none mb-8">
        <MarkdownRenderer content={storyContent} />
      </div>

      {/* FAQ */}
      {faqData && faqData.length > 0 && (
        <section className="mt-10 mb-8">
          <h2 className="text-2xl font-bold mb-4">
            FAQ: Visiting Da Lat in {month}
          </h2>
          <div className="space-y-3">
            {faqData.map((faq, i) => (
              <details key={i} className="group border rounded-lg bg-card">
                <summary className="flex items-center justify-between cursor-pointer p-4 font-medium">
                  {faq.question}
                </summary>
                <div className="px-4 pb-4 text-muted-foreground">
                  {faq.answer}
                </div>
              </details>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
