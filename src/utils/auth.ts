const AccessTokenKey = 'SAAS_ACCESS_TOKEN';

export const setToken = (token: string) => {
  localStorage.setItem(AccessTokenKey, token);
  localStorage.setItem('token', token);
};
export const getToken = () => {
  return localStorage.getItem(AccessTokenKey);
};
export const removeToken = () => {
  localStorage.removeItem(AccessTokenKey);
};
