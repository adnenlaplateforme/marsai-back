export default class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public error: object | undefined = undefined,
  ) {
    super(message);
    // Sans ça, `name` reste hérité de Error et toute stack s'ouvre sur
    // « Error: ... », qu'il s'agisse d'un refus métier volontaire ou d'un
    // plantage inattendu. Les deux se lisent alors pareil dans les logs.
    this.name = 'AppError';
  }
}
