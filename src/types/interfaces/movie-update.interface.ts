import type { RowDataPacket } from 'mysql2';

export default interface MovieUpdate extends RowDataPacket {
  movie_id: number;
  token: string;
}
