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

/**
 * Retire un juré du festival.
 *
 * Le 404 sur zéro ligne couvre deux cas que l'admin n'a pas à distinguer : l'id
 * n'existe pas, ou il désigne quelqu'un qui n'est pas juré. Sans lui, une erreur
 * de frappe renverrait un succès et laisserait croire que le juré est parti.
 *
 * Pas de transaction : c'est une seule requête, et les cascades du schéma sont
 * atomiques avec elle.
 */
const remove = async (juryId: number): Promise<void> => {
  const removed = await juryModel.remove(juryId);

  if (removed === 0) {
    throw new AppError(404, 'Jury not found');
  }
};

const juryService = { findAll, findProgress, create, remove };

export default juryService;
