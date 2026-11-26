//! The verifier's cryptid walk, mirrored step for step from `cryptid_trace` in
//! `src/computation_atlas/verifier.py`.
//!
//! The Python producer is the product's definition; this is the same walk without the
//! interpreter's per-transition cost, so the matched-decade ladder can be carried further than a
//! CPython loop reaches. It is a mirror and not a second definition: `tests/test_cryptid.py`
//! compares every sample it reports against the Python walk's own on each differential run, and the
//! 10^10 figures in `docs/methods.md` were taken only after it had reproduced the product's 10^9
//! samples exactly.
//!
//! usage: ca-cryptid --machine <string> [--steps 1000000000] [--samples 1000,10000,...]
//!
//! One JSON object on stdout: `halted`, the step it stopped at, and a sample at each requested step,
//! carrying the written span, the head's drift from the left edge, and the span gained since the
//! sample before it. The shape is `cryptid_trace`'s own.

use std::process::ExitCode;

const LETTERS: &str = "ABCDEFG";
const HALT: i8 = -1;
const DEFAULT_STEPS: u64 = 1_000_000_000;
const INITIAL_TAPE: usize = 1 << 12;
/// The tape grows before the head gets closer than this to either end, as the Python walk does.
const MARGIN: i64 = 16;

struct Machine {
    write: Vec<i8>,
    mv: Vec<i8>,
    nxt: Vec<i8>,
}

fn parse(text: &str) -> Result<Machine, String> {
    let cleaned = text.trim().replace(' ', "");
    let blocks: Vec<&str> = cleaned.split('_').collect();
    if blocks.len() > LETTERS.len() {
        return Err(format!(
            "expected 1 to {} state blocks, found {}",
            LETTERS.len(),
            blocks.len()
        ));
    }
    let states = blocks.len();
    let mut machine = Machine {
        write: Vec::new(),
        mv: Vec::new(),
        nxt: Vec::new(),
    };
    for block in &blocks {
        if !block.is_ascii() || block.len() != 6 {
            return Err(format!("block {block:?} is not two 3-character transitions"));
        }
        let bytes = block.as_bytes();
        for k in 0..2 {
            let chunk = &bytes[3 * k..3 * k + 3];
            if chunk == b"---" || chunk[2] == b'H' {
                machine.write.push(HALT);
                machine.mv.push(0);
                machine.nxt.push(HALT);
                continue;
            }
            if chunk[0] != b'0' && chunk[0] != b'1' {
                return Err(format!(
                    "{} writes {}, which is not 0 or 1",
                    String::from_utf8_lossy(chunk),
                    chunk[0] as char
                ));
            }
            if chunk[1] != b'L' && chunk[1] != b'R' {
                return Err(format!(
                    "{} moves {}, which is not L or R",
                    String::from_utf8_lossy(chunk),
                    chunk[1] as char
                ));
            }
            let target = LETTERS
                .find(chunk[2] as char)
                .filter(|index| *index < states)
                .ok_or_else(|| {
                    format!(
                        "{} targets state {}, outside this machine",
                        String::from_utf8_lossy(chunk),
                        chunk[2] as char
                    )
                })?;
            machine.write.push((chunk[0] - b'0') as i8);
            machine.mv.push(if chunk[1] == b'R' { 1 } else { -1 });
            machine.nxt.push(target as i8);
        }
    }
    Ok(machine)
}

