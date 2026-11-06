# Technical decisions

Assignment requirements are called out as requirements. Everything else is an assumption made so the project could be finished and explained.

## 1. Why PostgreSQL

Requirement: a relational database, and exclusion constraints for overlapping sessions.

PostgreSQL is the database that can enforce both of those in one place. A GiST exclusion constraint rejects an overlapping insert even when two transactions pass an application-level check. Prisma talks to it, and the worker can claim rows with `FOR UPDATE SKIP LOCKED` without adding Redis or another broker.

## 2. How the relationships are designed

Requirement: users, weekly availability, sessions, reminders, and notifications, with foreign keys.

- A user is either a member or a professional. One account does not hold both roles. That is an assumption; the assignment describes two roles, not multi-role accounts.
- Availability belongs to a professional and is deleted with that user.
- A session points at one member and one professional. Cancelling does not delete the row. `cancelledById` records who cancelled it.
- Reminders belong to a session and a recipient. Notifications belong to a user and, uniquely, to one reminder.
- Session instants are `timestamptz`. Weekly hours stay as `HH:mm` strings plus the professional's IANA zone.

A trigger rejects a session whose member is not a `MEMBER` or whose professional is not a `PROFESSIONAL`. Another trigger rejects availability on a member. Prisma cannot express those checks, so they live in SQL.

## 3. How slots are generated

Requirement: generate slots from the weekly pattern. Do not store every slot.

`generateSlots` walks each local day in the requested range, and for each enabled window steps from the window start by `SLOT_INTERVAL_MINUTES`. A candidate is kept only when the whole 50 minutes sit inside the window, the start is still in the future, and the local time exists. Booked ranges are returned with `available: false` so the calendar can show them as taken. The response never includes the other person's name or id.

The default range is 28 days and the maximum request is 31 days. That matches the four-week calendar. It is an assumption about the horizon, not a stored schedule.

## 4. Why a session is 50 minutes

Requirement: every session is exactly 50 minutes.

The service writes `endAt = startAt + 50 minutes`. The database repeats that rule with `sessions_duration_50min`, so a raw insert of a different length fails. The duration is an assignment rule, not a clinical recommendation.

## 5. Why the slot interval is 60 minutes

Requirement: a configurable 60-minute interval, with the 50-minute session leaving a 10-minute buffer. Example: 09:00–12:00 produces 09:00, 10:00, and 11:00.

The grid is aligned to each window's start, not to the top of the hour in absolute terms. A window starting at 10:15 would step 10:15, 11:15, and so on. `SLOT_INTERVAL_MINUTES` must be at least 50. If it were shorter, two generated slots could overlap and the exclusion constraint would reject a booking the calendar had offered. That lower bound is an assumption that keeps the grid safe.

## 6. How timezone conversion works

Requirement: store IANA names, not offsets such as `UTC+5:30`. Show the calendar in the member's zone. Interpret hours in the professional's zone.

Luxon converts a professional-local wall time to a UTC instant, and the API stores that instant. The member UI formats the same instant with the member's zone. A 09:00 slot in `Asia/Singapore` is 08:00 the previous evening in `America/New_York` during standard time. Users pick a zone from a fixed list in the UI; the API accepts any valid IANA name and rejects offsets and abbreviations.

## 7. How daylight saving is handled

Requirement: account for daylight-saving transitions.

Each slot is built with `DateTime.fromObject` in the professional's zone. A local time that does not exist on the spring-forward morning does not come back as that same wall clock, so it is skipped. A repeated fall-back time is offered once. Luxon may return the later instant when today's offset is standard time, so the generator also checks one hour earlier and keeps that instant when it has the same wall clock. The stored value is still a UTC timestamp, so the member's clock shows the correct local time on either side of the change. Tests pin the 2027 US spring-forward and fall-back mornings.

## 8. How concurrent bookings are prevented

Requirement: two members booking the same professional slot at the same time must produce one success and one conflict. A check followed by an insert is not enough.

The insert runs inside a transaction. PostgreSQL's `sessions_professional_no_overlap` exclusion constraint, built with `btree_gist` on `tstzrange(start_at, end_at, '[)')`, allows only one `BOOKED` row per professional for any overlapping range. The half-open range means 10:00–10:50 and 10:50–11:40 are neighbors, not a conflict. Cancelled rows are excluded from the predicate, so the time can be booked again. A `23P01` error that names this constraint becomes HTTP 409 `PROFESSIONAL_OVERLAP`.

