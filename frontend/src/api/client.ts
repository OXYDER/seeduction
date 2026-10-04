import axios from 'axios';
import { useAuthStore } from '../store/auth';
import { useLockdownStore } from '../store/lockdown';

export const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    // Alerte générale : le serveur refuse tout (503 « lockdown ») ; l'application passe sur l'écran de déblocage.
    if (err.response?.status === 503 && err.response?.data?.lockdown) useLockdownStore.getState().setLocked(true);
    else if (err.response?.status === 401) useAuthStore.getState().logout();
    return Promise.reject(err);
  },
);
