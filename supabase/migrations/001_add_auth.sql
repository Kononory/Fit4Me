-- ── Step 1: Add user ownership to flows ──────────────────────────────────────
ALTER TABLE flowchart_trees
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_flowchart_trees_user_id ON flowchart_trees(user_id);

-- ── Step 2: Enable Row Level Security ────────────────────────────────────────
ALTER TABLE flowchart_trees ENABLE ROW LEVEL SECURITY;

-- Owner has full access to their own flows
CREATE POLICY "owner_all" ON flowchart_trees
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── Step 3: Share tokens table ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS flow_shares (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id     UUID NOT NULL REFERENCES flowchart_trees(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'base64url'),
  permission  TEXT NOT NULL CHECK (permission IN ('view', 'edit')),
  created_by  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ,
  access_count INTEGER NOT NULL DEFAULT 0,
  last_accessed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_flow_shares_token ON flow_shares(token);
CREATE INDEX IF NOT EXISTS idx_flow_shares_created_by ON flow_shares(created_by);

-- Share tokens: only owner can create/delete their shares
ALTER TABLE flow_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shares_owner_all" ON flow_shares
  FOR ALL
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- ── Step 4: Migrate existing flows to owner ───────────────────────────────────
-- Run this AFTER your first login. Replace <your-user-id> with your auth.uid().
-- UPDATE flowchart_trees SET user_id = '<your-user-id>' WHERE user_id IS NULL;
