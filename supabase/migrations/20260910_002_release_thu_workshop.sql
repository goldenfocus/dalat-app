-- Apply after the deployment removes app/[locale]/thu.
-- Release only our own reservation; never delete a user or another reservation.
DELETE FROM reserved_slugs
WHERE slug = 'thu' AND reason = 'Unlisted collaboration workshop route';
