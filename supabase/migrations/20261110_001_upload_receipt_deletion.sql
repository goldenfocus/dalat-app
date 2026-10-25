-- Deleting a moment must also retire its receipt. SET NULL would make the
-- recovery worker mistake a deliberate deletion for unfinished publication.
ALTER TABLE public.moment_uploads DROP CONSTRAINT moment_uploads_moment_id_fkey;
ALTER TABLE public.moment_uploads ADD CONSTRAINT moment_uploads_moment_id_fkey
  FOREIGN KEY (moment_id) REFERENCES public.moments(id) ON DELETE CASCADE;
