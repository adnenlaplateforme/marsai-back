import app from './app.js';
import emailService from './services/email.service.js';

const IP = process.env.IP;
const PORT = process.env.PORT;

emailService.mailerJob();

app.listen(PORT, () => {
  console.info(`Server is running on ${IP}:${PORT}`);
});
