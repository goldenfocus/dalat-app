import { Link } from "@/lib/i18n/routing";
import {
  topicHref,
  experienceTopics,
  observationParts,
} from "@/lib/experiences/topics";
import { AttributedText } from "./attributed-text";
export function TopicLinks({
  tags,
  observations = [],
}: {
  tags: string[];
  observations?: { value: string; source_type: string }[];
}) {
  const values = experienceTopics(tags, observations);
  if (!values.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {values.map((value) => (
        <Link
          key={value}
          href={topicHref(value)}
          className="rounded-full border px-3 py-2 text-sm hover:bg-muted"
        >
          #{value}
        </Link>
      ))}
    </div>
  );
}
export function ObservationText({
  value,
  source,
  tags,
  username,
}: {
  value: string;
  source: string;
  tags: string[];
  username?: string | null;
}) {
  return (
    <>
      {observationParts(value, tags, source).map((part, i) =>
        part.topic ? (
          <Link
            key={i}
            href={topicHref(part.topic)}
            className="underline underline-offset-4 decoration-primary/50 hover:decoration-primary"
          >
            {part.text}
          </Link>
        ) : (
          <AttributedText key={i} text={part.text} username={username} />
        ),
      )}
    </>
  );
}
