import type { Locale } from '@/lib/types';
import { getRandomInspiringFooter } from './inspiring-footers';
import { SITE_DOMAIN, SITE_URL } from '@/lib/constants';
import type {
  NotificationContent,
  EmailNotificationContent,
  PushNotificationContent,
  RsvpConfirmationPayload,
  ConfirmAttendance24hPayload,
  FinalReminder2hPayload,
  WaitlistPromotionPayload,
  EventReminderPayload,
  WaitlistPositionPayload,
  NewRsvpPayload,
  FeedbackRequestPayload,
  EventInvitationPayload,
  UserInvitationPayload,
  TribeJoinRequestPayload,
  TribeRequestApprovedPayload,
  TribeRequestRejectedPayload,
  TribeNewEventPayload,
  CommentOnEventPayload,
  CommentOnMomentPayload,
  ReplyToCommentPayload,
  ThreadActivityPayload,
  VideoReadyPayload,
  NotificationPayload,
} from './types';

// Random emoji suffixes to make subjects unique and prevent threading
const SUBJECT_EMOJIS = ['✨', '🎉', '🌟', '💫', '🎊', '🌸', '🍃', '☀️', '🌈', '💜', '💚', '🧡', '💙', '🤍', '🎯', '🚀', '⭐', '🌺', '🎪', '🎭'];

function getRandomSubjectEmoji(): string {
  return SUBJECT_EMOJIS[Math.floor(Math.random() * SUBJECT_EMOJIS.length)];
}

// ============================================
// Supported notification locales
// ============================================

type NotificationLocale = 'en' | 'fr' | 'vi';
const NOTIFICATION_LOCALES: NotificationLocale[] = ['en', 'fr', 'vi'];

function getNotificationLocale(locale: Locale): NotificationLocale {
  return NOTIFICATION_LOCALES.includes(locale as NotificationLocale)
    ? (locale as NotificationLocale)
    : 'en';
}

/**
 * Get the base URL for notifications.
 * Falls back to production URL if NEXT_PUBLIC_APP_URL is not set.
 */
function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'https://dalat.app';
}

// ============================================
// Translation strings
// ============================================

