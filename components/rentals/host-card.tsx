import { Card, CardContent } from "@/components/ui/card";
import { Link } from "@/lib/i18n/routing";
import {
  telHref,
  telegramHref,
  whatsappHref,
  zaloHref,
} from "@/lib/profile/contact-links";

export type RentalHostProfile = {
  username: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  zalo?: string | null;
  whatsapp?: string | null;
  telegram?: string | null;
  phone?: string | null;
};

type Labels = {
  listedBy: string;
  zalo: string;
  whatsapp: string;
  telegram: string;
  phone: string;
};

const linkClass =
  "inline-flex min-h-11 items-center justify-center rounded-lg border px-3 text-sm font-medium transition-colors hover:bg-muted";

export function RentalHostCard({
  host,
  labels,
}: {
  host: RentalHostProfile;
  labels: Labels;
}) {
  const name = host.display_name || host.username;
  const profileHref = host.username ? `/${host.username}` : null;
  const contacts = [
    { href: zaloHref(host.zalo), label: labels.zalo, external: true },
    {
      href: whatsappHref(host.whatsapp),
      label: labels.whatsapp,
      external: true,
    },
    {
      href: telegramHref(host.telegram),
      label: labels.telegram,
      external: true,
    },
    { href: telHref(host.phone), label: labels.phone, external: false },
  ].filter((item): item is { href: string; label: string; external: boolean } =>
    Boolean(item.href),
  );

  const identity = (
    <span className="flex items-center gap-3 min-w-0">
      {host.avatar_url ? (
        <img
          src={host.avatar_url}
          alt=""
          className="h-10 w-10 rounded-full object-cover"
        />
      ) : (
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-sm font-semibold text-primary">
          {(name || "?").charAt(0).toUpperCase()}
        </span>
      )}
      <span className="min-w-0">
        <span className="block font-medium leading-tight">{name}</span>
        {host.bio ? (
          <span className="mt-1 block text-sm text-muted-foreground break-words">
            {host.bio}
          </span>
        ) : null}
      </span>
    </span>
  );

  return (
    <Card data-rental-host-card="">
      <CardContent className="space-y-3 p-4">
        <p className="text-sm text-muted-foreground">{labels.listedBy}</p>
        {profileHref ? (
          <Link
            href={profileHref}
            className="block rounded-lg p-2 -m-2 transition-colors hover:bg-muted"
          >
            {identity}
          </Link>
        ) : (
          <div>{identity}</div>
        )}
        {contacts.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {contacts.map((item) =>
              item.external ? (
                <a
                  key={item.label}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkClass}
                >
                  {item.label}
                </a>
              ) : (
                <a key={item.label} href={item.href} className={linkClass}>
                  {item.label}
                </a>
              ),
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
