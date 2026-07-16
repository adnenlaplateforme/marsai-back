import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { readFile } from 'node:fs/promises';

/**
 * globalSetup vitest : s'exécute UNE fois avant toute la suite de tests.
 *
 * Crée la base de test si elle n'existe pas et y charge le schéma
 * (`database/marsai.sql`) au premier lancement — rend la base reproductible
 * sans étape manuelle (nouvelle machine, CI, après `docker compose down -v`).
 *
 * La réinitialisation des DONNÉES entre les tests se fait ailleurs, via
 * `resetDatabase()`.
 */
export default async function setup(): Promise<void> {
  dotenv.config({ path: '.env.test', override: true });

  // Garde de sécurité : ne jamais opérer hors environnement de test.
  if (process.env.NODE_ENV !== 'test') {
    throw new Error(
      "globalSetup bloqué : NODE_ENV doit valoir 'test' (base de test uniquement).",
    );
  }

  const database = process.env.MYSQL_DATABASE ?? 'marsai_test';

  // Connexion SANS base sélectionnée, avec multi-statements pour charger le schéma.
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST ?? 'localhost',
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    multipleStatements: true,
  });

  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\``);
    await connection.changeUser({ database });

    // Charge le schéma uniquement si la base est vide (idempotent).
    const [rows] = await connection.query(
      'SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = ?',
      [database],
    );
    const tableCount = (rows as { count: number }[])[0]?.count ?? 0;

    if (tableCount === 0) {
      const schema = await readFile('database/marsai.sql', 'utf-8');
      await connection.query(schema);
      console.info(`[globalSetup] schéma chargé dans la base "${database}"`);
    }
  } finally {
    await connection.end();
  }
}
