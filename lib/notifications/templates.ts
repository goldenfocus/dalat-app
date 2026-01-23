import type { Locale } from '@/lib/types';
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
  NotificationPayload,
} from './types';

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
  // Use English for email invites - recipient may not speak inviter's language
  // The invite page will display in recipient's browser locale anyway
  const inviteUrl = `${getBaseUrl()}/en/invite/${payload.token}`;

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

  const inviteTranslations = {
    subject: {
      en: `${payload.inviterName} invited you to "${payload.eventTitle}"`,
      fr: `${payload.inviterName} vous invite à "${payload.eventTitle}"`,
      vi: `${payload.inviterName} mời bạn tham gia "${payload.eventTitle}"`,
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
      primaryActionUrl: inviteUrl,
      primaryActionLabel: inviteTranslations.buttons.going[locale],
    },
    push: {
      title,
      body,
      primaryActionUrl: inviteUrl,
      tag: `invite-${payload.eventSlug}`,
      requireInteraction: true,
    },
    email: {
      title: emailTitle,
      body: emailBody,
      subject: emailTitle,
      primaryActionUrl: `${inviteUrl}?rsvp=going`,
      primaryActionLabel: inviteTranslations.buttons.going.en,
      secondaryActionUrl: `${inviteUrl}?rsvp=cancelled`,
      secondaryActionLabel: inviteTranslations.buttons.notGoing.en,
      html: generateEventInvitationEmailHtml(payload, 'en', inviteUrl, emailFormattedDate, emailFormattedTime),
    },
  };
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
// Email HTML Generator for Event Invitations
// ============================================

function generateEventInvitationEmailHtml(
  payload: EventInvitationPayload,
  locale: NotificationLocale,
  inviteUrl: string,
  formattedDate: string,
  formattedTime: string
): string {
  const buttonLabels = {
    going: { en: "Yes, I'm going", fr: 'Oui, je viens', vi: 'Có, tôi sẽ đến' },
    maybe: { en: 'Maybe', fr: 'Peut-être', vi: 'Có thể' },
    notGoing: { en: "Can't make it", fr: 'Non, désolé', vi: 'Không thể đến' },
  };

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">You're Invited!</h1>
  </div>

  <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 12px 12px;">
    ${payload.inviteeName ? `<p style="font-size: 16px;">Hi ${payload.inviteeName},</p>` : '<p>Hi there,</p>'}

    <p style="font-size: 16px;">${payload.inviterName} invited you to:</p>

    <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e5e7eb;">
      <h2 style="margin: 0 0 10px 0; color: #1f2937;">${payload.eventTitle}</h2>
      <p style="margin: 5px 0; color: #6b7280;">📅 ${formattedDate} at ${formattedTime}</p>
      ${payload.locationName ? `<p style="margin: 5px 0; color: #6b7280;">📍 ${payload.locationName}</p>` : ''}
      ${payload.eventDescription ? `<p style="margin: 15px 0 0 0; color: #4b5563;">${payload.eventDescription.slice(0, 200)}${payload.eventDescription.length > 200 ? '...' : ''}</p>` : ''}
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${inviteUrl}?rsvp=going" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; margin: 5px;">
        ${buttonLabels.going[locale]}
      </a>
      <a href="${inviteUrl}?rsvp=interested" style="display: inline-block; background: #f3f4f6; color: #374151; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; margin: 5px;">
        ${buttonLabels.maybe[locale]}
      </a>
    </div>

    <p style="font-size: 14px; color: #6b7280; margin-top: 30px; text-align: center;">
      <a href="${inviteUrl}" style="color: #667eea;">View event details</a>
    </p>
  </div>

  <p style="font-size: 12px; color: #9ca3af; text-align: center; margin-top: 20px;">
    Sent via Dalat Events
  </p>
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
    default:
      throw new Error(`Unknown notification type: ${(payload as NotificationPayload).type}`);
  }
}
