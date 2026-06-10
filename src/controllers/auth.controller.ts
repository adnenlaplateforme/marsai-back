import type { Request, RequestHandler } from 'express';
import authService from '../services/auth.service.js';
import jwtService from '../services/jwt.service.js';
import jwt from 'jsonwebtoken';
import {
  setTokensInCookies,
  unsetTokensInCookies,
} from '../helpers/cookies.js';
import AppError from '../helpers/AppError.js';
import userModel from '../models/user.model.js';

const login: RequestHandler = async (req, res, next) => {
  try {
    const response = await authService.login(req.body);
    if (!response)
      return res.status(401).send({ message: 'Invalid credentials' });

    setTokensInCookies(res, response.accessToken, response.refreshToken);

    return res.send(response.user);
  } catch (e) {
    next(e);
  }
};

const logout: RequestHandler = async (_req, res, next) => {
  try {
    unsetTokensInCookies(res);
    return res.send({ message: 'Successfully logged out' });
  } catch (e) {
    next(e);
  }
};

const refreshToken: RequestHandler = (req: Request, res, next) => {
  try {
    const refreshTokenCookie = req.cookies.refreshToken as string | undefined;

    if (!refreshTokenCookie) throw new AppError(400, 'Empty refresh token');

    const payload = jwtService.verify(refreshTokenCookie);
    const tokens = jwtService.signPair(payload);
    setTokensInCookies(res, tokens.accessToken, tokens.refreshToken);

    return res.send(tokens);
  } catch (e) {
    if (e instanceof jwt.TokenExpiredError) {
      unsetTokensInCookies(res);
      return res.status(400).send({ message: 'Refresh token expired' });
    }
    next(e);
  }
};

const getMe: RequestHandler = async (req: Request, res, next) => {
  try {
    const me = await userModel.findById(req.user_id);
    if (!me) throw new AppError(404, 'User not found');
    return res.send(me);
  } catch (e) {
    next(e);
  }
};

const authController = { login, refreshToken, getMe, logout };

export default authController;
