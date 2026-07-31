import db from '../database/connection.js';
import AppError from '../helpers/AppError.js';
import juryInviteModel from '../models/jury-invite.model.js';
import juryModel from '../models/jury.model.js';
import type JuryProgress from '../types/interfaces/jury-progress.interface.js';
import type Jury from '../types/interfaces/jury.interface.js';
import type { CreateJury } from '../types/schemas/create-jury.schema.js';
import bcrypt from 'bcrypt';

const findAll = async (): Promise<Jury[]> => {
  return await juryModel.findAll();
};

const findProgress = async (): Promise<JuryProgress[]> => {
  return await juryModel.findProgress();
};

const create = async (body: CreateJury): Promise<void> => {
  const invite = await juryInviteModel.findByToken(body.token);

  if (!invite) {
    throw new AppError(404, 'Invitation not found');
  }

  try {
    await db.beginTransaction();
    const hashedPass = await bcrypt.hash(body.password, 10);
    const newJury = {
      email: invite.email,
      firstname: body.firstname,
      lastname: body.lastname,
      password: hashedPass,
    };
    await juryModel.create(newJury);
    await juryInviteModel.deleteByEmail(newJury.email);
    await db.commit();
  } catch (e) {
    await db.rollback();
    throw e;
  }
};

const juryService = { findAll, findProgress, create };

export default juryService;
