import { Novu } from '@novu/node';
import { createHmac } from 'crypto';
import type { Locale } from '@/lib/types';
import { sendPushToUser } from '@/lib/web-push';

// Notification translations currently support 3 locales
// Other locales fall back to English
type NotificationLocale = 'en' | 'fr' | 'vi';
const NOTIFICATION_LOCALES: NotificationLocale[] = ['en', 'fr', 'vi'];

function getNotificationLocale(locale: Locale): NotificationLocale {
  return NOTIFICATION_LOCALES.includes(locale as NotificationLocale)
    ? (locale as NotificationLocale)
    : 'en';
}

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
    changePlans: { en: 'Change plans', fr: 'Modifier', vi: 'Thay đổi' },
    shareFeedback: { en: 'Share feedback', fr: 'Donner mon avis', vi: 'Chia sẻ nhận xét' },
  },
  feedbackRequest: {
    en: (title: string) => `How was "${title}"?`,
    fr: (title: string) => `Comment était "${title}" ?`,
    vi: (title: string) => `"${title}" thế nào?`,
  },
  feedbackRequestBody: {
    en: 'Tap to share your experience with the organizer',
    fr: 'Appuyez pour partager votre avis',
    vi: 'Nhấn để chia sẻ trải nghiệm của bạn',
  },
  email: {
    clickToConfirm: { en: 'Click below to confirm:', fr: 'Cliquez ci-dessous pour confirmer :', vi: 'Nhấn bên dưới để xác nhận:' },
    seeYouThere: { en: 'See you there!', fr: 'À bientôt !', vi: 'Hẹn gặp bạn!' },
  },
};

export async function notifyRsvpConfirmation(
  subscriberId: string,
  locale: Locale,
  eventTitle: string,
  eventSlug: string,
  eventDescription: string | null
) {
  const notifLocale = getNotificationLocale(locale);
  const eventUrl = `${process.env.NEXT_PUBLIC_APP_URL}/events/${eventSlug}`;

  // Send both Novu inbox and web push in parallel
  await Promise.all([
    getNovu().trigger('rsvp', {
      to: { subscriberId },
      payload: {
        subject: translations.rsvpConfirmation[notifLocale](eventTitle),
        body: translations.rsvpConfirmationBody[notifLocale](eventDescription),
        primaryActionLabel: translations.buttons.viewEvent[notifLocale],
        primaryActionUrl: eventUrl,
      },
    }),
    sendPushToUser(subscriberId, {
      title: translations.rsvpConfirmation[notifLocale](eventTitle),
      body: translations.rsvpConfirmationBody[notifLocale](eventDescription),
      url: eventUrl,
      tag: `rsvp-${eventSlug}`,
    }),
  ]);
}

export async function notifyConfirmAttendance24h(
  subscriberId: string,
  locale: Locale,
  eventTitle: string,
  eventTime: string,
  eventSlug: string
) {
  const notifLocale = getNotificationLocale(locale);
  const baseUrl = `${process.env.NEXT_PUBLIC_APP_URL}/events/${eventSlug}`;

  await Promise.all([
    getNovu().trigger('24h-re-confirmation', {
      to: { subscriberId },
      payload: {
        subject: translations.confirmAttendance24h[notifLocale](eventTitle, eventTime),
        primaryActionLabel: translations.buttons.yes[notifLocale],
        primaryActionUrl: `${baseUrl}?confirm=yes`,
        secondaryActionLabel: translations.buttons.changePlans[notifLocale],
        secondaryActionUrl: `${baseUrl}?cancel=true`,
        emailPrompt: translations.email.clickToConfirm[notifLocale],
      },
    }),
    sendPushToUser(subscriberId, {
      title: translations.confirmAttendance24h[notifLocale](eventTitle, eventTime),
      body: translations.email.clickToConfirm[notifLocale],
      url: `${baseUrl}?confirm=yes`,
      tag: `24h-${eventSlug}`,
      requireInteraction: true,
    }),
  ]);
}

