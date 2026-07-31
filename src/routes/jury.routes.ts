import { Router } from 'express';
import juryController from '../controllers/jury.controller.js';
import { isAdmin } from '../middlewares/is-admin.js';
import { isLogged } from '../middlewares/is-logged.js';
import { validate } from '../middlewares/validate.js';
import { CreateJurySchema } from '../types/schemas/create-jury.schema.js';

const juryRouter = Router();

juryRouter.get('/', isLogged, isAdmin, juryController.findAll);
// L'avancement de chaque juré, pour le tableau de bord admin. Même sensibilité
// que `GET /` juste au-dessus : la réponse nomme les jurés et porte leurs
// e-mails. Route séparée plutôt qu'un enrichissement de `GET /` — cette
// dernière sert aussi la page publique du jury.
juryRouter.get('/progress', isLogged, isAdmin, juryController.findProgress);
juryRouter.post('/', validate(CreateJurySchema), juryController.create);

export default juryRouter;
