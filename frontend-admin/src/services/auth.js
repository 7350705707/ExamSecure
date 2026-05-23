import { request, setToken, setStoredUser } from './base.js';

export async function login(username, password) {
  const data = await request('POST', '/api/auth/login', { username, password });
  setToken(data.access_token);
  setStoredUser(data.user);
  return data.user;
}

export async function getMe() {
  return request('GET', '/api/auth/me');
}
