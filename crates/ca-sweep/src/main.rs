//! Emit one JSON line per (rule, seed), so the Python side owns aggregation and provenance.

use ca_core::Rule;
use ca_sweep::{measure, Budgets};
use std::process::ExitCode;

struct Window {
    birth_start: u32,
    birth_count: u32,
    survival_start: u32,
    survival_count: u32,
}

struct Args {
    budgets: Budgets,
    salt: u64,
    seeds: Vec<u32>,
    windows: Vec<Window>,
    threads: usize,
    output: Option<String>,
}

fn parse_u32(text: &str, flag: &str) -> Result<u32, String> {
    text.parse()
        .map_err(|_| format!("{flag} expects an integer, got '{text}'"))
}

fn parse_vec(text: &str, flag: &str) -> Result<[u32; 4], String> {
    let parts: Vec<&str> = text.split(':').collect();
    if parts.len() != 4 {
        return Err(format!("{flag} expects start:count:start:count, got '{text}'"));
    }
    let mut out = [0u32; 4];
    for (slot, part) in out.iter_mut().zip(parts.iter()) {
        *slot = parse_u32(part, flag)?;
    }
    Ok(out)
}

fn parse_args() -> Result<Args, String> {
    let mut args = Args {
        budgets: Budgets::default(),
        salt: 1,
        seeds: Vec::new(),
        windows: Vec::new(),
        threads: 1,
        output: None,
    };
    let mut iter = std::env::args().skip(1);
    while let Some(flag) = iter.next() {
        let mut value = || iter.next().ok_or_else(|| format!("{flag} needs a value"));
        match flag.as_str() {
            "--lattice" => args.budgets.lattice = parse_u32(&value()?, &flag)? as usize,
            "--warm" => args.budgets.warm = parse_u32(&value()?, &flag)?,
            "--max-steps" => args.budgets.max_steps = parse_u32(&value()?, &flag)?,
            "--period-cap" => args.budgets.period_cap = parse_u32(&value()?, &flag)?,
            "--density" => args.budgets.density = parse_u32(&value()?, &flag)?,
            "--cadence" => args.budgets.cadence = parse_u32(&value()?, &flag)?,
            "--frames" => args.budgets.frames = parse_u32(&value()?, &flag)? as usize,
            "--threads" => args.threads = parse_u32(&value()?, &flag)?.max(1) as usize,
            "--out" => args.output = Some(value()?),
            "--salt" => {
                args.salt = value()?
                    .parse()
                    .map_err(|_| String::from("--salt expects an integer"))?
            }
            "--seed" => args.seeds.push(parse_u32(&value()?, &flag)?),
            "--window" => {
                let [birth_start, birth_count, survival_start, survival_count] =
                    parse_vec(&value()?, &flag)?;
                args.windows.push(Window {
                    birth_start,
                    birth_count,
                    survival_start,
                    survival_count,
                });
            }
            other => return Err(format!("unknown flag {other}")),
        }
    }
    if args.seeds.is_empty() {
        return Err(String::from("at least one --seed is required"));
    }
    if args.windows.is_empty() {
        return Err(String::from("at least one --window is required"));
    }
    Ok(args)
}

/// The reflected Gray code: the mask drawn at chart position `index`.
///
/// Chart adjacency is rule adjacency only under this mapping, so it matches
/// `computation_atlas.space.mask_at` exactly.
fn mask_at(index: u32) -> u32 {
    index ^ (index >> 1)
}

fn main() -> ExitCode {
    let args = match parse_args() {
        Ok(args) => args,
        Err(message) => {
            eprintln!("{{\"error\":\"{message}\"}}");
            return ExitCode::from(2);
        }
    };

    // Rule ranges are independent, so the sweep splits them across threads and merges the text at the
    // end. No shared mutable state: budgets are Copy and `measure` is a pure function.
    let total: u64 = args
        .windows
        .iter()
        .map(|window| u64::from(window.birth_count) * u64::from(window.survival_count))
        .sum();
    let threads = args.threads.min(total.max(1) as usize).max(1);
    let per_thread = (total as usize).div_ceil(threads);

    let mut chunks: Vec<String> = Vec::with_capacity(threads);
    let mut failed = false;
    std::thread::scope(|scope| {
        let mut handles = Vec::with_capacity(threads);
        for chunk in 0..threads {
            let first = chunk * per_thread;
            let budgets = args.budgets;
            let salt = args.salt;
            let seeds = &args.seeds;
            let windows = &args.windows;
            handles.push(scope.spawn(move || {
                let mut text = String::new();
                let mut ordinal = 0usize;
                for window in windows {
                    for survival_index in
                        window.survival_start..window.survival_start + window.survival_count
                    {
                        for birth_index in
                            window.birth_start..window.birth_start + window.birth_count
                        {
                            let this = ordinal;
                            ordinal += 1;
                            if this < first || this >= first + per_thread {
                                continue;
                            }
                            let mask = mask_at(birth_index) | mask_at(survival_index) << 9;
                            let rule = Rule::from_mask(mask);
                            for &seed in seeds {
                                let metrics = measure(
                                    rule,
                                    birth_index,
                                    survival_index,
                                    &budgets,
                                    salt,
                                    seed,
                                );
                                let period = match metrics.period {
                                    Some(period) => period.to_string(),
                                    None => String::from("null"),
                                };
                                text.push_str(&format!(
                                    "{{\"bx\":{birth_index},\"by\":{survival_index},\"rule\":\"{}\",\"seed\":{seed},\
\"activity\":{:.6},\"spatial_entropy\":{:.6},\"temporal_entropy\":{:.6},\"compression\":{:.6},\
\"damage_rate\":{:.6},\"damage_died\":{},\"population\":{:.6},\"transient\":{},\"period\":{period},\
\"lambda\":{:.6}}}\n",
                                    rule.canonical(),
                                    metrics.activity,
                                    metrics.spatial_entropy,
                                    metrics.temporal_entropy,
                                    metrics.compression,
                                    metrics.damage_rate,
                                    metrics.damage_died,
                                    metrics.population,
                                    metrics.transient,
                                    metrics.lambda,
                                ));
                            }
                        }
                    }
                }
                text
            }));
        }
        for handle in handles {
            match handle.join() {
                Ok(text) => chunks.push(text),
                Err(_) => failed = true,
            }
        }
    });
    if failed {
        return ExitCode::from(1);
    }

    // A file sink keeps megabytes of JSONL out of a pipe, which matters when the sweep is the slow
    // half and the parent is a Python process reading it back.
    if let Some(path) = &args.output {
        let file = match std::fs::File::create(path) {
            Ok(file) => file,
            Err(error) => {
                eprintln!("{{\"error\":\"cannot write {path}: {error}\"}}");
                return ExitCode::from(1);
            }
        };
        let mut out = std::io::BufWriter::new(file);
        if write_chunks(&mut out, &chunks).is_err() {
            return ExitCode::from(1);
        }
    } else {
        let stdout = std::io::stdout();
        let mut out = std::io::BufWriter::new(stdout.lock());
        if write_chunks(&mut out, &chunks).is_err() {
            return ExitCode::from(1);
        }
    }
    ExitCode::SUCCESS
}

fn write_chunks(writer: &mut impl std::io::Write, chunks: &[String]) -> std::io::Result<()> {
    for chunk in chunks {
        writer.write_all(chunk.as_bytes())?;
    }
    writer.flush()
}
