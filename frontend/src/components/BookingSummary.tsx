import type { Session } from '../api/types';
import { formatDate, formatTime } from '../lib/time';

export function BookingSummary({ session, timezone }: { session: Session; timezone: string }) {
  return (
    <dl className="grid gap-4 sm:grid-cols-2" data-testid="booking-success">
      <div>
        <dt className="text-xs uppercase tracking-wide text-muted">Professional</dt>
        <dd className="mt-1 font-medium">{session.professional.name}</dd>
      </div>
      <div>
        <dt className="text-xs uppercase tracking-wide text-muted">Status</dt>
        <dd className="mt-1 font-medium capitalize">{session.displayStatus}</dd>
      </div>
      <div>
        <dt className="text-xs uppercase tracking-wide text-muted">Date</dt>
        <dd className="mt-1 font-medium">{formatDate(session.startAt, timezone)}</dd>
      </div>
      <div>
        <dt className="text-xs uppercase tracking-wide text-muted">Time</dt>
        <dd className="mt-1 font-medium">
          {formatTime(session.startAt, timezone)} – {formatTime(session.endAt, timezone)}
        </dd>
      </div>
      <div>
        <dt className="text-xs uppercase tracking-wide text-muted">Duration</dt>
        <dd className="mt-1 font-medium">{session.durationMinutes} minutes</dd>
      </div>
    </dl>
  );
}