/// Walk `steps` transitions and report the JSON `cryptid_trace` would return for the same run.
fn walk(machine: &Machine, steps: u64, mut wanted: Vec<u64>) -> String {
    // `cryptid_trace` always samples the budget itself, whatever else was asked for.
    wanted.push(steps);
    wanted.sort_unstable();
    wanted.dedup();

    let mut tape = vec![0u8; INITIAL_TAPE];
    let mut head = (INITIAL_TAPE / 2) as i64;
    let mut state: usize = 0;
    let mut low = head;
    let mut high = head;
    let mut previous: i64 = 0;
    let mut index = 0;
    let mut halted = false;
    let mut stopped = steps;
    let mut samples: Vec<String> = Vec::new();

    for step in 0..steps {
        let at = state + state + tape[head as usize] as usize;
        if machine.write[at] == HALT || machine.nxt[at] == HALT {
            halted = true;
            stopped = step + 1;
            break;
        }
        tape[head as usize] = machine.write[at] as u8;
        if head < low {
            low = head;
        } else if head > high {
            high = head;
        }
        head += machine.mv[at] as i64;
        state = machine.nxt[at] as usize;
        if head < MARGIN || head >= tape.len() as i64 - MARGIN {
            let size = tape.len();
            let offset = size / 2;
            let mut grown = vec![0u8; size * 2];
            grown[offset..offset + size].copy_from_slice(&tape);
            tape = grown;
            head += offset as i64;
            low += offset as i64;
            high += offset as i64;
        }
        let done = step + 1;
        while index < wanted.len() && done == wanted[index] {
            let span = high - low;
            samples.push(format!(
                "{{\"steps\": {done}, \"span\": {span}, \"drift\": {}, \"delta\": {}}}",
                head - low,
                span - previous
            ));
            previous = span;
            index += 1;
        }
    }

    // A halt returns before the sampling point, as the Python walk does, so the samples are the
    // ones collected up to it and nothing is invented for the step that stopped the machine.
    format!(
        "{{\"halted\": {halted}, \"steps\": {stopped}, \"samples\": [{}]}}",
        samples.join(", ")
    )
}

fn run() -> Result<(), String> {
    let mut machine_text: Option<String> = None;
    let mut steps = DEFAULT_STEPS;
    let mut wanted: Vec<u64> = Vec::new();
    let mut iter = std::env::args().skip(1);
    while let Some(flag) = iter.next() {
        let mut value = || iter.next().ok_or_else(|| format!("{flag} needs a value"));
        match flag.as_str() {
            "--machine" => machine_text = Some(value()?),
            "--steps" => {
                steps = value()?
                    .parse()
                    .map_err(|_| String::from("--steps expects an integer"))?
            }
            "--samples" => {
                let text = value()?;
                wanted = text
                    .split(',')
                    .map(|part| {
                        part.trim()
                            .parse::<u64>()
                            .map_err(|_| format!("--samples expects integers, got {part:?}"))
                    })
                    .collect::<Result<Vec<u64>, String>>()?;
            }
            other => return Err(format!("unknown flag {other}")),
        }
    }
    let text = machine_text.ok_or_else(|| String::from("--machine is required"))?;
    let machine = parse(&text)?;
    println!("{}", walk(&machine, steps, wanted));
    Ok(())
}

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("ca-cryptid: {error}");
            ExitCode::FAILURE
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_halting_machine_stops_at_the_halting_transition() {
        let machine = parse("1RB1LB_1LA1RH").expect("a two-state machine");
        assert_eq!(
            walk(&machine, 64, Vec::new()),
            "{\"halted\": true, \"steps\": 6, \"samples\": []}"
        );
    }

    #[test]
    fn a_string_the_reference_refuses_is_refused() {
        assert!(parse("1RB1LB_1LA").is_err(), "a five-character block");
        assert!(parse("2RB1LB_1LA1LA").is_err(), "a symbol that is not 0 or 1");
        assert!(parse("1RC1LB_1LA1LA").is_err(), "a target state it does not have");
        assert!(parse("1RB1LB_1LA1LA_1LA1LA_1LA1LA_1LA1LA_1LA1LA_1LA1LA_1LA1LA").is_err());
    }

    #[test]
    fn the_tape_grows_and_the_span_follows_the_head() {
        // A one-state machine that writes and moves right forever: growth is the only thing that
        // keeps it inside the tape, so this fails loudly if the grow path is ever dropped. The
        // values are the Python walk's own, checked sample for sample in `tests/test_cryptid.py`.
        let machine = parse("1RB0RB_1RB0RB").expect("a machine that always moves right");
        assert_eq!(
            walk(&machine, 5_000, vec![5_000]),
            "{\"halted\": false, \"steps\": 5000, \"samples\": [{\"steps\": 5000, \"span\": 4999, \
             \"drift\": 5000, \"delta\": 4999}]}"
        );
    }
}
