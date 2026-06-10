import type { Request, Response, NextFunction } from 'express';
import { ZodError, ZodType } from 'zod';

export const validateParamsAndQuery =
  (validator: ZodType) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await validator.parseAsync({
        query: req.query,
        params: req.params,
      });
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res
          .status(400)
          .send({ msg: error.issues[0]?.message ?? 'Error message missing' });
      }
      return res.status(500).send('Error making request, contact support');
    }
  };
