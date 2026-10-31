type CliPromptMode = 'stdin' | 'argument';

export type CliSpec = {
  id: string;
  name: string;
  commands: string[];
  versionArgs: string[];
  args: string[];
  promptMode: CliPromptMode;
};

export const KNOWN_CLIS: CliSpec[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    commands: ['claude'],
    versionArgs: ['--version'],
    args: [
      '--permission-mode',
      'auto',
      '-p',
      '--output-format',
      'stream-json',
      '--include-partial-messages',
      '--verbose',
    ],
    promptMode: 'stdin',
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    commands: ['opencode'],
    versionArgs: ['--version'],
    args: ['run'],
    promptMode: 'stdin',
  },
  {
    id: 'pi',
    name: 'Pi CLI',
    commands: ['pi'],
    versionArgs: ['--version'],
    args: ['--print', '--mode', 'json'],
    promptMode: 'stdin',
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    commands: ['codex'],
    versionArgs: ['--version'],
    args: ['--ask-for-approval', 'never', 'exec', '--sandbox', 'workspace-write', '--ephemeral', '--json', '--color', 'never', '-'],
    promptMode: 'stdin',
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    commands: ['gemini'],
    versionArgs: ['--version'],
    args: ['--prompt', '', '--output-format', 'text'],
    promptMode: 'stdin',
  },
  {
    id: 'antigravity',
    name: 'Antigravity CLI',
    commands: ['agy'],
    versionArgs: ['--version'],
    args: ['-p'],
    promptMode: 'argument',
  },
  {
    id: 'qwen',
    name: 'Qwen Code',
    commands: ['qwen', 'qwen-code'],
    versionArgs: ['--version'],
    args: ['--prompt', '', '--output-format', 'text'],
    promptMode: 'stdin',
  },
  {
    id: 'cursor-agent',
    name: 'Cursor Agent',
    commands: ['cursor-agent'],
    versionArgs: ['--version'],
    args: ['-p'],
    promptMode: 'argument',
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot CLI',
    commands: ['copilot'],
    versionArgs: ['--version'],
    args: ['-s', '-p'],
    promptMode: 'argument',
  },
  {
    id: 'qoder',
    name: 'Qoder CLI',
    commands: ['qodercli', 'qoderclicn'],
    versionArgs: ['--version'],
    args: ['-q', '--output-format', 'text', '-p'],
    promptMode: 'argument',
  },
  {
    id: 'kimi',
    name: 'Kimi Code CLI',
    commands: ['kimi', 'kimi-cli'],
    versionArgs: ['--version'],
    args: ['--output-format', 'text', '-p'],
    promptMode: 'argument',
  },
  {
    id: 'trae',
    name: 'Trae CLI',
    commands: ['trae-cli'],
    versionArgs: ['--version'],
    args: ['run'],
    promptMode: 'argument',
  },
];
