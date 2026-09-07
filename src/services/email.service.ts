import nodemailer from 'nodemailer';
import type Subscriber from '../types/interfaces/subsciber.interface.js';
import type Newsletter from '../types/interfaces/newsletter.interface.js';
import newsletterModel from '../models/newsletter.model.js';
import cron from 'node-cron';
import subscriberModel from '../models/subscriber.model.js';
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import type { MovieWithDirector } from '../types/interfaces/Movie.interface.js';

let transporter: nodemailer.Transporter<
  SMTPTransport.SentMessageInfo,
  SMTPTransport.Options
>;
if (process.env.NODE_ENV === 'development') {
  try {
    const testAccount = await nodemailer.createTestAccount();
    console.info(testAccount);
    transporter = nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
  } catch (e) {
    console.error('failed to create test account mail', e);
  }
} else {
  transporter = nodemailer.createTransport({
    host: process.env.MAILER_HOST,
    port: Number(process.env.MAILER_PORT) || 587,
    secure: process.env.MAILER_PORT === '465',
    auth: {
      user: process.env.MAILER_EMAIL,
      pass: process.env.MAILER_PASS,
    },
    debug: false,
    logger: process.env.NODE_ENV !== 'test',
  });

  // En test, on n'ouvre aucune connexion SMTP : ce module est importé
  // transitivement par `app`, et le verify() échouerait sur chaque fichier
  // de test après plusieurs secondes de timeout réseau.
  if (process.env.NODE_ENV !== 'test') {
    try {
      await transporter.verify();
      console.info('Maileroo SMTP connected successfully');
    } catch (e) {
      console.error('Maileroo connection failed:', e);
    }
  }
}

const loadHtmlFile = async (name: string): Promise<string> => {
  const filename = fileURLToPath(import.meta.url);
  const dirname = path.dirname(filename);
  const templatePath = path.join(dirname, '../templates/' + name + '.html');
  return await fs.readFile(templatePath, 'utf-8');
};

const sendMail = async (
  newsletter: Newsletter,
  subscribers: Subscriber[],
): Promise<void> => {
  const htmlTemplate = await loadHtmlFile('newsletter');
  const sendPromises = subscribers.map((sub) => {
    const personalizedHtml = htmlTemplate
      .replace('{{CONTENT}}', newsletter.content)
      .replace(
        '{{UNSUBSCRIBE_URL}}',
        `${process.env.FRONT_IP}/unsubscribe/${sub.unsub_token}`,
      );
    return transporter.sendMail({
      from: `MarsAi <${process.env.MAILER_EMAIL}>`,
      to: sub.email,
      subject: newsletter.object,
      html: personalizedHtml,
    });
  });

  const result = await Promise.allSettled(sendPromises);
  console.info('Email sent: ' + result.length);
  await newsletterModel.setIsSent(newsletter.id);
};

let isRunning = false;
const mailerJob = (): void => {
  cron.schedule('*/1 * * * *', async () => {
    if (isRunning) return;
    console.info('Running mailer job on ' + new Date().toUTCString());
    isRunning = true;
    try {
      const newsletters = await newsletterModel.findAllToSend();
      if (newsletters.length > 0) {
        const subscribers = await subscriberModel.findAll();
        for (const newsletter of newsletters) {
          await sendMail(newsletter, subscribers);
        }
      }
    } catch (e) {
      console.error('Error in mailer job:', e);
    } finally {
      isRunning = false;
    }
  });
};

const sendMailSubscribeEvent = async (
  participantEmail: string,
  eventTitle: string,
  eventDescription: string,
  token: string,
): Promise<void> => {
  await transporter.sendMail({
    from: `MarsAi <${process.env.MAILER_EMAIL}>`,
    to: participantEmail,
    subject: `Subscription Confirmation for Event: ${eventTitle}`,
    html: `
      <h1>Event Subscription Confirmation</h1>
      <p>Dear participant,</p>
      <p>Thank you for subscribing to our event: <strong>${eventTitle}</strong>.</p>
      <p>Here are the details of the event:</p>
      <p>${eventDescription}</p>
      <p>We look forward to seeing you there!</p>
      <p>If you want to unsubscribe, please <a href="${process.env.FRONT_IP}/bookings/unsubscribe/${token}">click here</a>.</p>
      <img src="https://imgs.search.brave.com/6HTmkrs86xIbHszERypQBVSqhAIY9u7Z4AQSoL1C1I0/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly9tZWRp/YS5pc3RvY2twaG90/by5jb20vaWQvMTg3/MTMyOTczNS9waG90/by9jYXRzLW5vc2Uu/anBnP3M9NjExNjEy/Jnc9maz0yMCZjPVVHWGgtS21yTm9Z/Tl9va05zM2tlWmFm/M1VHMUZ1akRmMVFN/djlvNDRmbTQ9" alt="Mars Logo" />
    `,
  });
  console.info(
    `Subscription confirmation email sent to ${participantEmail} for event ${eventTitle}`,
  );
};