export async function notifyFinalReminder2h(
  subscriberId: string,
  locale: Locale,
  eventTitle: string,
  locationName: string,
  googleMapsUrl: string | null,
  eventSlug: string
) {
  const notifLocale = getNotificationLocale(locale);
  const eventUrl = `${process.env.NEXT_PUBLIC_APP_URL}/events/${eventSlug}`;

  await Promise.all([
    getNovu().trigger('2h-reminder', {
      to: { subscriberId },
      payload: {
        subject: translations.finalReminder2h[notifLocale](eventTitle, locationName),
        primaryActionLabel: googleMapsUrl
          ? translations.buttons.getDirections[notifLocale]
          : translations.buttons.viewEvent[notifLocale],
        primaryActionUrl: googleMapsUrl || eventUrl,
        secondaryActionLabel: translations.buttons.changePlans[notifLocale],
        secondaryActionUrl: eventUrl,
        emailBody: translations.email.seeYouThere[notifLocale],
      },
    }),
    sendPushToUser(subscriberId, {
      title: translations.finalReminder2h[notifLocale](eventTitle, locationName),
      body: translations.email.seeYouThere[notifLocale],
      url: googleMapsUrl || eventUrl,
      tag: `2h-${eventSlug}`,
      requireInteraction: true,
    }),
  ]);
}

export async function notifyWaitlistPromotion(
  subscriberId: string,
  locale: Locale,
  eventTitle: string,
  eventSlug: string
) {
  const notifLocale = getNotificationLocale(locale);
  const eventUrl = `${process.env.NEXT_PUBLIC_APP_URL}/events/${eventSlug}`;

  await Promise.all([
    getNovu().trigger('waitlist-promotion', {
      to: { subscriberId },
      payload: {
        message: translations.waitlistPromotion[notifLocale](eventTitle),
        buttonText: translations.buttons.viewEvent[notifLocale],
        eventUrl,
      },
    }),
    sendPushToUser(subscriberId, {
      title: translations.waitlistPromotion[notifLocale](eventTitle),
      body: translations.buttons.viewEvent[notifLocale],
      url: eventUrl,
      tag: `waitlist-${eventSlug}`,
      requireInteraction: true,
    }),
  ]);
}

export async function notifyEventReminder(
  subscriberId: string,
  locale: Locale,
  eventTitle: string,
  eventTime: string,
  eventSlug: string
) {
  const notifLocale = getNotificationLocale(locale);
  const eventUrl = `${process.env.NEXT_PUBLIC_APP_URL}/events/${eventSlug}`;

  await Promise.all([
    getNovu().trigger('event-reminder', {
      to: { subscriberId },
      payload: {
        message: translations.eventReminder[notifLocale](eventTitle, eventTime),
        buttonText: translations.buttons.viewEvent[notifLocale],
        eventUrl,
      },
    }),
    sendPushToUser(subscriberId, {
      title: translations.eventReminder[notifLocale](eventTitle, eventTime),
      body: translations.buttons.viewEvent[notifLocale],
      url: eventUrl,
      tag: `reminder-${eventSlug}`,
    }),
  ]);
}

export async function notifyConfirmAttendance(
  subscriberId: string,
  locale: Locale,
  eventTitle: string,
  eventSlug: string
) {
  const notifLocale = getNotificationLocale(locale);
  const baseUrl = `${process.env.NEXT_PUBLIC_APP_URL}/events/${eventSlug}`;

  await Promise.all([
    getNovu().trigger('confirm-attendance', {
      to: { subscriberId },
      payload: {
        message: translations.confirmAttendance[notifLocale](eventTitle),
        yesButtonText: translations.buttons.yes[notifLocale],
        noButtonText: translations.buttons.no[notifLocale],
        confirmUrl: `${baseUrl}?confirm=yes`,
        cancelUrl: `${baseUrl}?confirm=no`,
      },
    }),
    sendPushToUser(subscriberId, {
      title: translations.confirmAttendance[notifLocale](eventTitle),
      body: translations.buttons.yes[notifLocale],
      url: `${baseUrl}?confirm=yes`,
      tag: `confirm-${eventSlug}`,
      requireInteraction: true,
    }),
  ]);
}

