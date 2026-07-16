import type { RowDataPacket } from 'mysql2/promise';
import db from '../database/connection.js';

interface TableNameRow extends RowDataPacket {
  name: string;
}

/**
 * Vide toutes les tables de la base de test entre deux tests d'intégration,
 * afin de repartir d'un état propre sans dupliquer la logique dans chaque fichier.
 *
 * Garde de sécurité : refuse de s'exécuter si NODE_ENV !== 'test', pour ne
 * jamais vider par erreur la base de développement ou de production.
 *
 * Les tables de référence (par défaut `role`) sont préservées car elles
 * contiennent des données fixes dont dépendent les autres tables.
 *
 * @param keepTables tables de référence à ne pas vider (défaut : `['role']`).
 */
export const resetDatabase = async (
  keepTables: string[] = ['role'],
): Promise<void> => {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error(
      "resetDatabase est bloqué : NODE_ENV doit valoir 'test' (base de test uniquement).",
    );
  }

  const [rows] = await db.query<TableNameRow[]>(
    'SELECT table_name AS name FROM information_schema.tables WHERE table_schema = ?',
    [process.env.MYSQL_DATABASE],
  );

  await db.query('SET FOREIGN_KEY_CHECKS = 0');
  try {
    for (const { name } of rows) {
      if (keepTables.includes(name)) continue;
      await db.query(`TRUNCATE TABLE \`${name}\``);
    }
  } finally {
    await db.query('SET FOREIGN_KEY_CHECKS = 1');
  }
};