const sendJuryInvites = async (invites: { email: string; token: string }[]) => {
  const htmlTemplate = await loadHtmlFile('jury-invite');
  const sendPromises = invites.map((invite) => {
    const personalizedHtml = htmlTemplate.replace(
      '{{INVITE_URL}}',
      `${process.env.FRONT_IP}/invite/${invite.token}`,
    );
    return transporter.sendMail({
      from: `MarsAi <${process.env.MAILER_EMAIL}>`,
      to: invite.email,
      subject: 'MairsAi jury invitation',
      html: personalizedHtml,
    });
  });

  const result = await Promise.allSettled(sendPromises);
  console.info('Email sent: ' + result.length);
};

const statusUpdatePendingMail = async (
  adminData: { adminText: string; adminStatus: string },
  movie: MovieWithDirector,
  token: string,
): Promise<void> => {
  const htmlTemplate = await loadHtmlFile('movie-update-pending');
  const personalizedHtml = htmlTemplate
    .replace('{{DIRECTOR_FIRSTNAME}}', movie.director.firstname)
    .replace('{{DIRECTOR_LASTNAME}}', movie.director.lastname)
    .replace('{{MOVIE_ENGLISH_TITLE}}', movie.english_title)
    .replace('{{ADMIN_MESSAGE}}', adminData.adminText)
    .replace('{{FORM_EDIT_URL}}', `${process.env.FRONT_IP}/submit/${token}`);
  const result = await transporter.sendMail({
    from: `MarsAi <${process.env.MAILER_EMAIL}>`,
    to: movie.director.email,
    subject: `Status update on your movie submission: ${movie.english_title}`,
    html: personalizedHtml,
  });
  console.info(`sent email to ${movie.director.email} about movie ${movie.id}`);
  console.info(`preview URL: ${nodemailer.getTestMessageUrl(result)}`);
};
const statusUpdateMail = async (
  adminData: { adminText: string; adminStatus: string },
  movie: MovieWithDirector,
): Promise<void> => {
  const htmlTemplate = await loadHtmlFile(
    `movie-update-${adminData.adminStatus}`,
  );
  const personalizedHtml = htmlTemplate
    .replace('{{DIRECTOR_FIRSTNAME}}', movie.director.firstname)
    .replace('{{DIRECTOR_LASTNAME}}', movie.director.lastname)
    .replace('{{MOVIE_ENGLISH_TITLE}}', movie.english_title)
    .replace('{{ADMIN_MESSAGE}}', adminData.adminText);
  await transporter.sendMail({
    from: `MarsAi <${process.env.MAILER_EMAIL}>`,
    to: movie.director.email,
    subject: `Status update on your movie submission: ${movie.english_title}`,
    html: personalizedHtml,
  });
  console.info(`sent email to ${movie.director.email} about movie ${movie.id}`);
};

/**
 * Prévient l'admin qu'un réalisateur a répondu à une demande de modification.
 *
 * Seul e-mail de ce fichier qui ne part pas vers un réalisateur : le retour de
 * correction n'a aucune autre trace côté admin, `movieUpdateModel.deleteByToken`
 * effaçant la demande une fois honorée.
 */
const movieResubmittedMail = async (
  movie: MovieWithDirector,
): Promise<void> => {
  const htmlTemplate = await loadHtmlFile('movie-resubmitted');
  const personalizedHtml = htmlTemplate
    .replace('{{DIRECTOR_FIRSTNAME}}', movie.director.firstname)
    .replace('{{DIRECTOR_LASTNAME}}', movie.director.lastname)
    .replace('{{MOVIE_ENGLISH_TITLE}}', movie.english_title)
    .replace(
      '{{ADMIN_MOVIE_URL}}',
      `${process.env.FRONT_IP}/admin/movies/${movie.id}-${movie.slug}`,
    );
  await transporter.sendMail({
    from: `MarsAi <${process.env.MAILER_EMAIL}>`,
    to: process.env.ADMIN_EMAIL,
    subject: `Updated movie submission to review: ${movie.english_title}`,
    html: personalizedHtml,
  });
  console.info(
    `sent email to ${process.env.ADMIN_EMAIL} about movie ${movie.id}`,
  );
};

const emailService = {
  sendMail,
  mailerJob,
  sendMailSubscribeEvent,
  statusUpdateMail,
  sendJuryInvites,
  statusUpdatePendingMail,
  movieResubmittedMail,
};

export default emailService;
