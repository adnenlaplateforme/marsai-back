import type { RowDataPacket } from 'mysql2';

/**
 * L'avancement d'un juré dans son lot.
 *
 * `jury_assignment` est une file d'attente : noter un film l'en retire. Le
 * nombre de films confiés ne s'y lit donc pas directement, il additionne ce qui
 * reste à voir et ce qui est déjà noté. `rated <= assigned` par construction.
 */
export default interface JuryAssignmentProgress extends RowDataPacket {
  user_id: number;
  assigned: number;
  rated: number;
}
