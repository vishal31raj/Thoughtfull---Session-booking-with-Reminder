import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { errorMessage, http } from '../api/client';
import type { AvailabilityWindow } from '../api/types';
import { Alert, Spinner } from '../components/ui';
import { DAY_NAMES } from '../lib/time';

function blankWeek(): AvailabilityWindow[] {
  return DAY_NAMES.map((_, index) => ({
    dayOfWeek: index + 1,
    startTime: '09:00',
    endTime: '17:00',
    enabled: index < 5,
  }));
}

export function AvailabilityPage() {
  const queryClient = useQueryClient();
  const current = useQuery({
    queryKey: ['availability'],
    queryFn: async () => (await http.get('/availability/me')).data.data as AvailabilityWindow[],
  });
  const [windows, setWindows] = useState<AvailabilityWindow[]>(blankWeek);
  useEffect(() => {
    if (!current.data) return;
    const next = blankWeek();
    for (const window of current.data) {
      const index = next.findIndex((item) => item.dayOfWeek === window.dayOfWeek);
      if (index >= 0) next[index] = { ...next[index], ...window };
    }
    setWindows(next);
  }, [current.data]);
  const save = useMutation({
    mutationFn: async () => http.put('/availability/me', { windows }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['availability'] }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-4xl">Weekly availability</h1>
        <p className="mt-1 text-sm text-muted">These hours are in your timezone. Members see the resulting 50-minute slots in theirs.</p>
      </div>
      {current.isLoading ? <Spinner /> : null}
      {save.isError ? <Alert>{errorMessage(save.error)}</Alert> : null}
      {save.isSuccess ? <Alert tone="success">Availability saved.</Alert> : null}
      <div className="card divide-y divide-line">
        {windows.map((window, index) => (
          <div key={window.dayOfWeek} className="grid items-center gap-3 px-4 py-4 sm:grid-cols-[140px_1fr_1fr_auto]">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={window.enabled}
                onChange={(event) => setWindows((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, enabled: event.target.checked } : row))}
              />
              {DAY_NAMES[index]}
            </label>
            <label className="text-sm">Start<input className="field mt-1" type="time" value={window.startTime} disabled={!window.enabled} onChange={(event) => setWindows((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, startTime: event.target.value } : row))} /></label>
            <label className="text-sm">End<input className="field mt-1" type="time" value={window.endTime} disabled={!window.enabled} onChange={(event) => setWindows((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, endTime: event.target.value } : row))} /></label>
            <span className="text-xs text-muted">{window.enabled ? 'Open' : 'Unavailable'}</span>
          </div>
        ))}
      </div>
      <button type="button" className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>Save availability</button>
    </div>
  );
}
