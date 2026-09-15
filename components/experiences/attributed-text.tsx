import { Fragment } from "react";
import { Link } from "@/lib/i18n/routing";
import { attributionParts } from "@/lib/experiences/attribution";
export function AttributedText({
  text,
  username,
}: {
  text: string;
  username?: string | null;
}) {
  return (
    <>
      {attributionParts(text, username).map((part, i) =>
        part.linked ? (
          <Link
            key={i}
            className="underline underline-offset-2"
            href={`/${username}`}
          >
            {part.text}
          </Link>
        ) : (
          <Fragment key={i}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}
