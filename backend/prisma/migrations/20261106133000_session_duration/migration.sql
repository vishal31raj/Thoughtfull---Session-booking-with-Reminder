-- Sessions are always 50 minutes. The application also enforces this before insert.
ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_duration_50min"
  CHECK ("end_at" = "start_at" + interval '50 minutes');
