-- Fix events.organizer_id foreign key to SET NULL on delete
-- This allows deleting organizers without manually unlinking events first

-- Drop the existing constraint
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_organizer_id_fkey;

-- Re-add with ON DELETE SET NULL
ALTER TABLE events
ADD CONSTRAINT events_organizer_id_fkey
FOREIGN KEY (organizer_id)
REFERENCES organizers(id)
ON DELETE SET NULL;

-- Also fix verification_requests.organizer_id
ALTER TABLE verification_requests DROP CONSTRAINT IF EXISTS verification_requests_organizer_id_fkey;

ALTER TABLE verification_requests
ADD CONSTRAINT verification_requests_organizer_id_fkey
FOREIGN KEY (organizer_id)
REFERENCES organizers(id)
ON DELETE SET NULL;