export async function notifyWaitlistPositionUpdate(
  subscriberId: string,
  locale: Locale,
  eventTitle: string,
  position: number,
  eventSlug: string
) {
  const notifLocale = getNotificationLocale(locale);
  const eventUrl = `${process.env.NEXT_PUBLIC_APP_URL}/events/${eventSlug}`;

  await Promise.all([
    getNovu().trigger('waitlist-position-update', {
      to: { subscriberId },
      payload: {
        message: translations.waitlistPosition[notifLocale](eventTitle, position),
        buttonText: translations.buttons.viewEvent[notifLocale],
        eventUrl,
      },
    }),
    sendPushToUser(subscriberId, {
      title: translations.waitlistPosition[notifLocale](eventTitle, position),
      body: translations.buttons.viewEvent[notifLocale],
      url: eventUrl,
      tag: `waitlist-pos-${eventSlug}`,
    }),
  ]);
}

export async function notifyOrganizerNewRsvp(
  subscriberId: string,
  locale: Locale,
  eventTitle: string,
  attendeeName: string,
  eventSlug: string
) {
  const notifLocale = getNotificationLocale(locale);
  const eventUrl = `${process.env.NEXT_PUBLIC_APP_URL}/events/${eventSlug}`;

  await Promise.all([
    getNovu().trigger('new-rsvp-organizer', {
      to: { subscriberId },
      payload: {
        message: translations.newRsvp[notifLocale](eventTitle, attendeeName),
        buttonText: translations.buttons.viewEvent[notifLocale],
        eventUrl,
      },
    }),
    sendPushToUser(subscriberId, {
      title: translations.newRsvp[notifLocale](eventTitle, attendeeName),
      body: translations.buttons.viewEvent[notifLocale],
      url: eventUrl,
      tag: `new-rsvp-${eventSlug}`,
    }),
  ]);
}

