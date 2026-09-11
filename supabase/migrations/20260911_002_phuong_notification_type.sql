-- Commit the enum value before any collaboration submission can use it.
alter type public.notification_type add value if not exists 'collaboration_update';
