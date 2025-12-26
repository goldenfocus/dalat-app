import { Novu } from '@novu/node';
import { createHmac } from 'crypto';
import type { Locale } from '@/lib/types';

// Lazy-initialized Novu client to avoid failing at module load time
// when only generateSubscriberHash is needed
let novuClient: Novu | null = null;

function getNovu(): Novu {
  if (!novuClient) {
    if (!process.env.NOVU_SECRET_KEY) {
      throw new Error('NOVU_SECRET_KEY environment variable is required');
    }
    novuClient = new Novu(process.env.NOVU_SECRET_KEY);
  }
  return novuClient;
}

// Generate HMAC hash for secure subscriber authentication
export function generateSubscriberHash(subscriberId: string): string {
  return createHmac('sha256', process.env.NOVU_SECRET_KEY!)
    .update(subscriberId)
    .digest('hex');
}

const translations = {
  rsvpConfirmation: {
    en: (title: string) => `✅ You're going to "${title}"!`,
    fr: (title: string) => `✅ Vous participez à "${title}" !`,
    vi: (title: string) => `✅ Bạn sẽ tham gia "${title}"!`,
  },
  rsvpConfirmationBody: {
    en: (desc: string | null) => desc ? `Remember: ${desc}` : 'See you there!',
    fr: (desc: string | null) => desc ? `À retenir : ${desc}` : 'À bientôt !',
    vi: (desc: string | null) => desc ? `Lưu ý: ${desc}` : 'Hẹn gặp bạn!',
  },
  confirmAttendance24h: {
    en: (title: string, time: string) => `📅 "${title}" is tomorrow at ${time}. Are you still coming?`,
    fr: (title: string, time: string) => `📅 "${title}" demain à ${time}. Vous venez toujours ?`,
    vi: (title: string, time: string) => `📅 "${title}" vào ngày mai lúc ${time}. Bạn vẫn đến chứ?`,
  },
  finalReminder2h: {
    en: (title: string, location: string) => `🚀 "${title}" starts in 2 hours at ${location}!`,
    fr: (title: string, location: string) => `🚀 "${title}" commence dans 2h à ${location} !`,
    vi: (title: string, location: string) => `🚀 "${title}" bắt đầu trong 2 giờ tại ${location}!`,
  },
  waitlistPromotion: {
    en: (title: string) => `🎉 You got a spot for "${title}"! See you there.`,
    fr: (title: string) => `🎉 Vous avez une place pour "${title}" ! À bientôt.`,
    vi: (title: string) => `🎉 Bạn đã có chỗ cho "${title}"! Hẹn gặp bạn.`,
  },
  eventReminder: {
    en: (title: string, time: string) => `⏰ "${title}" is tomorrow at ${time}. Don't forget!`,
    fr: (title: string, time: string) => `⏰ "${title}" demain à ${time}. N'oubliez pas !`,
    vi: (title: string, time: string) => `⏰ "${title}" vào ngày mai lúc ${time}. Đừng quên!`,
  },
  confirmAttendance: {
    en: (title: string) => `👋 "${title}" is tomorrow. Still coming?`,
    fr: (title: string) => `👋 "${title}" est demain. Vous venez ?`,
    vi: (title: string) => `👋 "${title}" vào ngày mai. Bạn vẫn đến chứ?`,
  },
  waitlistPosition: {
    en: (title: string, pos: number) => `📈 You're now #${pos} on the waitlist for "${title}".`,
    fr: (title: string, pos: number) => `📈 Vous êtes #${pos} sur la liste d'attente pour "${title}".`,
    vi: (title: string, pos: number) => `📈 Bạn đang ở vị trí #${pos} trong danh sách chờ cho "${title}".`,
  },
  newRsvp: {
    en: (title: string, name: string) => `🙋 ${name} is going to "${title}"`,
    fr: (title: string, name: string) => `🙋 ${name} participe à "${title}"`,
    vi: (title: string, name: string) => `🙋 ${name} sẽ tham gia "${title}"`,
  },
  buttons: {
    viewEvent: { en: 'View Event', fr: 'Voir', vi: 'Xem sự kiện' },
    yes: { en: 'Yes, coming', fr: 'Oui', vi: 'Có, tôi đến' },
    no: { en: "Can't make it", fr: 'Non', vi: 'Không thể đến' },
    getDirections: { en: 'Get Directions', fr: 'Itinéraire', vi: 'Chỉ đường' },
  },
};

export async function notifyRsvpConfirmation(
  subscriberId: string,
  locale: Locale,
  eventTitle: string,
  eventSlug: string,
  eventDescription: string | null
) {
  const eventUrl = `${process.env.NEXT_PUBLIC_APP_URL}/events/${eventSlug}`;

  await getNovu().trigger('rsvp-confirmation', {
    to: { subscriberId },
    payload: {
      subject: translations.rsvpConfirmation[locale](eventTitle),
      body: translations.rsvpConfirmationBody[locale](eventDescription),
      primaryActionLabel: translations.buttons.viewEvent[locale],
      primaryActionUrl: eventUrl,
    },
  });
}

