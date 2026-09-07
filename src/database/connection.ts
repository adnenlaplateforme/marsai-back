import mysql from 'mysql2/promise';

const db = await mysql.createConnection({
  // Hors conteneur, MySQL est joint sur localhost via le port publié par
  // docker compose (MYSQL_PORT=3308). Dans le réseau Docker, l'app parle
  // directement au service `marsai-db` sur le port interne 3306 : les deux
  // valeurs viennent donc de l'environnement, avec le cas local par défaut.
  host: process.env.MYSQL_HOST ?? 'localhost',
  port: Number(process.env.MYSQL_PORT) || 3306,
  database: process.env.MYSQL_DATABASE,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  namedPlaceholders: true,
  timezone: 'Z',
});

export default db;
