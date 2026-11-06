import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { http, initCsrf } from '../api/client';
import type { User } from '../api/types';
import axios from 'axios';

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchMe(): Promise<User | null> {
  try {
    const response = await http.get('/auth/me');
    return response.data.data as User;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) return null;
    throw error;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initCsrf()
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, []);

  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe, enabled: ready, retry: false });

  async function logout() {
    await http.post('/auth/logout');
    queryClient.setQueryData(['me'], null);
    queryClient.clear();
  }

  return (
    <AuthContext.Provider
      value={{
        user: me.data ?? null,
        loading: !ready || me.isLoading,
        setUser: (user) => queryClient.setQueryData(['me'], user),
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}
