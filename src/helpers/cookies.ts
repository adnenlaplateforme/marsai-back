import type { Response } from 'express';

export const setTokensInCookies = (
  res: Response,
  accessToken: string,
  refreshToken: string,
): void => {
  res.cookie('accessToken', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  });

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/auth/refresh-token',
  });
};

export const unsetTokensInCookies = (res: Response): void => {
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');
};
