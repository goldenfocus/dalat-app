-- Tribe contacts for bulk email invitations
-- Allows organizers to upload mailing lists and send event invites

-- Contacts uploaded by organizers for bulk invites
CREATE TABLE tribe_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id uuid REFERENCES tribes(id) ON DELETE CASCADE,
  organizer_id uuid REFERENCES organizers(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text,
  phone text,
  notes text,
  status text DEFAULT 'active' CHECK (status IN ('active', 'unsubscribed', 'bounced')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- Prevent duplicates per tribe
  CONSTRAINT unique_tribe_email UNIQUE (tribe_id, email),
  -- Prevent duplicates per organizer
  CONSTRAINT unique_organizer_email UNIQUE (organizer_id, email),

  -- Must belong to either tribe or organizer (not both, not neither)
  CONSTRAINT contact_owner CHECK (
    (tribe_id IS NOT NULL AND organizer_id IS NULL) OR
    (tribe_id IS NULL AND organizer_id IS NOT NULL)
  )
);

-- Track invite history per contact per event
CREATE TABLE contact_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES tribe_contacts(id) ON DELETE CASCADE NOT NULL,
  event_id uuid REFERENCES events(id) ON DELETE CASCADE NOT NULL,
  invite_token text UNIQUE NOT NULL DEFAULT encode(extensions.gen_random_bytes(16), 'hex'),
  sent_at timestamptz DEFAULT now(),
  opened_at timestamptz,
  clicked_at timestamptz,
  status text DEFAULT 'sent' CHECK (status IN ('sent', 'opened', 'clicked', 'bounced', 'unsubscribed')),

  -- Prevent duplicate invites to same contact for same event
  CONSTRAINT unique_contact_event UNIQUE (contact_id, event_id)
);

-- Indexes for performance
CREATE INDEX idx_tribe_contacts_tribe ON tribe_contacts(tribe_id) WHERE tribe_id IS NOT NULL;
CREATE INDEX idx_tribe_contacts_organizer ON tribe_contacts(organizer_id) WHERE organizer_id IS NOT NULL;
CREATE INDEX idx_tribe_contacts_email ON tribe_contacts(email);
CREATE INDEX idx_tribe_contacts_status ON tribe_contacts(status);
CREATE INDEX idx_contact_invites_event ON contact_invites(event_id);
CREATE INDEX idx_contact_invites_token ON contact_invites(invite_token);

-- Enable RLS
ALTER TABLE tribe_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_invites ENABLE ROW LEVEL SECURITY;

-- Tribe admins/leaders can manage their tribe's contacts
CREATE POLICY "Tribe admins can manage contacts"
  ON tribe_contacts FOR ALL
  USING (
    tribe_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM tribe_members
      WHERE tribe_members.tribe_id = tribe_contacts.tribe_id
      AND tribe_members.user_id = auth.uid()
      AND tribe_members.role IN ('admin', 'leader')
    )
  );

-- Organizer owners can manage their contacts
CREATE POLICY "Organizer owners can manage contacts"
  ON tribe_contacts FOR ALL
  USING (
    organizer_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM organizers
      WHERE organizers.id = tribe_contacts.organizer_id
      AND organizers.owner_id = auth.uid()
    )
  );

-- Admins can view all contacts
CREATE POLICY "Admins can view all contacts"
  ON tribe_contacts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Contact invites: same access as parent contact
CREATE POLICY "Users can manage invites for their contacts"
  ON contact_invites FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM tribe_contacts tc
      WHERE tc.id = contact_invites.contact_id
      AND (
        -- Tribe admin/leader
        (tc.tribe_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM tribe_members tm
          WHERE tm.tribe_id = tc.tribe_id
          AND tm.user_id = auth.uid()
          AND tm.role IN ('admin', 'leader')
        ))
        OR
        -- Organizer owner
        (tc.organizer_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM organizers o
          WHERE o.id = tc.organizer_id
          AND o.owner_id = auth.uid()
        ))
      )
    )
  );

-- Public read for invite tokens (needed for invite link clicks)
CREATE POLICY "Anyone can read invite by token"
  ON contact_invites FOR SELECT
  USING (true);

-- Update trigger for tribe_contacts
CREATE OR REPLACE FUNCTION update_tribe_contacts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tribe_contacts_updated_at
  BEFORE UPDATE ON tribe_contacts
  FOR EACH ROW
  EXECUTE FUNCTION update_tribe_contacts_updated_at();

-- Comments
COMMENT ON TABLE tribe_contacts IS 'Mailing list contacts uploaded by tribe admins or organizers for bulk event invitations';
COMMENT ON TABLE contact_invites IS 'Track event invitations sent to contacts with status and engagement';
COMMENT ON COLUMN tribe_contacts.status IS 'active = can receive emails, unsubscribed = opted out, bounced = invalid email';
COMMENT ON COLUMN contact_invites.invite_token IS 'Unique token for trackable invite links';