export async function notifyFeedbackRequest(
  subscriberId: string,
  locale: Locale,
  eventTitle: string,
  eventSlug: string
) {
  const notifLocale = getNotificationLocale(locale);
  const eventUrl = `${process.env.NEXT_PUBLIC_APP_URL}/events/${eventSlug}`;

  await Promise.all([
    getNovu().trigger('feedback-request', {
      to: { subscriberId },
      payload: {
        subject: translations.feedbackRequest[notifLocale](eventTitle),
        body: translations.feedbackRequestBody[notifLocale],
        primaryActionLabel: translations.buttons.shareFeedback[notifLocale],
        primaryActionUrl: eventUrl,
      },
    }),
    sendPushToUser(subscriberId, {
      title: translations.feedbackRequest[notifLocale](eventTitle),
      body: translations.feedbackRequestBody[notifLocale],
      url: eventUrl,
      tag: `feedback-${eventSlug}`,
      requireInteraction: true,
    }),
  ]);
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

// Event invitation notification (email-based, no subscriber ID needed)
export async function notifyEventInvitation(
  inviteeEmail: string,
  inviteeName: string | null,
  locale: Locale,
  eventTitle: string,
  eventSlug: string,
  eventDescription: string | null,
  startsAt: string,
  locationName: string | null,
  inviterName: string,
  token: string
) {
  const notifLocale = getNotificationLocale(locale);
  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${token}`;

  // Format event date/time for display
  const eventDate = new Date(startsAt);
  const formattedDate = eventDate.toLocaleDateString(notifLocale === 'vi' ? 'vi-VN' : notifLocale === 'fr' ? 'fr-FR' : 'en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  });
  const formattedTime = eventDate.toLocaleTimeString(notifLocale === 'vi' ? 'vi-VN' : notifLocale === 'fr' ? 'fr-FR' : 'en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Ho_Chi_Minh',
  });

  const inviteTranslations = {
    subject: {
      en: (inviter: string, title: string) => `${inviter} invited you to "${title}"`,
      fr: (inviter: string, title: string) => `${inviter} vous invite à "${title}"`,
      vi: (inviter: string, title: string) => `${inviter} mời bạn tham gia "${title}"`,
    },
    body: {
      en: (date: string, time: string, location: string | null) =>
        `${date} at ${time}${location ? ` • ${location}` : ''}`,
      fr: (date: string, time: string, location: string | null) =>
        `${date} à ${time}${location ? ` • ${location}` : ''}`,
      vi: (date: string, time: string, location: string | null) =>
        `${date} lúc ${time}${location ? ` • ${location}` : ''}`,
    },
    buttons: {
      going: { en: "Yes, I'm going", fr: 'Oui, je viens', vi: 'Có, tôi sẽ đến' },
      maybe: { en: 'Maybe', fr: 'Peut-être', vi: 'Có thể' },
      notGoing: { en: "Can't make it", fr: 'Non, désolé', vi: 'Không thể đến' },
      viewDetails: { en: 'View event', fr: 'Voir l\'événement', vi: 'Xem sự kiện' },
      addToCalendar: { en: 'Add to calendar', fr: 'Ajouter au calendrier', vi: 'Thêm vào lịch' },
    },
  };

  // Trigger email workflow (uses email as subscriber ID for non-users)
  await getNovu().trigger('event-invitation', {
    to: {
      subscriberId: `invite-${token}`,
      email: inviteeEmail,
      firstName: inviteeName || undefined,
    },
    payload: {
      subject: inviteTranslations.subject[notifLocale](inviterName, eventTitle),
      eventTitle,
      eventDescription: eventDescription || '',
      eventDate: formattedDate,
      eventTime: formattedTime,
      locationName: locationName || '',
      inviterName,
      inviteeName: inviteeName || '',
      inviteUrl,
      goingUrl: `${inviteUrl}?rsvp=going`,
      maybeUrl: `${inviteUrl}?rsvp=interested`,
      notGoingUrl: `${inviteUrl}?rsvp=cancelled`,
      calendarUrl: `${inviteUrl}/calendar.ics`,
      eventUrl: `${process.env.NEXT_PUBLIC_APP_URL}/events/${eventSlug}`,
      goingLabel: inviteTranslations.buttons.going[notifLocale],
      maybeLabel: inviteTranslations.buttons.maybe[notifLocale],
      notGoingLabel: inviteTranslations.buttons.notGoing[notifLocale],
      viewDetailsLabel: inviteTranslations.buttons.viewDetails[notifLocale],
      addToCalendarLabel: inviteTranslations.buttons.addToCalendar[notifLocale],
    },
  });
}

// Schedule event reminders using Novu's delay feature
// This triggers workflows that will be delayed until the specified time
export async function scheduleEventReminders(
  subscriberId: string,
  locale: Locale,
  eventId: string,
  eventTitle: string,
  eventSlug: string,
  startsAt: string,
  locationName?: string | null,
  googleMapsUrl?: string | null
) {
  const notifLocale = getNotificationLocale(locale);
  const eventStart = new Date(startsAt);
  const now = new Date();

  const time24hBefore = new Date(eventStart.getTime() - 24 * 60 * 60 * 1000);
  const time2hBefore = new Date(eventStart.getTime() - 2 * 60 * 60 * 1000);

  const baseUrl = `${process.env.NEXT_PUBLIC_APP_URL}/events/${eventSlug}`;

  // Format time for display (e.g., "3:00 PM")
  const eventTime = eventStart.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Ho_Chi_Minh',
  });

  const results = { scheduled24h: false, scheduled2h: false };

  // Schedule 24h reminder if event is more than 24h away
  if (time24hBefore > now) {
    await getNovu().trigger('24h-reminder-scheduled', {
      to: { subscriberId },
      payload: {
        eventId,
        eventTitle,
        eventSlug,
        eventTime,
        subject: translations.confirmAttendance24h[notifLocale](eventTitle, eventTime),
        primaryActionLabel: translations.buttons.yes[notifLocale],
        primaryActionUrl: `${baseUrl}?confirm=yes`,
        secondaryActionLabel: translations.buttons.changePlans[notifLocale],
        secondaryActionUrl: `${baseUrl}?confirm=no`,
        emailPrompt: translations.email.clickToConfirm[notifLocale],
        delayTill: time24hBefore.toISOString(),
      },
    });
    results.scheduled24h = true;
  }

  // Schedule 2h reminder if event is more than 2h away
  if (time2hBefore > now) {
    await getNovu().trigger('2h-reminder-scheduled', {
      to: { subscriberId },
      payload: {
        eventId,
        eventTitle,
        eventSlug,
        locationName: locationName || 'the venue',
        googleMapsUrl: googleMapsUrl || undefined,
        subject: translations.finalReminder2h[notifLocale](eventTitle, locationName || 'the venue'),
        primaryActionLabel: googleMapsUrl
          ? translations.buttons.getDirections[notifLocale]
          : translations.buttons.viewEvent[notifLocale],
        primaryActionUrl: googleMapsUrl || baseUrl,
        secondaryActionLabel: translations.buttons.changePlans[notifLocale],
        secondaryActionUrl: baseUrl,
        emailBody: translations.email.seeYouThere[notifLocale],
        delayTill: time2hBefore.toISOString(),
      },
    });
    results.scheduled2h = true;
  }

  return results;
}

// Schedule feedback request for after event ends
// Called at RSVP time, triggered 3 hours after event ends
export async function scheduleFeedbackRequest(
  subscriberId: string,
  locale: Locale,
  eventId: string,
  eventTitle: string,
  eventSlug: string,
  startsAt: string,
  endsAt: string | null
) {
  const notifLocale = getNotificationLocale(locale);
  const now = new Date();

  // Calculate when event ends (use ends_at or starts_at + 4 hours)
  const eventEnd = endsAt
    ? new Date(endsAt)
    : new Date(new Date(startsAt).getTime() + 4 * 60 * 60 * 1000);

  // Schedule feedback request for 3 hours after event ends
  const feedbackTime = new Date(eventEnd.getTime() + 3 * 60 * 60 * 1000);

  // Only schedule if it's in the future
  if (feedbackTime <= now) {
    return { scheduledFeedback: false };
  }

  const eventUrl = `${process.env.NEXT_PUBLIC_APP_URL}/events/${eventSlug}`;

  await getNovu().trigger('feedback-request-scheduled', {
    to: { subscriberId },
    payload: {
      eventId,
      eventTitle,
      eventSlug,
      subject: translations.feedbackRequest[notifLocale](eventTitle),
      body: translations.feedbackRequestBody[notifLocale],
      primaryActionLabel: translations.buttons.shareFeedback[notifLocale],
      primaryActionUrl: eventUrl,
      delayTill: feedbackTime.toISOString(),
    },
  });

  return { scheduledFeedback: true, scheduledFor: feedbackTime.toISOString() };
}

// ============================================
// Tribe Notifications
// ============================================

const tribeTranslations = {
  joinRequest: {
    en: (name: string, tribe: string) => `${name} wants to join "${tribe}"`,
    fr: (name: string, tribe: string) => `${name} souhaite rejoindre "${tribe}"`,
    vi: (name: string, tribe: string) => `${name} muốn tham gia "${tribe}"`,
  },
  requestApproved: {
    en: (tribe: string) => `Welcome to "${tribe}"! Your request was approved.`,
    fr: (tribe: string) => `Bienvenue dans "${tribe}" ! Votre demande a été approuvée.`,
    vi: (tribe: string) => `Chào mừng bạn đến "${tribe}"! Yêu cầu của bạn đã được chấp nhận.`,
  },
  requestRejected: {
    en: (tribe: string) => `Your request to join "${tribe}" was not approved.`,
    fr: (tribe: string) => `Votre demande pour rejoindre "${tribe}" n'a pas été approuvée.`,
    vi: (tribe: string) => `Yêu cầu tham gia "${tribe}" của bạn không được chấp nhận.`,
  },
  newEvent: {
    en: (event: string, tribe: string) => `New event "${event}" in ${tribe}`,
    fr: (event: string, tribe: string) => `Nouvel événement "${event}" dans ${tribe}`,
    vi: (event: string, tribe: string) => `Sự kiện mới "${event}" trong ${tribe}`,
  },
  buttons: {
    reviewRequests: { en: 'Review requests', fr: 'Voir les demandes', vi: 'Xem yêu cầu' },
    viewTribe: { en: 'View tribe', fr: 'Voir la tribu', vi: 'Xem tribe' },
    viewEvent: { en: 'View event', fr: 'Voir l\'événement', vi: 'Xem sự kiện' },
  },
};

