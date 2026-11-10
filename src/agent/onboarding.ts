export interface AvailableCli {
  id: string;
  name: string;
  available: boolean;
  version?: string;
}

export function availableClis<T extends AvailableCli>(clis: T[]): T[] {
  const priority = (id: string) => id === 'pi' ? 0 : id === 'codex' ? 1 : 2;
  return clis.filter((cli) => cli.available).sort((a, b) => priority(a.id) - priority(b.id));
}

export function recommendedCli(clis: AvailableCli[]) {
  return availableClis(clis)[0] ?? null;
}
