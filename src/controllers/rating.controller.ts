import type { RequestHandler } from 'express';
import ratingService from '../services/rating.service.js';

const rateMovie: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user_id;
    await ratingService.rateMovieById(Number(id), userId, req.body);
    return res.status(201).json({ message: 'Rating submitted successfully' });
  } catch (e) {
    next(e);
  }
};

const getRatings: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params;
    const ratings = await ratingService.getRatingsByMovieId(Number(id));
    return res.status(200).json(ratings);
  } catch (e) {
    next(e);
  }
};

const getMyRating: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params;
    const rating = await ratingService.getCurrentJuryRatingByMovieId(
      Number(id),
      req.user_id,
    );
    return res.status(200).json(rating);
  } catch (e) {
    next(e);
  }
};

const ratingController = {
  rateMovie,
  getRatings,
  getMyRating,
};

export default ratingController;
