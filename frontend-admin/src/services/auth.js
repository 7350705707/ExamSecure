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

export async function changePassword(currentPassword, newPassword) {
  return request('PUT', '/api/auth/change-password', {
    current_password: currentPassword,
    new_password: newPassword,
  });
}

export async function changeUsername(currentPassword, newUsername) {
  return request('PUT', '/api/auth/change-username', {
    current_password: currentPassword,
    new_username: newUsername,
  });
}
