import type { ReactNode } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { errorMessage, http } from '../api/client';
import type { User } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { Alert } from '../components/ui';
import { TIMEZONES } from '../lib/time';

const schema = z.object({
  email: z.string().email('Enter a valid email.'),
  password: z.string().min(1, 'Enter your password.'),
});

export function LoginPage() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  const login = useMutation({
    mutationFn: async (values: z.infer<typeof schema>) => (await http.post('/auth/login', values)).data.data.user as User,
    onSuccess: (user) => {
      setUser(user);
      navigate('/dashboard');
    },
  });

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to manage your sessions.">
      <form className="space-y-4" onSubmit={form.handleSubmit((values) => login.mutate(values))} noValidate>
        {login.isError ? <Alert>{errorMessage(login.error)}</Alert> : null}
        <label className="block">
          <span className="label">Email</span>
          <input className="field" type="email" autoComplete="email" {...form.register('email')} />
        </label>
        <label className="block">
          <span className="label">Password</span>
          <input className="field" type="password" autoComplete="current-password" {...form.register('password')} />
        </label>
        <button className="btn-primary w-full" type="submit" disabled={login.isPending}>
          Sign in
        </button>
      </form>
      <p className="mt-4 text-sm text-muted">
        New here? <Link className="text-moss underline" to="/register">Create an account</Link>
      </p>
      <p className="mt-6 text-xs text-muted">Demo member: member@thoughtfull.test · Demo professional: sarah.chen@thoughtfull.test · Password: Thoughtfull123!</p>
    </AuthShell>
  );
}

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8, 'Use at least 8 characters.'),
  role: z.enum(['MEMBER', 'PROFESSIONAL']),
  timezone: z.string().min(1),
  title: z.string().optional(),
  bio: z.string().optional(),
  focusAreas: z.string().optional(),
});

export function RegisterPage() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { role: 'MEMBER', timezone: 'Asia/Kolkata' },
  });
  const role = form.watch('role');
  const registerUser = useMutation({
    mutationFn: async (values: z.infer<typeof registerSchema>) =>
      (await http.post('/auth/register', values)).data.data.user as User,
    onSuccess: (user) => {
      setUser(user);
      navigate('/dashboard');
    },
  });

  return (
    <AuthShell title="Create your account" subtitle="Members book sessions. Professionals publish weekly hours.">
      <form className="space-y-4" onSubmit={form.handleSubmit((values) => registerUser.mutate(values))} noValidate>
        {registerUser.isError ? <Alert>{errorMessage(registerUser.error)}</Alert> : null}
        <fieldset className="grid grid-cols-2 gap-2">
          <legend className="label">I am joining as</legend>
          {(['MEMBER', 'PROFESSIONAL'] as const).map((value) => (
            <label key={value} className={`cursor-pointer rounded-xl border px-3 py-3 text-sm ${role === value ? 'border-moss bg-mist' : 'border-line bg-white'}`}>
              <input className="sr-only" type="radio" value={value} {...form.register('role')} />
              {value === 'MEMBER' ? 'Member' : 'Professional'}
            </label>
          ))}
        </fieldset>
        <label className="block"><span className="label">Full name</span><input className="field" {...form.register('name')} /></label>
        <label className="block"><span className="label">Email</span><input className="field" type="email" {...form.register('email')} /></label>
        <label className="block"><span className="label">Password</span><input className="field" type="password" {...form.register('password')} /></label>
        <label className="block">
          <span className="label">Timezone</span>
          <select className="field" {...form.register('timezone')}>
            {TIMEZONES.map((zone) => <option key={zone}>{zone}</option>)}
          </select>
        </label>
        {role === 'PROFESSIONAL' ? (
          <>
            <label className="block"><span className="label">Title</span><input className="field" {...form.register('title')} /></label>
            <label className="block"><span className="label">Focus areas</span><input className="field" {...form.register('focusAreas')} /></label>
            <label className="block"><span className="label">Bio</span><textarea className="field min-h-28" {...form.register('bio')} /></label>
          </>
        ) : null}
        <button className="btn-primary w-full" type="submit" disabled={registerUser.isPending}>Create account</button>
      </form>
      <p className="mt-4 text-sm text-muted">Already registered? <Link className="text-moss underline" to="/login">Sign in</Link></p>
    </AuthShell>
  );
}

function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-mossdeep px-12 py-12 text-white lg:flex">
        <p className="font-serif text-3xl">ThoughtFull</p>
        <div>
          <h1 className="max-w-md font-serif text-5xl leading-tight">A quieter way to book time with a professional.</h1>
          <p className="mt-4 max-w-md text-white/80">Fifty-minute sessions, clear weekly hours, and reminders that stay in the app.</p>
        </div>
        <p className="text-sm text-white/70">Fictional demo data only. Not a medical service.</p>
      </section>
      <section className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <h2 className="font-serif text-4xl">{title}</h2>
          <p className="mt-2 mb-6 text-sm text-muted">{subtitle}</p>
          {children}
        </div>
      </section>
    </div>
  );
}
