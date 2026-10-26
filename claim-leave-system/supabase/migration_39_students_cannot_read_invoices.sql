-- =========================================================
-- ALL10S ERP / WiiTeam — Students can't read fee records (migration 39)
--
-- The student portal no longer shows invoices. This makes the database agree:
-- only a linked PARENT can read a child's invoices and payments. (Staff access
-- is unchanged.)
-- =========================================================

drop policy if exists "portal_view_student_invoices" on student_invoices;
create policy "portal_view_student_invoices" on student_invoices
  for select using (is_linked_parent_of(student_id));

drop policy if exists "portal_view_invoice_payments" on invoice_payments;
create policy "portal_view_invoice_payments" on invoice_payments
  for select using (
    exists (
      select 1 from student_invoices si
      where si.id = invoice_payments.invoice_id
        and is_linked_parent_of(si.student_id)
    )
  );