The application does not lock the professional row. Locking that row would also block unrelated times.

## 9. How overlapping member sessions are prevented

Requirement: a member cannot hold two overlapping active sessions, even with different professionals.

`sessions_member_no_overlap` is the same shape of exclusion constraint on `member_id`. A violation becomes HTTP 409 `MEMBER_OVERLAP`. The member's own booked ranges are also marked unavailable on the slot API, so the calendar does not offer a time the database will reject.

## 10. How rescheduling stays atomic

Requirement: rescheduling is one transaction. A failure leaves the original session in place. Update the existing row. Do not cancel and create a second active session.

`rescheduleSession` locks the session, checks the 24-hour rule against server time, checks the new instant against the professional's hours, updates `startAt` and `endAt` on that row, cancels pending and processing reminders, and inserts the new reminder drafts. The exclusion constraints run as part of the update. If they fail, the transaction rolls back and the old reminders stay pending. Members may reschedule at exactly 24 hours before the original start, and not one millisecond inside that window. Professionals cannot reschedule a member's session.

## 11. How reminders are scheduled

Requirement: for both people, create a 24-hour reminder and a 1-hour reminder, and skip any reminder whose time has already passed.

`buildReminderDrafts` subtracts 24 hours and 1 hour from the session start. A draft is inserted only when `scheduledAt` is still in the future. A session inside the next 24 hours gets only the one-hour pair. A session inside the next hour gets none. Copy uses the other person's first name and the recipient's zone, for example "Your session with Sarah is tomorrow at 10:00 AM."

## 12. How reminders survive a restart

Requirement: no `setTimeout` or in-memory queue as the source of truth.

Reminder rows are committed with the session. The worker is a separate process. Its `setInterval` only decides when to poll. After a restart it reads `PENDING` rows again. A row left in `PROCESSING` with no notification is returned to `PENDING` after the lock timeout. A row left in `PROCESSING` that already has a notification is marked `DELIVERED`.

## 13. How duplicate notifications are prevented

Requirement: creating the notification and marking the reminder delivered is atomic, and a retry must not create a second notification.

`notifications.reminder_id` is unique. The worker inserts with `ON CONFLICT (reminder_id) DO NOTHING` and sets the reminder to `DELIVERED` in the same transaction. A second worker cannot claim the same pending row because of `SKIP LOCKED`. A partial unique index on `(session_id, recipient_id, type)` where status is `PENDING` or `PROCESSING` lets a reschedule cancel the old reminder and insert a new one without deleting history.

## 14. How authorization and privacy are enforced

Requirement: the server derives identity from the cookie. A member cannot read another member's sessions. A professional cannot read another professional's schedule. Slot payloads do not reveal who booked a time.

The JWT is signed HS256 and stored in `tf_session`. Logout increments `session_version`, so older tokens fail. `requireAuth` loads the user and checks that version. Session queries filter by the authenticated id. A non-participant gets 404, including for cancel and reschedule. Professional list and slot DTOs omit email and member identity. CSRF is a double-submit cookie: `tf_csrf` is readable by the browser, and mutating requests must echo it in `X-CSRF-Token`. The origin is checked when the browser sends one. Auth routes are rate limited. Passwords are hashed with bcrypt. Logs record method and path, not bodies or tokens.

## 15. What would have to change for production healthcare

This build is an assignment, not a clinic system. Before it held real care data it would need at least:

- HTTPS, a real secret manager, and `COOKIE_SECURE=true`
- No demo seed, no shared password, and a shorter session with rotation and revocation beyond a version counter
- Multi-factor authentication, audit logs, encryption at rest, backups, and monitoring
- A private network, reviewed query logging, and a penetration test
- The applicable privacy regime, such as PDPA or HIPAA-style controls, including access reviews and data-retention rules
- Removal of the fictional bios and of any log line that could contain a name

Email, SMS, payments, video, and calendar sync are out of scope for this assignment and are not implemented.

## Other assumptions

- Professionals have a title and a bio of at least 20 characters so the directory is usable.
- The availability screen edits one window per weekday. The API still accepts several non-overlapping windows on the same day.
- Notifications are in-app only.
- `bcryptjs` is used instead of the native `bcrypt` module so the API installs on Windows without node-gyp. The hash format is bcrypt.
- Health checks run `SELECT 1`.
