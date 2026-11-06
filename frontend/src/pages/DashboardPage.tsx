import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { http } from '../api/client';
import type { Session } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { Empty, Spinner } from '../components/ui';
import { firstName, formatDate, formatTime, greeting } from '../lib/time';

export function DashboardPage() {
  const { user } = useAuth();
  const sessions = useQuery({
    queryKey: ['sessions', 'upcoming'],
    queryFn: async () => (await http.get('/sessions/my-sessions?status=upcoming')).data.data as Session[],
  });
  if (!user) return null;
  const next = sessions.data?.[0];

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-muted">{greeting(user.timezone)}</p>
        <h1 className="font-serif text-4xl">{firstName(user.name)}</h1>
      </div>
      {sessions.isLoading ? <Spinner /> : null}
      {next ? (
        <article className="card p-6">
          <p className="text-xs uppercase tracking-wide text-muted">Next session</p>
          <h2 className="mt-2 font-serif text-3xl">{user.role === 'MEMBER' ? next.professional.name : next.member.name}</h2>
          <p className="mt-2 text-sm text-muted">
            {formatDate(next.startAt, user.timezone)} · {formatTime(next.startAt, user.timezone)} · {next.durationMinutes} minutes
          </p>
          <Link className="btn-primary mt-5" to={`/sessions/${next.id}`}>View session</Link>
        </article>
      ) : (
        <Empty
          title={user.role === 'MEMBER' ? 'No upcoming sessions' : 'Your schedule is clear'}
          body={user.role === 'MEMBER' ? 'Browse professionals and book a 50-minute session.' : 'Members will appear here when they book your open hours.'}
        />
      )}
      <div className="flex flex-wrap gap-3">
        {user.role === 'MEMBER' ? <Link className="btn-secondary" to="/professionals">Browse professionals</Link> : <Link className="btn-secondary" to="/availability">Edit availability</Link>}
        <Link className="btn-secondary" to="/sessions">All sessions</Link>
      </div>
    </div>
  );
}
