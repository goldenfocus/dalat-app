/** Only surface attendee tools after someone has confirmed that they are going. */
export function eventParticipationVisibility({
  isLoggedIn, isPast, rsvpStatus, canManageEvent,
}: {
  isLoggedIn: boolean;
  isPast: boolean;
  rsvpStatus?: string | null;
  canManageEvent: boolean;
}) {
  const isAttending = isLoggedIn && rsvpStatus === 'going';
  return {
    arrival: !isPast && isLoggedIn && (isAttending || canManageEvent),
    preorder: !isPast && isAttending,
  };
}
