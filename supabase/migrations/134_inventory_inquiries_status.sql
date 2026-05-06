-- 134_inventory_inquiries_status.sql
-- Add workflow status to web lead inquiries so dealers can track, archive, and delete them.

ALTER TABLE public.inventory_inquiries
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'imported', 'archived'));

-- Allow org members to update status of their own inquiries
CREATE POLICY "org_can_update_inquiries"
  ON public.inventory_inquiries
  FOR UPDATE
  USING  (org_id = public.get_org_id())
  WITH CHECK (org_id = public.get_org_id());

-- Allow org members to delete their own inquiries
CREATE POLICY "org_can_delete_inquiries"
  ON public.inventory_inquiries
  FOR DELETE
  USING (org_id = public.get_org_id());
