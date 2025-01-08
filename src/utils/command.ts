type CommandOption = {
  name: string;
  description: string;
  type: 'string' | 'boolean';
  choices?: string[];
};

type CommandArgument = {
  name: string;
  description: string;
  required?: boolean;
};

type CommandConfig = {
  description: string;
  version: string;
  name: string;
  options: CommandOption[];
  arguments: CommandArgument[];
  actionHandler?: (args: any, options: any) => Promise<void>;
};

function createCommand(initialConfig: Partial<CommandConfig> = {}) {
  let config: CommandConfig = {
    description: '',
    version: '',
    name: '',
    options: [],
    arguments: [],
    ...initialConfig
  };

  const command = {
    name(name: string) {
      config.name = name;
      return command;
    },

    description(desc: string) {
      config.description = desc;
      return command;
    },

    version(version: string) {
      config.version = version;
      return command;
    },

    argument(name: string, description: string) {
      config.arguments.push({
        name: name.replace(/[\[\]]/g, ''),
        description,
        required: !name.startsWith('[')
      });
      return command;
    },

    option(flag: string, description: string, choices?: string[]) {
      const name = flag.match(/--([^<\s]+)/)?.[1];
      if (!name) throw new Error(`Invalid option flag: ${flag}`);
      
      config.options.push({
        name,
        description,
        type: 'string',
        choices
      });
      return command;
    },

    action(handler: (args: any, options: any) => Promise<void>) {
      config.actionHandler = handler;
      return command;
    },

    command(name: string) {
      return createCommand({ name });
    },

    async parseAsync() {
      const args = process.argv.slice(2);
      const parsedArgs: Record<string, string> = {};
      const parsedOptions: Record<string, string> = {};

      let i = 0;
      while (i < args.length) {
        const arg = args[i];

        if (arg.startsWith('--')) {
          // Handle options
          const optionName = arg.slice(2);
          const option = config.options.find(opt => opt.name === optionName);
          
          if (option) {
            i++;
            parsedOptions[optionName] = args[i];
          }
        } else {
          // Handle arguments
          const argDef = config.arguments[Object.keys(parsedArgs).length];
          if (argDef) {
            parsedArgs[argDef.name] = arg;
          }
        }
        i++;
      }

      if (config.actionHandler) {
        await config.actionHandler(parsedArgs, parsedOptions);
      }
    }
  };

  return command;
}

export { createCommand }; 