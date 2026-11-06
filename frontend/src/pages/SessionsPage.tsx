import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { http } from '../api/client';
import type { Session } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { Empty, Spinner } from '../components/ui';
import { formatDate, formatTime } from '../lib/time';

const views = ['upcoming', 'past', 'cancelled'] as const;

export function SessionsPage() {
  const { user } = useAuth();
  const [view, setView] = useState<(typeof views)[number]>('upcoming');
  const sessions = useQuery({
    queryKey: ['sessions', view],
    queryFn: async () => (await http.get('/sessions/my-sessions', { params: { status: view } })).data.data as Session[],
  });
  if (!user) return null;

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-4xl">{user.role === 'MEMBER' ? 'My sessions' : 'Schedule'}</h1>
      <div className="flex gap-2" role="tablist">
        {views.map((item) => (
          <button key={item} type="button" role="tab" aria-selected={view === item} className={view === item ? 'btn-primary' : 'btn-secondary'} onClick={() => setView(item)}>
            {item}
          </button>
        ))}
      </div>
      {sessions.isLoading ? <Spinner /> : null}
      {sessions.data?.length === 0 ? <Empty title="Nothing here yet" body="Sessions you book or host will show up in the matching tab." /> : null}
      <ul className="space-y-3">
        {sessions.data?.map((session) => (
          <li key={session.id} className="card flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center">
            <div>
              <p className="font-medium">{user.role === 'MEMBER' ? session.professional.name : session.member.name}</p>
              <p className="text-sm text-muted">{formatDate(session.startAt, user.timezone)} · {formatTime(session.startAt, user.timezone)} · {session.durationMinutes} minutes</p>
            </div>
            <Link className="btn-secondary" to={`/sessions/${session.id}`}>Details</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
