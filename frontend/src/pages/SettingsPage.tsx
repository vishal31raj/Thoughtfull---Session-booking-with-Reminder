import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { errorMessage, http } from '../api/client';
import type { User } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { Alert } from '../components/ui';
import { TIMEZONES } from '../lib/time';

const schema = z.object({
  name: z.string().min(2),
  timezone: z.string().min(1),
  title: z.string().nullable().optional(),
  bio: z.string().nullable().optional(),
  focusAreas: z.string().nullable().optional(),
});

export function SettingsPage() {
  const { user, setUser } = useAuth();
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    values: user
      ? { name: user.name, timezone: user.timezone, title: user.title, bio: user.bio, focusAreas: user.focusAreas }
      : undefined,
  });
  const save = useMutation({
    mutationFn: async (values: z.infer<typeof schema>) => (await http.patch('/auth/me', values)).data.data as User,
    onSuccess: (next) => setUser(next),
  });
  if (!user) return null;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="font-serif text-4xl">Profile</h1>
      <p className="text-sm text-muted">{user.email} · {user.role === 'MEMBER' ? 'Member' : 'Professional'}</p>
      <form className="card space-y-4 p-6" onSubmit={form.handleSubmit((values) => save.mutate(values))}>
        {save.isError ? <Alert>{errorMessage(save.error)}</Alert> : null}
        {save.isSuccess ? <Alert tone="success">Profile updated.</Alert> : null}
        <label className="block"><span className="label">Name</span><input className="field" {...form.register('name')} /></label>
        <label className="block">
          <span className="label">Timezone</span>
          <select className="field" {...form.register('timezone')}>
            {TIMEZONES.map((zone) => <option key={zone}>{zone}</option>)}
          </select>
        </label>
        {user.role === 'PROFESSIONAL' ? (
          <>
            <label className="block"><span className="label">Title</span><input className="field" {...form.register('title')} /></label>
            <label className="block"><span className="label">Focus areas</span><input className="field" {...form.register('focusAreas')} /></label>
            <label className="block"><span className="label">Bio</span><textarea className="field min-h-28" {...form.register('bio')} /></label>
          </>
        ) : null}
        <button className="btn-primary" type="submit" disabled={save.isPending}>Save profile</button>
      </form>
    </div>
  );
}
