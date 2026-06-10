import { Router } from 'express';
import juryController from '../controllers/jury.controller.js';
import { isAdmin } from '../middlewares/is-admin.js';
import { isLogged } from '../middlewares/is-logged.js';
import { validate } from '../middlewares/validate.js';
import { CreateJurySchema } from '../types/schemas/create-jury.schema.js';

const juryRouter = Router();

juryRouter.get('/', isLogged, isAdmin, juryController.findAll);
juryRouter.post('/', validate(CreateJurySchema), juryController.create);

export default juryRouter;
