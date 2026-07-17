import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import db from '../database/connection.js';
import authService from '../services/auth.service.js';
import jwtService from '../services/jwt.service.js';
import { Role } from '../types/enums/role.enum.js';

interface RoleRow extends RowDataPacket {
  id: number;
}

export interface TestUser {
  id: number;
  email: string;
  password: string;
  roles: Role[];
}

/**
 * Crée un utilisateur en base de test avec ses rôles, mot de passe hashé.
 *
 * Le mot de passe en clair est renvoyé pour permettre aux tests de login de
 * l'utiliser tel quel, sans le redéclarer de leur côté.
 */
export const createUser = async ({
  email = 'user@test.com',
  password = 'password123',
  roles = [Role.Admin],
}: Partial<
  Pick<TestUser, 'email' | 'password' | 'roles'>
> = {}): Promise<TestUser> => {
  const hashed = await authService.hashPassword(password);

  const [result] = await db.execute<ResultSetHeader>(
    'INSERT INTO `user` (`email`, `password`) VALUES (?, ?)',
    [email, hashed],
  );
  const userId = result.insertId;

  for (const role of roles) {
    const [rows] = await db.execute<RoleRow[]>(
      'SELECT `id` FROM `role` WHERE `name` = ? LIMIT 1',
      [role],
    );
    const roleId = rows[0]?.id;
    if (!roleId) throw new Error(`Rôle introuvable en base de test : ${role}`);

    await db.execute(
      'INSERT INTO `role_user` (`user_id`, `role_id`) VALUES (?, ?)',
      [userId, roleId],
    );
  }

  return { id: userId, email, password, roles };
};

/**
 * Forge un cookie accessToken valide pour un utilisateur, afin de tester les
 * routes protégées sans passer par un vrai /auth/login à chaque test.
 */
export const authCookie = (user: Pick<TestUser, 'id' | 'roles'>): string => {
  const token = jwtService.signAccessToken({
    id: user.id,
    roles: user.roles,
  } as never);
  return `accessToken=${token}`;
};
