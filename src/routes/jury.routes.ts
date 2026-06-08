import { Router } from 'express';
import juryController from '../controllers/jury.controller.js';
import { validate } from '../middlewares/validate.js';
import { CreateJurySchema } from '../types/schemas/create-jury.schema.js';

const juryRouter = Router();

juryRouter.get('/', juryController.findAll);
juryRouter.post('/', validate(CreateJurySchema), juryController.create);

export default juryRouter;
