export interface AvailableCli {
  id: string;
  name: string;
  available: boolean;
  version?: string;
}

const CLI_PRIORITY: Record<string, number> = {
  claude: 0,
  codex: 1,
  gemini: 2,
  antigravity: 3,
  pi: 4,
};

export function availableClis<T extends AvailableCli>(clis: T[]): T[] {
  const priority = (id: string) => CLI_PRIORITY[id] ?? 5;
  return clis.filter((cli) => cli.available).sort((a, b) => priority(a.id) - priority(b.id));
}

export function recommendedCli(clis: AvailableCli[]) {
  return availableClis(clis)[0] ?? null;
}