const translations = {
  rsvpConfirmation: {
    en: (title: string) => `You're going to "${title}"!`,
    fr: (title: string) => `Vous participez à "${title}" !`,
    vi: (title: string) => `Bạn sẽ tham gia "${title}"!`,
  },
  rsvpConfirmationBody: {
    en: (desc: string | null) => desc ? `Remember: ${desc}` : 'See you there!',
    fr: (desc: string | null) => desc ? `À retenir : ${desc}` : 'À bientôt !',
    vi: (desc: string | null) => desc ? `Lưu ý: ${desc}` : 'Hẹn gặp bạn!',
  },
  confirmAttendance24h: {
    en: (title: string, time: string) => `"${title}" is tomorrow at ${time}. Are you still coming?`,
    fr: (title: string, time: string) => `"${title}" demain à ${time}. Vous venez toujours ?`,
    vi: (title: string, time: string) => `"${title}" vào ngày mai lúc ${time}. Bạn vẫn đến chứ?`,
  },
  finalReminder2h: {
    en: (title: string, location: string) => `"${title}" starts in 2 hours at ${location}!`,
    fr: (title: string, location: string) => `"${title}" commence dans 2h à ${location} !`,
    vi: (title: string, location: string) => `"${title}" bắt đầu trong 2 giờ tại ${location}!`,
  },
  waitlistPromotion: {
    en: (title: string) => `You got a spot for "${title}"! See you there.`,
    fr: (title: string) => `Vous avez une place pour "${title}" ! À bientôt.`,
    vi: (title: string) => `Bạn đã có chỗ cho "${title}"! Hẹn gặp bạn.`,
  },
  eventReminder: {
    en: (title: string, time: string) => `"${title}" is tomorrow at ${time}. Don't forget!`,
    fr: (title: string, time: string) => `"${title}" demain à ${time}. N'oubliez pas !`,
    vi: (title: string, time: string) => `"${title}" vào ngày mai lúc ${time}. Đừng quên!`,
  },
  confirmAttendance: {
    en: (title: string) => `"${title}" is tomorrow. Still coming?`,
    fr: (title: string) => `"${title}" est demain. Vous venez ?`,
    vi: (title: string) => `"${title}" vào ngày mai. Bạn vẫn đến chứ?`,
  },
  waitlistPosition: {
    en: (title: string, pos: number) => `You're now #${pos} on the waitlist for "${title}".`,
    fr: (title: string, pos: number) => `Vous êtes #${pos} sur la liste d'attente pour "${title}".`,
    vi: (title: string, pos: number) => `Bạn đang ở vị trí #${pos} trong danh sách chờ cho "${title}".`,
  },
  newRsvp: {
    en: (title: string, name: string) => `${name} is going to "${title}"`,
    fr: (title: string, name: string) => `${name} participe à "${title}"`,
    vi: (title: string, name: string) => `${name} sẽ tham gia "${title}"`,
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
  userInvitation: {
    en: (inviter: string, title: string) => `${inviter} invited you to "${title}"`,
    fr: (inviter: string, title: string) => `${inviter} vous invite à "${title}"`,
    vi: (inviter: string, title: string) => `${inviter} mời bạn tham gia "${title}"`,
  },
  userInvitationBody: {
    en: (date: string, time: string, location: string | null) =>
      `${date} at ${time}${location ? ` • ${location}` : ''}`,
    fr: (date: string, time: string, location: string | null) =>
      `${date} à ${time}${location ? ` • ${location}` : ''}`,
    vi: (date: string, time: string, location: string | null) =>
      `${date} lúc ${time}${location ? ` • ${location}` : ''}`,
  },
  tribeJoinRequest: {
    en: (name: string, tribe: string) => `${name} wants to join "${tribe}"`,
    fr: (name: string, tribe: string) => `${name} souhaite rejoindre "${tribe}"`,
    vi: (name: string, tribe: string) => `${name} muốn tham gia "${tribe}"`,
  },
  tribeRequestApproved: {
    en: (tribe: string) => `Welcome to "${tribe}"! Your request was approved.`,
    fr: (tribe: string) => `Bienvenue dans "${tribe}" ! Votre demande a été approuvée.`,
    vi: (tribe: string) => `Chào mừng bạn đến "${tribe}"! Yêu cầu của bạn đã được chấp nhận.`,
  },
  tribeRequestRejected: {
    en: (tribe: string) => `Your request to join "${tribe}" was not approved.`,
    fr: (tribe: string) => `Votre demande pour rejoindre "${tribe}" n'a pas été approuvée.`,
    vi: (tribe: string) => `Yêu cầu tham gia "${tribe}" của bạn không được chấp nhận.`,
  },
  tribeNewEvent: {
    en: (event: string, tribe: string) => `New event "${event}" in ${tribe}`,
    fr: (event: string, tribe: string) => `Nouvel événement "${event}" dans ${tribe}`,
    vi: (event: string, tribe: string) => `Sự kiện mới "${event}" trong ${tribe}`,
  },
  // Comment notifications
  commentOnEvent: {
    en: (commenter: string, event: string) => `${commenter} commented on "${event}"`,
    fr: (commenter: string, event: string) => `${commenter} a commenté "${event}"`,
    vi: (commenter: string, event: string) => `${commenter} đã bình luận về "${event}"`,
  },
  commentOnMoment: {
    en: (commenter: string) => `${commenter} commented on your moment`,
    fr: (commenter: string) => `${commenter} a commenté votre moment`,
    vi: (commenter: string) => `${commenter} đã bình luận về khoảnh khắc của bạn`,
  },
  replyToComment: {
    en: (replier: string) => `${replier} replied to your comment`,
    fr: (replier: string) => `${replier} a répondu à votre commentaire`,
    vi: (replier: string) => `${replier} đã trả lời bình luận của bạn`,
  },
  threadActivity: {
    en: (count: number, title: string) => `${count} new ${count === 1 ? 'comment' : 'comments'} on "${title}"`,
    fr: (count: number, title: string) => `${count} ${count === 1 ? 'nouveau commentaire' : 'nouveaux commentaires'} sur "${title}"`,
    vi: (count: number, title: string) => `${count} bình luận mới về "${title}"`,
  },
  // Video processing notifications
  videoReady: {
    en: (count?: number) => count && count > 1 ? `${count} videos are ready!` : 'Your video is ready!',
    fr: (count?: number) => count && count > 1 ? `${count} vidéos sont prêtes !` : 'Votre vidéo est prête !',
    vi: (count?: number) => count && count > 1 ? `${count} video đã sẵn sàng!` : 'Video của bạn đã sẵn sàng!',
  },
  videoReadyBody: {
    en: (event: string) => `Your moment from "${event}" is now live. Tap to view.`,
    fr: (event: string) => `Votre moment de "${event}" est maintenant en ligne.`,
    vi: (event: string) => `Khoảnh khắc của bạn từ "${event}" đã được đăng.`,
  },
  buttons: {
    viewEvent: { en: 'View Event', fr: 'Voir', vi: 'Xem sự kiện' },
    yes: { en: 'Yes, coming', fr: 'Oui', vi: 'Có, tôi đến' },
    no: { en: "Can't make it", fr: 'Non', vi: 'Không thể đến' },
    getDirections: { en: 'Get Directions', fr: 'Itinéraire', vi: 'Chỉ đường' },
    changePlans: { en: 'Change plans', fr: 'Modifier', vi: 'Thay đổi' },
    shareFeedback: { en: 'Share feedback', fr: 'Donner mon avis', vi: 'Chia sẻ nhận xét' },
    reviewRequests: { en: 'Review requests', fr: 'Voir les demandes', vi: 'Xem yêu cầu' },
    viewTribe: { en: 'View tribe', fr: 'Voir la tribu', vi: 'Xem tribe' },
    viewComments: { en: 'View comments', fr: 'Voir les commentaires', vi: 'Xem bình luận' },
    viewMoment: { en: 'View moment', fr: 'Voir le moment', vi: 'Xem khoảnh khắc' },
  },
  email: {
    clickToConfirm: { en: 'Click below to confirm:', fr: 'Cliquez ci-dessous pour confirmer :', vi: 'Nhấn bên dưới để xác nhận:' },
    seeYouThere: { en: 'See you there!', fr: 'À bientôt !', vi: 'Hẹn gặp bạn!' },
  },
};

// ============================================
// Template Interface
// ============================================

interface TemplateResult {
  inApp: NotificationContent;
  push: PushNotificationContent;
  email?: EmailNotificationContent;
}

// ============================================
// Template Functions
// ============================================

function rsvpConfirmationTemplate(payload: RsvpConfirmationPayload): TemplateResult {
  const locale = getNotificationLocale(payload.locale);
  const eventUrl = `${getBaseUrl()}/events/${payload.eventSlug}`;

  const title = translations.rsvpConfirmation[locale](payload.eventTitle);
  const body = translations.rsvpConfirmationBody[locale](payload.eventDescription || null);

  return {
    inApp: {
      title,
      body,
      primaryActionUrl: eventUrl,
      primaryActionLabel: translations.buttons.viewEvent[locale],
    },
    push: {
      title,
      body,
      primaryActionUrl: eventUrl,
      tag: `rsvp-${payload.eventSlug}`,
    },
  };
}

function confirmAttendance24hTemplate(payload: ConfirmAttendance24hPayload): TemplateResult {
  const locale = getNotificationLocale(payload.locale);
  const baseUrl = `${getBaseUrl()}/events/${payload.eventSlug}`;

  const title = translations.confirmAttendance24h[locale](payload.eventTitle, payload.eventTime);
  const body = translations.email.clickToConfirm[locale];

  return {
    inApp: {
      title,
      body,
      primaryActionUrl: `${baseUrl}?confirm=yes`,
      primaryActionLabel: translations.buttons.yes[locale],
      secondaryActionUrl: `${baseUrl}?cancel=true`,
      secondaryActionLabel: translations.buttons.changePlans[locale],
    },
    push: {
      title,
      body,
      primaryActionUrl: `${baseUrl}?confirm=yes`,
      tag: `24h-${payload.eventSlug}`,
      requireInteraction: true,
    },
  };
}

function finalReminder2hTemplate(payload: FinalReminder2hPayload): TemplateResult {
  const locale = getNotificationLocale(payload.locale);
  const eventUrl = `${getBaseUrl()}/events/${payload.eventSlug}`;

  const title = translations.finalReminder2h[locale](payload.eventTitle, payload.locationName);
  const body = translations.email.seeYouThere[locale];

  return {
    inApp: {
      title,
      body,
      primaryActionUrl: payload.googleMapsUrl || eventUrl,
      primaryActionLabel: payload.googleMapsUrl
        ? translations.buttons.getDirections[locale]
        : translations.buttons.viewEvent[locale],
      secondaryActionUrl: eventUrl,
      secondaryActionLabel: translations.buttons.changePlans[locale],
    },
    push: {
      title,
      body,
      primaryActionUrl: payload.googleMapsUrl || eventUrl,
      tag: `2h-${payload.eventSlug}`,
      requireInteraction: true,
    },
  };
}

function waitlistPromotionTemplate(payload: WaitlistPromotionPayload): TemplateResult {
  const locale = getNotificationLocale(payload.locale);
  const eventUrl = `${getBaseUrl()}/events/${payload.eventSlug}`;

  const title = translations.waitlistPromotion[locale](payload.eventTitle);
  const body = translations.buttons.viewEvent[locale];

  return {
    inApp: {
      title,
      body,
      primaryActionUrl: eventUrl,
      primaryActionLabel: translations.buttons.viewEvent[locale],
    },
    push: {
      title,
      body,
      primaryActionUrl: eventUrl,
      tag: `waitlist-${payload.eventSlug}`,
      requireInteraction: true,
    },
  };
}

function eventReminderTemplate(payload: EventReminderPayload): TemplateResult {
  const locale = getNotificationLocale(payload.locale);
  const eventUrl = `${getBaseUrl()}/events/${payload.eventSlug}`;

  const title = translations.eventReminder[locale](payload.eventTitle, payload.eventTime);
  const body = translations.buttons.viewEvent[locale];

  return {
    inApp: {
      title,
      body,
      primaryActionUrl: eventUrl,
      primaryActionLabel: translations.buttons.viewEvent[locale],
    },
    push: {
      title,
      body,
      primaryActionUrl: eventUrl,
      tag: `reminder-${payload.eventSlug}`,
    },
  };
}

function waitlistPositionTemplate(payload: WaitlistPositionPayload): TemplateResult {
  const locale = getNotificationLocale(payload.locale);
  const eventUrl = `${getBaseUrl()}/events/${payload.eventSlug}`;

  const title = translations.waitlistPosition[locale](payload.eventTitle, payload.position);
  const body = translations.buttons.viewEvent[locale];

  return {
    inApp: {
      title,
      body,
      primaryActionUrl: eventUrl,
      primaryActionLabel: translations.buttons.viewEvent[locale],
    },
    push: {
      title,
      body,
      primaryActionUrl: eventUrl,
      tag: `waitlist-pos-${payload.eventSlug}`,
    },
  };
}

function newRsvpTemplate(payload: NewRsvpPayload): TemplateResult {
  const locale = getNotificationLocale(payload.locale);
  const eventUrl = `${getBaseUrl()}/events/${payload.eventSlug}`;

  const title = translations.newRsvp[locale](payload.eventTitle, payload.attendeeName);
  const body = translations.buttons.viewEvent[locale];

  return {
    inApp: {
      title,
      body,
      primaryActionUrl: eventUrl,
      primaryActionLabel: translations.buttons.viewEvent[locale],
    },
    push: {
      title,
      body,
      primaryActionUrl: eventUrl,
      tag: `new-rsvp-${payload.eventSlug}`,
    },
  };
}

function feedbackRequestTemplate(payload: FeedbackRequestPayload): TemplateResult {
  const locale = getNotificationLocale(payload.locale);
  const eventUrl = `${getBaseUrl()}/events/${payload.eventSlug}`;

  const title = translations.feedbackRequest[locale](payload.eventTitle);
  const body = translations.feedbackRequestBody[locale];

  return {
    inApp: {
      title,
      body,
      primaryActionUrl: eventUrl,
      primaryActionLabel: translations.buttons.shareFeedback[locale],
    },
    push: {
      title,
      body,
      primaryActionUrl: eventUrl,
      tag: `feedback-${payload.eventSlug}`,
      requireInteraction: true,
    },
  };
}

function eventInvitationTemplate(payload: EventInvitationPayload): TemplateResult {
  const locale = getNotificationLocale(payload.locale);
  // Link directly to event page - simpler and more reliable than token-based invite system
  const eventUrl = `${getBaseUrl()}/en/events/${payload.eventSlug}`;

  // Format date/time for in-app/push (uses inviter's locale)
  const eventDate = new Date(payload.startsAt);
  const formattedDate = eventDate.toLocaleDateString(
    locale === 'vi' ? 'vi-VN' : locale === 'fr' ? 'fr-FR' : 'en-US',
    { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }
  );
  const formattedTime = eventDate.toLocaleTimeString(
    locale === 'vi' ? 'vi-VN' : locale === 'fr' ? 'fr-FR' : 'en-US',
    { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Ho_Chi_Minh' }
  );

  // Format date/time for email (always English)
  const emailFormattedDate = eventDate.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'Asia/Ho_Chi_Minh'
  });
  const emailFormattedTime = eventDate.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Ho_Chi_Minh'
  });

  // Random emoji to make each email subject unique and prevent threading
  const subjectEmoji = getRandomSubjectEmoji();

  const inviteTranslations = {
    subject: {
      en: `${subjectEmoji} ${payload.inviterName} invited you to "${payload.eventTitle}"`,
      fr: `${subjectEmoji} ${payload.inviterName} vous invite à "${payload.eventTitle}"`,
      vi: `${subjectEmoji} ${payload.inviterName} mời bạn tham gia "${payload.eventTitle}"`,
    },
    body: {
      en: `${formattedDate} at ${formattedTime}${payload.locationName ? ` • ${payload.locationName}` : ''}`,
      fr: `${formattedDate} à ${formattedTime}${payload.locationName ? ` • ${payload.locationName}` : ''}`,
      vi: `${formattedDate} lúc ${formattedTime}${payload.locationName ? ` • ${payload.locationName}` : ''}`,
    },
    buttons: {
      going: { en: "Yes, I'm going", fr: 'Oui, je viens', vi: 'Có, tôi sẽ đến' },
      notGoing: { en: "Can't make it", fr: 'Non, désolé', vi: 'Không thể đến' },
    },
  };

  const title = inviteTranslations.subject[locale];
  const body = inviteTranslations.body[locale];

  // Email uses English with English-formatted dates
  const emailTitle = inviteTranslations.subject.en;
  const emailBody = `${emailFormattedDate} at ${emailFormattedTime}${payload.locationName ? ` • ${payload.locationName}` : ''}`;

  return {
    inApp: {
      title,
      body,
      primaryActionUrl: eventUrl,
      primaryActionLabel: inviteTranslations.buttons.going[locale],
    },
    push: {
      title,
      body,
      primaryActionUrl: eventUrl,
      tag: `invite-${payload.eventSlug}`,
      requireInteraction: true,
    },
    email: {
      title: emailTitle,
      body: emailBody,
      subject: emailTitle,
      primaryActionUrl: eventUrl,
      primaryActionLabel: inviteTranslations.buttons.going.en,
      secondaryActionUrl: eventUrl,
      secondaryActionLabel: inviteTranslations.buttons.notGoing.en,
      html: generateEventInvitationEmailHtml(payload, 'en', eventUrl, emailFormattedDate, emailFormattedTime, getRandomInspiringFooter()),
      text: generateEventInvitationEmailText(payload, eventUrl, emailFormattedDate, emailFormattedTime, getRandomInspiringFooter()),
    },
  };
}

