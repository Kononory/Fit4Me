-- Fix flow_shares.flow_id type: must be TEXT to match flowchart_trees.id (which is TEXT)
-- Safe to re-run: changes type only if it's currently uuid
DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_name = 'flow_shares' AND column_name = 'flow_id') = 'uuid' THEN
    ALTER TABLE flow_shares DROP CONSTRAINT IF EXISTS flow_shares_flow_id_fkey;
    ALTER TABLE flow_shares ALTER COLUMN flow_id TYPE TEXT;
    ALTER TABLE flow_shares ADD CONSTRAINT flow_shares_flow_id_fkey
      FOREIGN KEY (flow_id) REFERENCES flowchart_trees(id) ON DELETE CASCADE;
  END IF;
END $$;
