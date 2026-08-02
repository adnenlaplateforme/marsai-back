import express from 'express';
import authRouter from './routes/auth.routes.js';
import movieRouter from './routes/movie.routes.js';
import { errorHandler } from './middlewares/error-handler.js';
import cors from 'cors';
import eventRouter from './routes/event.route.js';
import newsletterRouter from './routes/newsletter.routes.js';
import subscriberRouter from './routes/subscriber.route.js';
import cookieParser from 'cookie-parser';
import bookingRouter from './routes/booking.routes.js';
import juryRouter from './routes/jury.routes.js';
import juryAssignmentRouter from './routes/jury-assignment.routes.js';
import juryInviteRouter from './routes/jury-invite.route.js';
import movieUpdateRouter from './routes/movie-update.routes.js';

const app = express();

app.use(cookieParser());
app.use(express.json());

app.use(
  cors({
    origin: process.env.FRONT_IP,
    credentials: true,
  }),
);

app.use('/auth', authRouter);
app.use('/movies', movieRouter);
app.use('/events', eventRouter);
app.use('/newsletters', newsletterRouter);
app.use('/subscribers', subscriberRouter);
app.use('/bookings', bookingRouter);
app.use('/juries', juryRouter);
app.use('/jury-assignments', juryAssignmentRouter);
app.use('/jury-invites', juryInviteRouter);
app.use('/movie-update', movieUpdateRouter);

app.use('/uploads', express.static('uploads'));
app.use(errorHandler);

export default app;
