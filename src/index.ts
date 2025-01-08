import { createInterface } from 'node:readline';
import { colors } from './utils/colors';
import { createCommand } from './utils/command';

type Choice<T = string> = {
  title: string;
  value: T;
}

type BaseStep<T = any> = {
  name: string;
  message: string;
  description?: string;
  validate?: (input: string) => boolean | string;
  transform?: (input: string) => T;
  initial?: T;
}

type TextStep = BaseStep & {
  type: 'text';
}

type SelectStep = BaseStep & {
  type: 'select';
  choices: Choice[];
}

type ConfirmStep = BaseStep & {
  type: 'confirm';
}

type StepConfig = TextStep | SelectStep | ConfirmStep;

type CommandConfig = {
  name: string;
  description: string;
  banner?: {
    render: () => string;
    text?: string;
    responsive?: boolean;
  };
  steps: StepConfig[];
}

type CLIConfig = {
  name: string;
  version: string;
  commands: Record<string, CommandConfig>;
}

// Track the current cursor position
let currentLine = 0;

// Input utilities
async function text(message: string, initial?: string, validate?: (input: string) => boolean | string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const promptText = colors.cyan('? ') + message + (initial ? colors.dim(` (${initial})`) : '') + ' ';
  console.log(promptText);
  currentLine++;

  try {
    const answer = await new Promise<string>((resolve) => {
      rl.question('', (input) => {
        resolve(input || initial || '');
      });
    });

    if (validate) {
      const result = validate(answer);
      if (typeof result === 'string') {
        throw new Error(result);
      }
    }

    return answer;
  } finally {
    rl.close();
    currentLine++;
  }
}

async function select<T = string>(message: string, choices: Choice<T>[], initialIndex = 0): Promise<T> {
  const rl = createInterface({ 
    input: process.stdin, 
    output: process.stdout 
  });

  let selectedIndex = initialIndex;
  const maxIndex = choices.length - 1;

  // Hide cursor during selection
  process.stdout.write('\x1B[?25l');

  // Position cursor and render initial menu
  console.log(colors.cyan('? ') + message);
  currentLine++;

  const renderChoices = () => {
    process.stdout.write('\x1B[0G'); // Reset to the start of the line
    choices.forEach((choice, i) => {
      const prefix = i === selectedIndex ? colors.green('>') : ' ';
      console.log(`  ${prefix} ${choice.title}`);
    });
  };

  const clearChoices = () => {
    choices.forEach(() => {
      process.stdout.write('\x1B[1A'); // Move cursor up one line
      process.stdout.write('\x1B[2K'); // Clear the line
    });
  };

  try {
    return await new Promise((resolve) => {
      const handleKeypress = (str: string, key: { name: string }) => {
        if (key.name === 'up' && selectedIndex > 0) {
          selectedIndex--;
        } else if (key.name === 'down' && selectedIndex < maxIndex) {
          selectedIndex++;
        } else if (key.name === 'return') {
          cleanup();
          resolve(choices[selectedIndex].value);
          return;
        }
        clearChoices();
        renderChoices();
      };

      const cleanup = () => {
        process.stdin.removeListener('keypress', handleKeypress);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        rl.close();
        process.stdout.write('\x1B[?25h\n'); // Show cursor again
      };

      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.on('keypress', handleKeypress);

      renderChoices();
    });
  } finally {
    process.stdin.setRawMode(false);
    process.stdin.pause();
    rl.close();
    process.stdout.write('\x1B[?25h');
  }
}

async function confirm(message: string, initial = false): Promise<boolean> {
  const answer = await text(`${message} (y/n)`, initial ? 'y' : 'n');
  return answer.toLowerCase().startsWith('y');
}

async function processStep(step: StepConfig): Promise<any> {
  switch (step.type) {
    case 'text':
      return text(step.message, step.initial as string, step.validate);
    case 'select':
      if (!step.choices) throw new Error('Choices required for select step');
      return select(step.message, step.choices);
    case 'confirm':
      return confirm(step.message, step.initial as boolean);
    default: {
      const _exhaustiveCheck: never = step;
      throw new Error(`Unknown step type: ${(_exhaustiveCheck as any).type}`);
    }
  }
}

async function promptSteps(config: CommandConfig) {
  const answers: Record<string, any> = {};

  // Clear screen and reset cursor position
  process.stdout.write('\x1B[2J\x1B[0f');
  currentLine = 0;

  if (config.banner) {
    console.log(config.banner.render());
    if (config.banner.text) {
      console.log(colors.dim(config.banner.text));
    }
    console.log();

    const bannerHeight = config.banner.render().split('\n').length;
    currentLine = bannerHeight + (config.banner.text ? 2 : 1);
  }

  try {
    for (const step of config.steps) {
      const answer = await processStep(step);
      answers[step.name] = answer;
    }
  } finally {
    process.stdout.write('\x1B[?25h');
  }

  return answers;
}

function createProgramCommand(program: ReturnType<typeof createCommand>, name: string, config: CommandConfig) {
  const command = program.command(name);
  command.description(config.description);

  config.steps.forEach(step => {
    if (step.type === 'text') {
      command.argument(`[${step.name}]`, step.description || step.message);
    } else if (step.type === 'select') {
      command.option(
        `--${step.name} <${step.name}>`,
        step.description || step.message,
        step.choices.map(c => c.value)
      );
    }
  });

  command.action(async (name, options) => {
    const answers = await promptSteps({
      ...config,
      steps: config.steps.map(step => ({
        ...step,
        initial: step.name === 'name' ? name : options[step.name]
      }))
    });

    const handler = await import(`../commands/${name}`);
    await handler[name]({ ...options, ...answers });
  });

  return command;
}

function createCLI(config: CLIConfig) {
  const program = createCommand();

  program
    .name(config.name)
    .version(config.version);

  Object.entries(config.commands).forEach(([name, cmdConfig]) => {
    createProgramCommand(program, name, cmdConfig);
  });

  return {
    run: () => program.parseAsync()
  };
}

export {
  createCLI,
  type CLIConfig,
  type CommandConfig,
  type StepConfig,
  type Choice
};
