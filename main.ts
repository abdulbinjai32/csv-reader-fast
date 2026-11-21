// The driver the harness runs, `node /bot/main.ts`: every case from /input/cases.json is answered with
// run() from solve.js, and /output/answers.json holds the answers, one per case and in the cases' order.
// Outside a container MAKEFUN_INPUT_DIR and MAKEFUN_OUTPUT_DIR stand in for /input and /output.
//
// V8's incremental marking is turned off before solve.js is imported, as the house driver does, so the
// contest's CPU time is spent reading text rather than tracing the heap's growth. Three more flags cut
// the time a single cold run spends compiling: the baseline compiler takes every function eagerly
// (--always-sparkplug), the optimizing tier never runs (--max-opt=0), and no compile is repeated in the
// background or thrown away (--no-concurrent-recompilation --no-flush-bytecode). A run over this
// competition's sets is one pass of a loop that is mostly indexOf and slice, which the baseline code
// already runs as fast as optimized code, so paying for TurboFan costs more than it returns.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';

setFlagsFromString(
  '--no-incremental-marking --always-sparkplug --max-opt=0 --no-concurrent-recompilation --no-flush-bytecode',
);

const { run } = (await import(new URL('./solve.js', import.meta.url).href)) as {
  run: (input: { text: string; header: boolean }) => unknown;
};

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const cases = JSON.parse(readFileSync(join(INPUT_DIR, 'cases.json'), 'utf8')) as {
  id: string;
  input: { text: string; header: boolean };
}[];

const answers: unknown[] = new Array(cases.length);
for (let i = 0; i < cases.length; i++) answers[i] = run(cases[i].input);

writeFileSync(join(OUTPUT_DIR, 'answers.json'), JSON.stringify(answers));
