import type { RowDataPacket } from 'mysql2';
export interface CountRow extends RowDataPacket {
  count: number;
}
/** Une réservation vue de l'administration : le participant, pas seulement l'id. */
export interface EventBooking extends RowDataPacket {
  id: number;
  participant_id: number;
  created_at: Date;
  firstname: string | null;
  lastname: string | null;
  email: string;
}

export interface BookingTotalsRow extends RowDataPacket {
  total: number;
  today: number | string;
}

export default interface Booking extends RowDataPacket {
  id: number;
  participant_id: number;
  event_id: number;
  created_at: Date;
  cancelled_at: Date | null;
}
