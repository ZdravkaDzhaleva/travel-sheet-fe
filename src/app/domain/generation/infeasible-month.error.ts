export class InfeasibleMonthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InfeasibleMonthError';
  }
}