export async function notifyTribeJoinRequest(
  adminIds: string[],
  requesterName: string,
  tribeName: string,
  tribeSlug: string
) {
  const tribeUrl = `${process.env.NEXT_PUBLIC_APP_URL}/tribes/${tribeSlug}?tab=requests`;

  await Promise.all(adminIds.map(async (adminId) => {
    await Promise.all([
      getNovu().trigger('tribe-join-request', {
        to: { subscriberId: adminId },
        payload: {
          subject: tribeTranslations.joinRequest.en(requesterName, tribeName),
          requesterName,
          tribeName,
          tribeSlug,
          actionUrl: tribeUrl,
          primaryActionLabel: tribeTranslations.buttons.reviewRequests.en,
          primaryActionUrl: tribeUrl,
        },
      }),
      sendPushToUser(adminId, {
        title: tribeTranslations.joinRequest.en(requesterName, tribeName),
        body: tribeTranslations.buttons.reviewRequests.en,
        url: tribeUrl,
        tag: `tribe-request-${tribeSlug}`,
      }),
    ]);
  }));
}

export async function notifyTribeRequestApproved(
  userId: string,
  tribeName: string,
  tribeSlug: string
) {
  const tribeUrl = `${process.env.NEXT_PUBLIC_APP_URL}/tribes/${tribeSlug}`;

  await Promise.all([
    getNovu().trigger('tribe-request-approved', {
      to: { subscriberId: userId },
      payload: {
        subject: tribeTranslations.requestApproved.en(tribeName),
        tribeName,
        tribeSlug,
        actionUrl: tribeUrl,
        primaryActionLabel: tribeTranslations.buttons.viewTribe.en,
        primaryActionUrl: tribeUrl,
      },
    }),
    sendPushToUser(userId, {
      title: tribeTranslations.requestApproved.en(tribeName),
      body: tribeTranslations.buttons.viewTribe.en,
      url: tribeUrl,
      tag: `tribe-approved-${tribeSlug}`,
    }),
  ]);
}

