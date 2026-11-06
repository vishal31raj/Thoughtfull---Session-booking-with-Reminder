import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { http } from '../api/client';
import type { Professional } from '../api/types';
import { Empty, Spinner, initials } from '../components/ui';
import { DAY_NAMES } from '../lib/time';

export function ProfessionalsPage() {
  const [q, setQ] = useState('');
  const professionals = useQuery({
    queryKey: ['professionals', q],
    queryFn: async () => (await http.get('/professionals', { params: { q: q || undefined } })).data.data as Professional[],
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-serif text-4xl">Professionals</h1>
          <p className="mt-1 text-sm text-muted">Choose someone whose hours fit your week.</p>
        </div>
        <label className="block w-full sm:w-72">
          <span className="sr-only">Search professionals</span>
          <input className="field" placeholder="Search by name" value={q} onChange={(event) => setQ(event.target.value)} />
        </label>
      </div>
      {professionals.isLoading ? <Spinner /> : null}
      {professionals.data?.length === 0 ? <Empty title="No professionals found" body="Try a different name." /> : null}
      <div className="grid gap-4 md:grid-cols-2">
        {professionals.data?.map((professional) => {
          const days = DAY_NAMES.filter((_, index) => professional.availability.some((window) => window.enabled && window.dayOfWeek === index + 1));
          return (
            <article key={professional.id} className="card p-5" data-testid="professional-card">
              <div className="flex gap-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-mist font-medium text-mossdeep">{initials(professional.name)}</div>
                <div>
                  <h2 className="font-serif text-2xl">{professional.name}</h2>
                  <p className="text-sm text-muted">{professional.title}</p>
                </div>
              </div>
              <p className="mt-4 line-clamp-3 text-sm text-ink/80">{professional.bio}</p>
              <p className="mt-3 text-sm text-muted">{days.length ? days.join(', ') : 'Hours not published yet'}</p>
              <Link className="btn-secondary mt-4" to={`/professionals/${professional.id}`}>View profile</Link>
            </article>
          );
        })}
      </div>
    </div>
  );
}
