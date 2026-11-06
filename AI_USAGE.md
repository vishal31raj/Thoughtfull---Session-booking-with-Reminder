# AI usage

The application was built in Cursor with the coding agent (Grok 4.7). The agent wrote the API, the React app, the tests, Docker, CI, and these notes. Assignment brief was the source of the requirements. No other AI tool was used.

## How the tool was used

The agent inspected an empty repository, chose the module layout, and wrote the code in the tree rather than leaving a plan. It was asked to keep business rules in services, to put concurrency in PostgreSQL, and to run the tests. Where the brief allowed a choice, the agent picked one and recorded it in `DECISIONS.md`.

## What was AI-assisted

The schema, SQL constraints, auth and CSRF, slot generation, booking, cancellation, rescheduling, the reminder worker, the React screens, the Vitest and Playwright tests, Compose, and the GitHub Actions workflow were drafted by the agent and then corrected against the brief and against the code that actually compiled.

## Corrections

### Check-then-insert was rejected

An early approach to double booking was to read existing sessions and then insert. That loses when two requests pass the read before either insert commits. The implementation uses `sessions_professional_no_overlap` and `sessions_member_no_overlap`, and the booking tests fire two requests with `Promise.all`. Only the database constraint decides the winner.

### A full unique reminder key was unsuitable

A unique key on `(session_id, recipient_id, type)` would keep a cancelled reminder from ever being replaced, so a reschedule could not insert the new 24-hour and 1-hour rows. The index is partial: it applies only while status is `PENDING` or `PROCESSING`. Delivered and cancelled rows stay as history.

### Luxon's daylight-saving defaults were wrong for this grid

The first slot builder trusted `DateTime.fromObject`. On the US spring-forward morning it turned the missing 02:00 into 03:00, so the calendar emitted 03:00 twice. On the fall-back morning it kept the later of the two 01:00 instants. The 2027 New York tests failed with those exact UTC timestamps. The generator now drops a time whose resolved wall clock does not match, and when one hour earlier has the same wall clock it keeps the earlier instant. Re-running `tests/slots.test.ts` confirmed the two mornings.

### Secure cookies were not tied to NODE_ENV

A first pass set the cookie `Secure` flag whenever `NODE_ENV` was `production`. Docker runs the API as production behind `http://localhost:8080`, and the browser would drop those cookies, so login would look successful and the next request would be anonymous. `COOKIE_SECURE` is now an explicit variable and is `false` in Compose. It should be `true` only behind HTTPS.

### Two backend layouts were collapsed

Two structures were written into the same tree: one under `routes/*.routes.ts` and one under `domain/` plus `routes/*.ts`. They disagreed on cookie names, error codes, and response shapes. The domain layout is the one `app.ts` mounts. The unused route files were deleted so TypeScript and reviewers only see the mounted API.

### Vitest was collecting the Playwright spec

`vitest run` treated `e2e/booking.spec.ts` as a unit test and failed because Playwright's `test()` is not Vitest's `test()`. The spec stays in `frontend/e2e` and `vitest.config.ts` excludes that directory. The booking flow is run with `npm run test:e2e`, which starts the API and Vite itself.

The first Playwright run also clicked the wrong link: `getByRole('link', { name: 'Professionals' })` matched both the nav item and "Browse professionals". The spec now uses an exact name, a unique professional name, and assertions scoped to the booking confirmation. That run then completed the register, search, slot, and confirm path.

## How the result was checked

Backend tests run against `thoughtfull_test`, not the development database, because they truncate every table. `npm test` from the repository root runs that suite, the frontend unit tests, and the Playwright booking flow. A feature was not treated as done because the model described it. It was treated as done when the corresponding test or the running UI exercised it.
