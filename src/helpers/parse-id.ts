import AppError from './AppError.js';

/**
 * Convertit un paramètre de route en identifiant exploitable, ou rejette.
 *
 * En Express 5, `req.params.id` est typé `string | string[] | undefined`, et
 * `Number('abc')` vaut `NaN`. Ce `NaN` transmis à `db.query` est interpolé tel
 * quel dans le SQL : MySQL répond `ER_BAD_FIELD_ERROR` et l'API renvoie 500 là
 * où l'URL était simplement malformée. Les requêtes préparées de `db.execute`
 * ne plantent pas, d'où des routes voisines qui répondaient 404 pour la même
 * entrée — une incohérence qui tenait au pilote, pas à une intention.
 *
 * `Number` plutôt que `parseInt`, qui tronque : `parseInt('1abc')` vaut 1 et
 * servait le film 1 pour `/movies/1abc`.
 *
 * `resource` nomme la ressource dans le message, pour que l'appelant sache
 * lequel de ses identifiants est en cause.
 */
export const parseId = (value: unknown, resource: string): number => {
  const invalid = new AppError(400, `Invalid ${resource} id`);
  if (typeof value !== 'string') throw invalid;

  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw invalid;

  return id;
};