export async function notifyConfirmAttendance24h(
  subscriberId: string,
  locale: Locale,
  eventTitle: string,
  eventTime: string,
  eventSlug: string
) {
  const baseUrl = `${process.env.NEXT_PUBLIC_APP_URL}/events/${eventSlug}`;

  await getNovu().trigger('confirm-attendance-24h', {
    to: { subscriberId },
    payload: {
      subject: translations.confirmAttendance24h[locale](eventTitle, eventTime),
      primaryActionLabel: translations.buttons.yes[locale],
      primaryActionUrl: `${baseUrl}?confirm=yes`,
      secondaryActionLabel: translations.buttons.no[locale],
      secondaryActionUrl: `${baseUrl}?confirm=no`,
    },
  });
}

export async function notifyFinalReminder2h(
  subscriberId: string,
  locale: Locale,
  eventTitle: string,
  locationName: string,
  googleMapsUrl: string | null,
  eventSlug: string
) {
  const eventUrl = `${process.env.NEXT_PUBLIC_APP_URL}/events/${eventSlug}`;

  await getNovu().trigger('final-reminder-2h', {
    to: { subscriberId },
    payload: {
      subject: translations.finalReminder2h[locale](eventTitle, locationName),
      primaryActionLabel: googleMapsUrl
        ? translations.buttons.getDirections[locale]
        : translations.buttons.viewEvent[locale],
      primaryActionUrl: googleMapsUrl || eventUrl,
    },
  });
}

export async function notifyWaitlistPromotion(
  subscriberId: string,
  locale: Locale,
  eventTitle: string,
  eventSlug: string
) {
  const eventUrl = `${process.env.NEXT_PUBLIC_APP_URL}/events/${eventSlug}`;

  await getNovu().trigger('waitlist-promotion', {
    to: { subscriberId },
    payload: {
      message: translations.waitlistPromotion[locale](eventTitle),
      buttonText: translations.buttons.viewEvent[locale],
      eventUrl,
    },
  });
}

export async function notifyEventReminder(
  subscriberId: string,
  locale: Locale,
  eventTitle: string,
  eventTime: string,
  eventSlug: string
) {
  const eventUrl = `${process.env.NEXT_PUBLIC_APP_URL}/events/${eventSlug}`;

  await getNovu().trigger('event-reminder', {
    to: { subscriberId },
    payload: {
      message: translations.eventReminder[locale](eventTitle, eventTime),
      buttonText: translations.buttons.viewEvent[locale],
      eventUrl,
    },
  });
}

export async function notifyConfirmAttendance(
  subscriberId: string,
  locale: Locale,
  eventTitle: string,
  eventSlug: string
) {
  const baseUrl = `${process.env.NEXT_PUBLIC_APP_URL}/events/${eventSlug}`;

  await getNovu().trigger('confirm-attendance', {
    to: { subscriberId },
    payload: {
      message: translations.confirmAttendance[locale](eventTitle),
      yesButtonText: translations.buttons.yes[locale],
      noButtonText: translations.buttons.no[locale],
      confirmUrl: `${baseUrl}?confirm=yes`,
      cancelUrl: `${baseUrl}?confirm=no`,
    },
  });
}

export async function notifyWaitlistPositionUpdate(
  subscriberId: string,
  locale: Locale,
  eventTitle: string,
  position: number,
  eventSlug: string
) {
  const eventUrl = `${process.env.NEXT_PUBLIC_APP_URL}/events/${eventSlug}`;

  await getNovu().trigger('waitlist-position-update', {
    to: { subscriberId },
    payload: {
      message: translations.waitlistPosition[locale](eventTitle, position),
      buttonText: translations.buttons.viewEvent[locale],
      eventUrl,
    },
  });
}

export async function notifyOrganizerNewRsvp(
  subscriberId: string,
  locale: Locale,
  eventTitle: string,
  attendeeName: string,
  eventSlug: string
) {
  const eventUrl = `${process.env.NEXT_PUBLIC_APP_URL}/events/${eventSlug}`;

  await getNovu().trigger('new-rsvp-organizer', {
    to: { subscriberId },
    payload: {
      message: translations.newRsvp[locale](eventTitle, attendeeName),
      buttonText: translations.buttons.viewEvent[locale],
      eventUrl,
    },
  });
}

export async function createOrUpdateSubscriber(
  subscriberId: string,
  email?: string,
  firstName?: string,
  locale?: Locale
) {
  await getNovu().subscribers.identify(subscriberId, {
    email,
    firstName,
    locale,
  });
}
