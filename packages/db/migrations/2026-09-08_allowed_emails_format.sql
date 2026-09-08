-- Migration: format constraint on allowed_emails.email.
-- Run once in the Supabase SQL editor. Safe to rerun — all steps are guarded.
--
-- allowed_emails.email was `text not null unique` with no format check, so a
-- typo ("jon@compnay.com") or plain garbage ("asdf") could be written to the
-- allowlist permanently. That was survivable while the allowlist was passive;
-- now that adding an entry also fires an invite email, a bad address means mail
-- sent into the void and an admin told it succeeded.
--
-- The pattern is deliberately permissive and matches isValidEmail() in
-- apps/web/lib/utils.ts — it catches typos and junk, it does not implement
-- RFC 5322. Keep the two in sync.
--
-- Added NOT VALID: the constraint is enforced on every insert and update from
-- here on, but existing rows are not re-checked, so this cannot fail on a live
-- table that already holds a bad address. To enforce it retroactively, clean up
-- any offenders (query below) and then run the VALIDATE step at the bottom.

begin;

alter table allowed_emails
  drop constraint if exists allowed_emails_email_format;

alter table allowed_emails
  add constraint allowed_emails_email_format
  check (
    length(email) <= 254
    and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  )
  not valid;

commit;

-- ── Optional, run separately ────────────────────────────────────────────────
-- Find rows that would fail the constraint:
--
--   select id, email, note, created_at
--   from allowed_emails
--   where not (
--     length(email) <= 254
--     and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
--   );
--
-- Once that returns no rows, promote the constraint to fully enforced:
--
--   alter table allowed_emails validate constraint allowed_emails_email_format;
