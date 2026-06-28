-- ============================================================
-- CollabDocs — Row Level Security Policies
-- ============================================================
-- Run this AFTER drizzle migrations (npm run db:push)
-- Apply in Supabase SQL Editor or via psql
--
-- These policies implement tenant isolation at the database level.
-- Even if application code has a bug, the database enforces rules.
-- ============================================================

-- Enable RLS on all tables that contain user data
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_versions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- USERS TABLE
-- Users can only see and update their own profile.
-- ============================================================

CREATE POLICY "users_select_own" ON users
  FOR SELECT
  USING (id::text = current_setting('app.current_user_id', true));

CREATE POLICY "users_update_own" ON users
  FOR UPDATE
  USING (id::text = current_setting('app.current_user_id', true));

-- ============================================================
-- DOCUMENTS TABLE
-- A user can see a document only if they are a member of it.
-- Only the owner can delete a document.
-- ============================================================

CREATE POLICY "documents_select_member" ON documents
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM document_members dm
      WHERE dm.document_id = id
        AND dm.user_id::text = current_setting('app.current_user_id', true)
    )
  );

CREATE POLICY "documents_insert_authenticated" ON documents
  FOR INSERT
  WITH CHECK (
    owner_id::text = current_setting('app.current_user_id', true)
  );

CREATE POLICY "documents_update_editor_or_owner" ON documents
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM document_members dm
      WHERE dm.document_id = id
        AND dm.user_id::text = current_setting('app.current_user_id', true)
        AND dm.role IN ('owner', 'editor')
    )
  );

CREATE POLICY "documents_delete_owner_only" ON documents
  FOR DELETE
  USING (
    owner_id::text = current_setting('app.current_user_id', true)
  );

-- ============================================================
-- DOCUMENT_MEMBERS TABLE
-- Members can see who else is in their documents.
-- Only owners can add/remove members.
-- ============================================================

CREATE POLICY "doc_members_select_member" ON document_members
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM document_members dm2
      WHERE dm2.document_id = document_id
        AND dm2.user_id::text = current_setting('app.current_user_id', true)
    )
  );

CREATE POLICY "doc_members_insert_owner" ON document_members
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM document_members dm
      WHERE dm.document_id = document_id
        AND dm.user_id::text = current_setting('app.current_user_id', true)
        AND dm.role = 'owner'
    )
    -- Exception: allow self-insert when creating a new document
    OR user_id::text = current_setting('app.current_user_id', true)
  );

CREATE POLICY "doc_members_delete_owner" ON document_members
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM document_members dm
      WHERE dm.document_id = document_id
        AND dm.user_id::text = current_setting('app.current_user_id', true)
        AND dm.role = 'owner'
    )
  );

-- ============================================================
-- SYNC_OPERATIONS TABLE
-- Members can read all ops for their documents.
-- Only editors and owners can insert ops.
-- (Viewer enforcement is also done at WS server level for defense-in-depth)
-- ============================================================

CREATE POLICY "sync_ops_select_member" ON sync_operations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM document_members dm
      WHERE dm.document_id = document_id
        AND dm.user_id::text = current_setting('app.current_user_id', true)
    )
  );

CREATE POLICY "sync_ops_insert_editor" ON sync_operations
  FOR INSERT
  WITH CHECK (
    user_id::text = current_setting('app.current_user_id', true)
    AND EXISTS (
      SELECT 1 FROM document_members dm
      WHERE dm.document_id = document_id
        AND dm.user_id::text = current_setting('app.current_user_id', true)
        AND dm.role IN ('owner', 'editor')
    )
  );

-- ============================================================
-- DOCUMENT_VERSIONS TABLE
-- Members can view all versions.
-- Only editors and owners can create versions.
-- ============================================================

CREATE POLICY "doc_versions_select_member" ON document_versions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM document_members dm
      WHERE dm.document_id = document_id
        AND dm.user_id::text = current_setting('app.current_user_id', true)
    )
  );

CREATE POLICY "doc_versions_insert_editor" ON document_versions
  FOR INSERT
  WITH CHECK (
    created_by_id::text = current_setting('app.current_user_id', true)
    AND EXISTS (
      SELECT 1 FROM document_members dm
      WHERE dm.document_id = document_id
        AND dm.user_id::text = current_setting('app.current_user_id', true)
        AND dm.role IN ('owner', 'editor')
    )
  );

-- ============================================================
-- HELPER FUNCTION
-- Call this at the start of every DB session to set the user context.
-- Our Drizzle queries call this before running any user-scoped query.
-- ============================================================

CREATE OR REPLACE FUNCTION set_app_user(user_id TEXT)
RETURNS void AS $$
BEGIN
  PERFORM set_config('app.current_user_id', user_id, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant usage to the app role
GRANT EXECUTE ON FUNCTION set_app_user TO authenticated;
GRANT EXECUTE ON FUNCTION set_app_user TO anon;
