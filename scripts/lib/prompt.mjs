import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

export function isInteractive(flags) {
  return !flags.has("--yes") && !flags.has("-y") && Boolean(input.isTTY && output.isTTY);
}

export async function confirm(question, defaultYes = false) {
  const hint = defaultYes ? "[Y/n]" : "[y/N]";
  const rl = createInterface({ input, output });
  try {
    const answer = (await rl.question(`${question} ${hint} `)).trim().toLowerCase();
    if (!answer) {
      return defaultYes;
    }
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}

export async function chooseFromList(title, options, defaultIndex = 0) {
  if (!options.length) {
    throw new Error("No options available to choose from.");
  }

  output.write(`\n${title}\n`);
  for (let index = 0; index < options.length; index += 1) {
    const marker = index === defaultIndex ? " (default)" : "";
    output.write(`  [${index + 1}] ${options[index].label}${marker}\n`);
    if (options[index].detail) {
      output.write(`      ${options[index].detail}\n`);
    }
  }

  const rl = createInterface({ input, output });
  try {
    while (true) {
      const answer = (await rl.question(`\nEnter choice [${defaultIndex + 1}]: `)).trim();
      if (!answer) {
        return options[defaultIndex];
      }
      const parsed = Number.parseInt(answer, 10);
      if (Number.isInteger(parsed) && parsed >= 1 && parsed <= options.length) {
        return options[parsed - 1];
      }
      output.write(`Please enter a number between 1 and ${options.length}.\n`);
    }
  } finally {
    rl.close();
  }
}

export async function confirmSelection(title, details) {
  output.write(`\n${title}\n`);
  for (const line of details) {
    output.write(`  • ${line}\n`);
  }
  return confirm("Proceed with these settings?", true);
}
