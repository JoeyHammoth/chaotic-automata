//! Emit a stepped grid so the Python harness can compare it cell by cell.
//!
//! Protocol: raw cells (one byte each) on stdout; a JSON line of metadata on stderr. Keeping the
//! payload binary means the harness reads the same bytes the engine holds, with no encoding round-trip
//! to hide a disagreement in.

use ca_core::{Engine, PackedEngine, Rule};
use std::io::Write;
use std::process::ExitCode;
use std::time::Instant;

struct Args {
    rule: String,
    seed: u32,
    steps: u32,
    width: usize,
    height: usize,
    mutate: bool,
}

fn parse_args() -> Result<Args, String> {
    let mut args = Args {
        rule: String::from("B3/S23"),
        seed: 0,
        steps: 1,
        width: 64,
        height: 64,
        mutate: false,
    };
    let mut iter = std::env::args().skip(1);
    while let Some(flag) = iter.next() {
        let mut value = || {
            iter.next()
                .ok_or_else(|| format!("{flag} needs a value"))
        };
        match flag.as_str() {
            "--rule" => args.rule = value()?,
            "--seed" => {
                args.seed = value()?
                    .parse()
                    .map_err(|_| String::from("--seed must be an integer"))?
            }
            "--steps" => {
                args.steps = value()?
                    .parse()
                    .map_err(|_| String::from("--steps must be an integer"))?
            }
            "--width" => {
                args.width = value()?
                    .parse()
                    .map_err(|_| String::from("--width must be an integer"))?
            }
            "--height" => {
                args.height = value()?
                    .parse()
                    .map_err(|_| String::from("--height must be an integer"))?
            }
            "--mutate" => args.mutate = true,
            other => return Err(format!("unknown flag {other}")),
        }
    }
    Ok(args)
}

fn main() -> ExitCode {
    let args = match parse_args() {
        Ok(args) => args,
        Err(message) => {
            eprintln!("{{\"error\":\"{message}\"}}");
            return ExitCode::from(2);
        }
    };

    let rule = match Rule::parse(&args.rule) {
        Ok(rule) => rule,
        Err(error) => {
            eprintln!("{{\"error\":\"{}\"}}", error.message.replace('"', "'"));
            return ExitCode::from(2);
        }
    };

    let mut engine = match PackedEngine::new(rule, args.width, args.height, args.seed, 30) {
        Ok(engine) => engine,
        Err(error) => {
            eprintln!("{{\"error\":\"{error}\"}}");
            return ExitCode::from(2);
        }
    };

    let started = Instant::now();
    engine.step(args.steps);
    let step_nanos = started.elapsed().as_nanos();

    let mut cells = engine.cells().to_vec();
    if args.mutate {
        // A real mutation: flip one cell after stepping, so the harness must notice.
        cells[0] ^= 1;
    }

    let digest: String = engine
        .digest()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect();

    let stdout = std::io::stdout();
    let mut out = stdout.lock();
    if out.write_all(&cells).is_err() {
        return ExitCode::from(1);
    }
    let _ = out.flush();

    eprintln!(
        "{{\"rule\":\"{}\",\"seed\":{},\"steps\":{},\"width\":{},\"height\":{},\"mutated\":{},\"digest\":\"{digest}\",\"step_ns\":{step_nanos}}}",
        rule.canonical(),
        args.seed,
        args.steps,
        args.width,
        args.height,
        args.mutate,
    );
    ExitCode::SUCCESS
}
