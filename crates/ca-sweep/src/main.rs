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

    let stdout = std::io::stdout();
    let mut out = std::io::BufWriter::new(stdout.lock());

    for window in &args.windows {
        for survival_index in window.survival_start..window.survival_start + window.survival_count {
            for birth_index in window.birth_start..window.birth_start + window.birth_count {
                let mask = mask_at(birth_index) | mask_at(survival_index) << 9;
                let rule = Rule::from_mask(mask);
                for &seed in &args.seeds {
                    let metrics = measure(rule, birth_index, survival_index, &args.budgets, args.salt, seed);
                    let period = match metrics.period {
                        Some(period) => period.to_string(),
                        None => String::from("null"),
                    };
                    let line = format!(
                        "{{\"bx\":{birth_index},\"by\":{survival_index},\"rule\":\"{}\",\"seed\":{seed},\
\"activity\":{:.6},\"spatial_entropy\":{:.6},\"temporal_entropy\":{:.6},\"compression\":{:.6},\
\"damage_rate\":{:.6},\"damage_died\":{},\"population\":{:.6},\"transient\":{},\"period\":{period},\
\"lambda\":{:.6}}}",
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
                    );
                    use std::io::Write;
                    if writeln!(out, "{line}").is_err() {
                        return ExitCode::from(1);
                    }
                }
            }
        }
    }
    ExitCode::SUCCESS
}
