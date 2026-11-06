-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('MEMBER', 'PROFESSIONAL');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('BOOKED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReminderType" AS ENUM ('HOURS_24', 'HOUR_1');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('PENDING', 'PROCESSING', 'DELIVERED', 'CANCELLED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "timezone" TEXT NOT NULL,
    "title" TEXT,
    "bio" TEXT,
    "focus_areas" TEXT,
    "session_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "professional_id" UUID NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "member_id" UUID NOT NULL,
    "professional_id" UUID NOT NULL,
    "start_at" TIMESTAMPTZ(3) NOT NULL,
    "end_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'BOOKED',
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "type" "ReminderType" NOT NULL,
    "scheduled_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "ReminderStatus" NOT NULL DEFAULT 'PENDING',
    "delivered_at" TIMESTAMPTZ(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_at" TIMESTAMPTZ(3),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "reminder_id" UUID NOT NULL,
    "message" TEXT NOT NULL,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "availability_professional_id_day_of_week_idx" ON "availability"("professional_id", "day_of_week");

-- CreateIndex
CREATE INDEX "sessions_member_id_status_start_at_idx" ON "sessions"("member_id", "status", "start_at");

-- CreateIndex
CREATE INDEX "sessions_professional_id_status_start_at_idx" ON "sessions"("professional_id", "status", "start_at");

-- CreateIndex
CREATE INDEX "sessions_status_end_at_idx" ON "sessions"("status", "end_at");

-- CreateIndex
CREATE INDEX "reminders_status_scheduled_at_idx" ON "reminders"("status", "scheduled_at");

-- CreateIndex
CREATE INDEX "reminders_session_id_status_idx" ON "reminders"("session_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_reminder_id_key" ON "notifications"("reminder_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- AddForeignKey
ALTER TABLE "availability" ADD CONSTRAINT "availability_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_reminder_id_fkey" FOREIGN KEY ("reminder_id") REFERENCES "reminders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Wall-clock and session integrity checks that Prisma schema cannot express.
ALTER TABLE "availability"
  ADD CONSTRAINT "availability_day_of_week_range" CHECK ("day_of_week" BETWEEN 1 AND 7),
  ADD CONSTRAINT "availability_time_format" CHECK (
    "start_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    AND "end_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  ),
  ADD CONSTRAINT "availability_time_order" CHECK ("start_time" < "end_time");

ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_end_after_start" CHECK ("end_at" > "start_at"),
  ADD CONSTRAINT "sessions_distinct_participants" CHECK ("member_id" <> "professional_id");

-- Half-open ranges so a session ending at 10:50 does not block one starting at 10:50.
-- Partial predicates keep cancelled sessions out of the conflict check.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_professional_no_overlap"
  EXCLUDE USING gist (
    "professional_id" WITH =,
    tstzrange("start_at", "end_at", '[)') WITH &&
  )
  WHERE ("status" = 'BOOKED');

ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_member_no_overlap"
  EXCLUDE USING gist (
    "member_id" WITH =,
    tstzrange("start_at", "end_at", '[)') WITH &&
  )
  WHERE ("status" = 'BOOKED');

CREATE UNIQUE INDEX "reminders_one_active_per_type"
  ON "reminders" ("session_id", "recipient_id", "type")
  WHERE "status" IN ('PENDING', 'PROCESSING');

CREATE OR REPLACE FUNCTION sessions_enforce_roles() RETURNS trigger AS $$
DECLARE
  member_role text;
  professional_role text;
BEGIN
  SELECT role::text INTO member_role FROM users WHERE id = NEW.member_id;
  SELECT role::text INTO professional_role FROM users WHERE id = NEW.professional_id;
  IF member_role IS DISTINCT FROM 'MEMBER' THEN
    RAISE EXCEPTION 'session member must have the MEMBER role' USING ERRCODE = '23514';
  END IF;
  IF professional_role IS DISTINCT FROM 'PROFESSIONAL' THEN
    RAISE EXCEPTION 'session professional must have the PROFESSIONAL role' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sessions_enforce_roles_trg
BEFORE INSERT OR UPDATE OF member_id, professional_id ON sessions
FOR EACH ROW EXECUTE FUNCTION sessions_enforce_roles();

CREATE OR REPLACE FUNCTION availability_requires_professional() RETURNS trigger AS $$
DECLARE
  user_role text;
BEGIN
  SELECT role::text INTO user_role FROM users WHERE id = NEW.professional_id;
  IF user_role IS DISTINCT FROM 'PROFESSIONAL' THEN
    RAISE EXCEPTION 'availability requires a professional' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER availability_requires_professional_trg
BEFORE INSERT OR UPDATE OF professional_id ON availability
FOR EACH ROW EXECUTE FUNCTION availability_requires_professional();
