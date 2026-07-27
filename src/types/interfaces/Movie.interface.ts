import type { RowDataPacket } from 'mysql2';
import type { Languages } from '../enums/languages.enum.js';
import type { Collaborator, Director } from '../schemas/MovieRequest.schema.js';

export default interface Movie extends RowDataPacket {
  id?: number;
  original_title: string;
  english_title: string;
  slug: string;
  submitted_at?: Date;
  youtube_url: string;
  cover_image: string;
  duration: number;
  is_hybrid: boolean;
  language: Languages;
  original_synopsis: string;
  english_synopsis: string;
  creative_process: string;
  ia_tools: string;
  has_subs: boolean;
  srt: string | null;
  status: 'draft' | 'published' | 'archived';
  collaborators: Collaborator[];
}

export type MovieWithDirector = Movie & { director: Director };

/**
 * Un film accompagné de la note qu'un juré donné lui a posée.
 *
 * `rated_at` reprend `rating.updated_at` et non `created_at` : une note peut
 * être corrigée, c'est la date du dernier passage du juré qui l'intéresse.
 */
export type MovieWithRating = MovieWithDirector & {
  note: number;
  comment: string | null;
  rated_at: Date;
};
