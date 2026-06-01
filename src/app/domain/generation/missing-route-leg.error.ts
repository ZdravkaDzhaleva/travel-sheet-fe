export class MissingRouteLegError extends Error {
  constructor(
    readonly aId: number,
    readonly bId: number,
  ) {
    super(`No route leg found between location ${aId} and ${bId}`);
    this.name = 'MissingRouteLegError';
  }
}