export async function notifyTribeRequestRejected(
  userId: string,
  tribeName: string
) {
  // Only in-app notification for rejections (no push)
  await getNovu().trigger('tribe-request-rejected', {
    to: { subscriberId: userId },
    payload: {
      subject: tribeTranslations.requestRejected.en(tribeName),
      tribeName,
    },
  });
}

export async function notifyTribeNewEvent(
  memberIds: string[],
  eventTitle: string,
  eventSlug: string,
  tribeName: string
) {
  const eventUrl = `${process.env.NEXT_PUBLIC_APP_URL}/events/${eventSlug}`;

  await Promise.all(memberIds.map(async (memberId) => {
    await Promise.all([
      getNovu().trigger('tribe-new-event', {
        to: { subscriberId: memberId },
        payload: {
          subject: tribeTranslations.newEvent.en(eventTitle, tribeName),
          eventTitle,
          eventSlug,
          tribeName,
          actionUrl: eventUrl,
          primaryActionLabel: tribeTranslations.buttons.viewEvent.en,
          primaryActionUrl: eventUrl,
        },
      }),
      sendPushToUser(memberId, {
        title: tribeTranslations.newEvent.en(eventTitle, tribeName),
        body: tribeTranslations.buttons.viewEvent.en,
        url: eventUrl,
        tag: `tribe-event-${eventSlug}`,
      }),
    ]);
  }));
}
