// ANSI escape codes for colors
const codes = {
  reset: '\x1B[0m',
  dim: '\x1B[2m',
  // Basic colors
  cyan: '\x1B[36m',
  green: '\x1B[32m'
} as const;

type ColorName = keyof typeof codes;

function createColorizer(name: ColorName) {
  return (text: string) => `${codes[name]}${text}${codes.reset}`;
}

// Create our simplified chalk replacement
export const colors = {
  cyan: createColorizer('cyan'),
  green: createColorizer('green'),
  dim: createColorizer('dim')
}; 