/**
 * Generate plain text email for event invitations.
 * Critical for email deliverability - spam filters prefer multipart emails.
 */
function generateEventInvitationEmailText(
  payload: EventInvitationPayload,
  eventUrl: string,
  formattedDate: string,
  formattedTime: string,
  inspiringFooter: string
): string {
  const lines: string[] = [
    `You're Invited!`,
    '',
    payload.inviteeName ? `Hey ${payload.inviteeName},` : 'Hey there,',
    '',
    `${payload.inviterName} wants you at:`,
    '',
    payload.eventTitle,
    '',
    `WHEN: ${formattedDate} at ${formattedTime}`,
  ];

  if (payload.locationName) {
    lines.push(`WHERE: ${payload.locationName}`);
    if (payload.address) {
      lines.push(`       ${payload.address}`);
    }
  }

  if (payload.eventDescription) {
    lines.push('', 'ABOUT:', payload.eventDescription.slice(0, 500));
  }

  lines.push(
    '',
    '---',
    '',
    `View event & RSVP: ${eventUrl}`,
    '',
    "Can't wait to see you there!",
    '',
    `"${inspiringFooter}"`,
    '',
    '---',
    `Sent via Dalat Events (${SITE_URL})`,
  );

  return lines.join('\n');
}

function userInvitationTemplate(payload: UserInvitationPayload): TemplateResult {
  const locale = getNotificationLocale(payload.locale);
  const eventUrl = `${getBaseUrl()}/events/${payload.eventSlug}`;

  // Format date/time
  const eventDate = new Date(payload.startsAt);
  const formattedDate = eventDate.toLocaleDateString(
    locale === 'vi' ? 'vi-VN' : locale === 'fr' ? 'fr-FR' : 'en-US',
    { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }
  );
  const formattedTime = eventDate.toLocaleTimeString(
    locale === 'vi' ? 'vi-VN' : locale === 'fr' ? 'fr-FR' : 'en-US',
    { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Ho_Chi_Minh' }
  );

  const title = translations.userInvitation[locale](payload.inviterName, payload.eventTitle);
  const body = translations.userInvitationBody[locale](formattedDate, formattedTime, payload.locationName || null);

  return {
    inApp: {
      title,
      body,
      primaryActionUrl: eventUrl,
      primaryActionLabel: translations.buttons.viewEvent[locale],
    },
    push: {
      title,
      body,
      primaryActionUrl: eventUrl,
      tag: `user-invite-${payload.eventSlug}`,
      requireInteraction: true,
    },
  };
}

function tribeJoinRequestTemplate(payload: TribeJoinRequestPayload): TemplateResult {
  const locale = getNotificationLocale(payload.locale);
  const tribeUrl = `${getBaseUrl()}/tribes/${payload.tribeSlug}?tab=requests`;

  const title = translations.tribeJoinRequest[locale](payload.requesterName, payload.tribeName);
  const body = translations.buttons.reviewRequests[locale];

  return {
    inApp: {
      title,
      body,
      primaryActionUrl: tribeUrl,
      primaryActionLabel: translations.buttons.reviewRequests[locale],
    },
    push: {
      title,
      body,
      primaryActionUrl: tribeUrl,
      tag: `tribe-request-${payload.tribeSlug}`,
    },
  };
}

function tribeRequestApprovedTemplate(payload: TribeRequestApprovedPayload): TemplateResult {
  const locale = getNotificationLocale(payload.locale);
  const tribeUrl = `${getBaseUrl()}/tribes/${payload.tribeSlug}`;

  const title = translations.tribeRequestApproved[locale](payload.tribeName);
  const body = translations.buttons.viewTribe[locale];

  return {
    inApp: {
      title,
      body,
      primaryActionUrl: tribeUrl,
      primaryActionLabel: translations.buttons.viewTribe[locale],
    },
    push: {
      title,
      body,
      primaryActionUrl: tribeUrl,
      tag: `tribe-approved-${payload.tribeSlug}`,
    },
  };
}

function tribeRequestRejectedTemplate(payload: TribeRequestRejectedPayload): TemplateResult {
  const locale = getNotificationLocale(payload.locale);

  const title = translations.tribeRequestRejected[locale](payload.tribeName);

  return {
    inApp: {
      title,
      body: '',
    },
    push: {
      title,
      body: '',
    },
  };
}

function tribeNewEventTemplate(payload: TribeNewEventPayload): TemplateResult {
  const locale = getNotificationLocale(payload.locale);
  const eventUrl = `${getBaseUrl()}/events/${payload.eventSlug}`;

  const title = translations.tribeNewEvent[locale](payload.eventTitle, payload.tribeName);
  const body = translations.buttons.viewEvent[locale];

  return {
    inApp: {
      title,
      body,
      primaryActionUrl: eventUrl,
      primaryActionLabel: translations.buttons.viewEvent[locale],
    },
    push: {
      title,
      body,
      primaryActionUrl: eventUrl,
      tag: `tribe-event-${payload.eventSlug}`,
    },
  };
}

// ============================================
// Comment Notification Templates
// ============================================

function commentOnEventTemplate(payload: CommentOnEventPayload): TemplateResult {
  const locale = getNotificationLocale(payload.locale);
  const eventUrl = `${getBaseUrl()}/events/${payload.eventSlug}?comment=${payload.commentId}`;

  const title = translations.commentOnEvent[locale](payload.commenterName, payload.eventTitle);
  const body = payload.commentPreview;

  return {
    inApp: {
      title,
      body,
      primaryActionUrl: eventUrl,
      primaryActionLabel: translations.buttons.viewComments[locale],
    },
    push: {
      title,
      body,
      primaryActionUrl: eventUrl,
      tag: `comment-event-${payload.eventId}`,
    },
  };
}

function commentOnMomentTemplate(payload: CommentOnMomentPayload): TemplateResult {
  const locale = getNotificationLocale(payload.locale);
  const momentUrl = `${getBaseUrl()}/events/${payload.eventSlug}/moments/${payload.momentId}?comment=true`;

  const title = translations.commentOnMoment[locale](payload.commenterName);
  const body = payload.commentPreview;

  return {
    inApp: {
      title,
      body,
      primaryActionUrl: momentUrl,
      primaryActionLabel: translations.buttons.viewComments[locale],
    },
    push: {
      title,
      body,
      primaryActionUrl: momentUrl,
      tag: `comment-moment-${payload.momentId}`,
    },
  };
}

function replyToCommentTemplate(payload: ReplyToCommentPayload): TemplateResult {
  const locale = getNotificationLocale(payload.locale);

  // Build URL based on content type
  const url = payload.contentType === 'event'
    ? `${getBaseUrl()}/events/${payload.eventSlug}?comment=${payload.commentId}`
    : `${getBaseUrl()}/events/${payload.eventSlug}/moments/${payload.contentId}?comment=${payload.commentId}`;

  const title = translations.replyToComment[locale](payload.replierName);
  const body = payload.commentPreview;

  return {
    inApp: {
      title,
      body,
      primaryActionUrl: url,
      primaryActionLabel: translations.buttons.viewComments[locale],
    },
    push: {
      title,
      body,
      primaryActionUrl: url,
      tag: `reply-${payload.parentCommentId}`,
    },
  };
}

function threadActivityTemplate(payload: ThreadActivityPayload): TemplateResult {
  const locale = getNotificationLocale(payload.locale);

  // Build URL based on content type
  const url = payload.contentType === 'event'
    ? `${getBaseUrl()}/events/${payload.eventSlug}?thread=${payload.threadId}`
    : `${getBaseUrl()}/events/${payload.eventSlug}/moments/${payload.contentId}?thread=${payload.threadId}`;

  const title = translations.threadActivity[locale](payload.activityCount, payload.contentTitle);
  const body = translations.buttons.viewComments[locale];

  return {
    inApp: {
      title,
      body,
      primaryActionUrl: url,
      primaryActionLabel: translations.buttons.viewComments[locale],
    },
    push: {
      title,
      body,
      primaryActionUrl: url,
      tag: `thread-${payload.threadId}`,
    },
  };
}

// ============================================
// Video Processing Notification Templates
// ============================================

function videoReadyTemplate(payload: VideoReadyPayload): TemplateResult {
  const locale = getNotificationLocale(payload.locale);
  const momentUrl = `${getBaseUrl()}/events/${payload.eventSlug}/moments/${payload.momentId}`;

  const title = translations.videoReady[locale](payload.videoCount);
  const body = translations.videoReadyBody[locale](payload.eventTitle);

  return {
    inApp: {
      title,
      body,
      primaryActionUrl: momentUrl,
      primaryActionLabel: translations.buttons.viewMoment[locale],
    },
    push: {
      title,
      body,
      primaryActionUrl: momentUrl,
      tag: `video-ready-${payload.momentId}`,
    },
  };
}

// ============================================
// Email HTML Generator for Event Invitations
// ============================================

function generateEventInvitationEmailHtml(
  payload: EventInvitationPayload,
  locale: NotificationLocale,
  eventUrl: string,
  formattedDate: string,
  formattedTime: string,
  inspiringFooter: string
): string {
  const buttonLabels = {
    viewEvent: { en: "View Event & RSVP", fr: 'Voir et Répondre', vi: 'Xem & Đăng ký' },
  };

  const labels = {
    greeting: { en: 'Hey', fr: 'Salut', vi: 'Chào' },
    invitedYou: { en: 'wants you at', fr: 'vous invite à', vi: 'mời bạn đến' },
    joinUs: { en: "Join us for something special!", fr: 'Rejoignez-nous !', vi: 'Hãy cùng tham gia!' },
    when: { en: 'When', fr: 'Quand', vi: 'Khi nào' },
    where: { en: 'Where', fr: 'Où', vi: 'Ở đâu' },
    getDirections: { en: 'Get directions', fr: 'Itinéraire', vi: 'Chỉ đường' },
    about: { en: 'About this event', fr: "À propos de l'événement", vi: 'Về sự kiện' },
    seeDetails: { en: 'See full details', fr: 'Voir les détails', vi: 'Xem chi tiết' },
    footer: { en: "Can't wait to see you there!", fr: 'On a hâte de vous voir !', vi: 'Mong gặp bạn ở đó!' },
  };

  // Format end time if available
  const endTime = payload.endsAt
    ? new Date(payload.endsAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Ho_Chi_Minh' })
    : null;
  const timeRange = endTime ? `${formattedTime} - ${endTime}` : formattedTime;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're Invited!</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 0; background-color: #f3f4f6;">
  <div style="padding: 20px;">
    <!-- Main Card -->
    <div style="background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">

      <!-- Event Image/Flyer -->
      ${payload.eventImageUrl ? `
      <div style="width: 100%;">
        <img src="${payload.eventImageUrl}" alt="${payload.eventTitle}" style="width: 100%; height: auto; display: block;" />
      </div>
      ` : `
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
        <p style="color: rgba(255,255,255,0.9); font-size: 18px; margin: 0;">✨ ${labels.joinUs[locale]} ✨</p>
      </div>
      `}

      <!-- Content -->
      <div style="padding: 30px;">
        <!-- Greeting -->
        <p style="font-size: 16px; color: #6b7280; margin: 0 0 8px 0;">
          ${labels.greeting[locale]}${payload.inviteeName ? ` ${payload.inviteeName}` : ''},
        </p>
        <p style="font-size: 18px; margin: 0 0 24px 0;">
          <strong>${payload.inviterName}</strong> ${labels.invitedYou[locale]}:
        </p>

        <!-- Event Title -->
        <h1 style="font-size: 28px; font-weight: 700; color: #1f2937; margin: 0 0 24px 0; line-height: 1.2;">
          ${payload.eventTitle}
        </h1>

        <!-- Event Details -->
        <div style="background: #f9fafb; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
          <!-- When -->
          <div style="display: flex; margin-bottom: 16px;">
            <div style="width: 24px; margin-right: 12px; text-align: center;">📅</div>
            <div>
              <p style="font-size: 12px; color: #6b7280; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.5px;">${labels.when[locale]}</p>
              <p style="font-size: 16px; font-weight: 600; margin: 0; color: #1f2937;">${formattedDate}</p>
              <p style="font-size: 14px; color: #4b5563; margin: 4px 0 0 0;">${timeRange}</p>
            </div>
          </div>

          <!-- Where -->
          ${payload.locationName ? `
          <div style="display: flex;">
            <div style="width: 24px; margin-right: 12px; text-align: center;">📍</div>
            <div>
              <p style="font-size: 12px; color: #6b7280; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.5px;">${labels.where[locale]}</p>
              <p style="font-size: 16px; font-weight: 600; margin: 0; color: #1f2937;">${payload.locationName}</p>
              ${payload.address ? `<p style="font-size: 14px; color: #4b5563; margin: 4px 0 0 0;">${payload.address}</p>` : ''}
              ${payload.googleMapsUrl ? `<a href="${payload.googleMapsUrl}" style="font-size: 14px; color: #667eea; text-decoration: none; display: inline-block; margin-top: 8px;">🗺️ ${labels.getDirections[locale]} →</a>` : ''}
            </div>
          </div>
          ` : ''}
        </div>

        <!-- Description -->
        ${payload.eventDescription ? `
        <div style="margin-bottom: 24px;">
          <p style="font-size: 12px; color: #6b7280; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 0.5px;">${labels.about[locale]}</p>
          <p style="font-size: 15px; color: #4b5563; margin: 0; white-space: pre-wrap;">${payload.eventDescription.length > 500 ? payload.eventDescription.slice(0, 500) + '...' : payload.eventDescription}</p>
        </div>
        ` : ''}

        <!-- CTA Button -->
        <div style="text-align: center; margin: 32px 0;">
          <a href="${eventUrl}" style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 16px 40px; border-radius: 50px; text-decoration: none; font-weight: 600; font-size: 18px; box-shadow: 0 4px 14px -3px rgba(16, 185, 129, 0.5);">
            ${buttonLabels.viewEvent[locale]} 🎉
          </a>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div style="text-align: center; padding: 24px 20px;">
      <p style="font-size: 14px; color: #6b7280; margin: 0 0 8px 0;">${labels.footer[locale]}</p>
      <p style="font-size: 13px; color: #9ca3af; font-style: italic; margin: 0 0 12px 0;">
        "${inspiringFooter}"
      </p>
      <p style="font-size: 12px; color: #9ca3af; margin: 0;">
        Sent via <a href="${SITE_URL}" style="color: #667eea; text-decoration: none;">${SITE_DOMAIN}</a>
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

// ============================================
// Main Template Function
// ============================================

export function getNotificationTemplate(payload: NotificationPayload): TemplateResult {
  switch (payload.type) {
    case 'rsvp_confirmation':
      return rsvpConfirmationTemplate(payload);
    case 'confirm_attendance_24h':
      return confirmAttendance24hTemplate(payload);
    case 'final_reminder_2h':
      return finalReminder2hTemplate(payload);
    case 'waitlist_promotion':
      return waitlistPromotionTemplate(payload);
    case 'event_reminder':
      return eventReminderTemplate(payload);
    case 'waitlist_position':
      return waitlistPositionTemplate(payload);
    case 'new_rsvp':
      return newRsvpTemplate(payload);
    case 'feedback_request':
      return feedbackRequestTemplate(payload);
    case 'event_invitation':
      return eventInvitationTemplate(payload);
    case 'user_invitation':
      return userInvitationTemplate(payload);
    case 'tribe_join_request':
      return tribeJoinRequestTemplate(payload);
    case 'tribe_request_approved':
      return tribeRequestApprovedTemplate(payload);
    case 'tribe_request_rejected':
      return tribeRequestRejectedTemplate(payload);
    case 'tribe_new_event':
      return tribeNewEventTemplate(payload);
    // Comment notifications
    case 'comment_on_event':
      return commentOnEventTemplate(payload);
    case 'comment_on_moment':
      return commentOnMomentTemplate(payload);
    case 'reply_to_comment':
      return replyToCommentTemplate(payload);
    case 'thread_activity':
      return threadActivityTemplate(payload);
    // Video processing notifications
    case 'video_ready':
      return videoReadyTemplate(payload);
    default:
      throw new Error(`Unknown notification type: ${(payload as NotificationPayload).type}`);
  }
}
