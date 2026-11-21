# csv-reader-fast

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/abdulbinjai32/csv-reader-fast/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/abdulbinjai32/csv-reader-fast/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's csv-reader 1.0.0: `run(input)` returns exactly the same
`{columns, rows, errors}` answer for every case — the same broken-row policy, the same error records, the
same line and row numbers — in about a third of the CPU time. Where the reference builds each field one
character at a time, this reads the text the way a fast parser does: it keeps where the next comma, line
break and carriage return are, cuts whole fields out as single slices, and falls back to a character scan
only for the awkward parts (a stray CR, a doubled quote, a quote that never closes).

## Run it

```sh
node main.ts
```

`main.ts` reads `/input/cases.json`, answers each case with `run()` from `solve.js`, and writes
`/output/answers.json`. Outside the container, `MAKEFUN_INPUT_DIR` and `MAKEFUN_OUTPUT_DIR` stand in for
`/input` and `/output`.

```sh
node --version           # 22.18 or later (main.ts runs as it is)
MAKEFUN_INPUT_DIR=practice/input MAKEFUN_OUTPUT_DIR=out node main.ts
```

### How it is checked

- Every answer is compared with csv-reader 1.0.0's, value for value: strings code unit for code unit,
  numbers equal, arrays in order, objects with the same keys in any order.
- Two runs of the same set must write byte-identical output.
- Speed is CPU time through the kit's timed runs, ranked against the house baseline.

### Where the time goes

| Step | What happens |
| --- | --- |
| Read the text | One pass; commas, line breaks and CRs are located with native substring search and kept between fields. |
| Cut a field | A plain field is one `slice`; a quoted field is one `slice` plus `""` -> `"`. |
| Broken fields only | A CR outside quotes (`stray_cr`), junk after a closing quote (`quote_junk`) and an unclosed quote (`unterminated_quote`) are read character by character. |
| Records | Padded (`short_row`) or cut (`long_row`) to the first record's width, with the header kept separate. |

The parsing policy is the bounty's own, written out in its `RULES.txt`; this entry changes the reading, not
the answer.

---

<sub>Entered on [make.fun](https://make.fun/?ref=csnr4ey3&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
