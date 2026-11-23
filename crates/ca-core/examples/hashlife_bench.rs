//! Timings for the HashLife engine, on the case it is built for and the one it degrades on.
//!
//! `cargo run --release -p ca-core --example hashlife_bench`
//!
//! This is a measurement, not a test: the numbers it prints are recorded in `docs/performance.md`
//! with the machine they came from. The seeds, densities and node cap are printed so a run can be
//! reproduced exactly, and the soup generator is the committed [`ca_core::seed`] one rather than
//! whatever `rand` resolves to today.

use std::time::Instant;

use ca_core::seed::soup;
use ca_core::{HashLife, Rule};

/// A budget large enough that a 256x256 soup never touches it: these runs measure time, and a cap
/// hit would report the budget instead of the engine.
const CAP: usize = 5_000_000;

fn from_rows(rule: Rule, rows: &[&str]) -> HashLife {
    let height = rows.len();
    let width = rows[0].len();
    let mut cells = vec![0u8; width * height];
    for (y, row) in rows.iter().enumerate() {
        assert_eq!(row.len(), width, "every row is the same width");
        for (x, ch) in row.chars().enumerate() {
            if ch == '#' {
                cells[y * width + x] = 1;
            }
        }
    }
    HashLife::from_cells(rule, width, height, &cells, CAP).expect("the pattern fits the cap")
}

fn measure(label: &str, life: &mut HashLife, generations: u64) {
    let started = Instant::now();
    if let Err(error) = life.step(generations) {
        println!("{label}: {error}");
        return;
    }
    let elapsed = started.elapsed();
    let micros = elapsed.as_secs_f64() * 1e6;
    println!(
        "| {label} | {generations} | {:.1} ms | {:.3} | {} | {} | {} |",
        micros / 1000.0,
        micros / generations as f64,
        life.node_count(),
        life.cap_hits(),
        life.population(),
    );
}

fn main() {
    let rule = Rule::life();
    println!("HashLife, rule {rule}, node cap {CAP}");
    println!();
    println!("| case | generations | wall time | us/generation | nodes | cap hits | population |");
    println!("|---|---|---|---|---|---|---|");

    // The repetitive case: a glider, which is what a compressed step exists for.
    let mut glider = from_rows(rule, &[".#.", "..#", "###"]);
    measure("glider, 3x3", &mut glider, 1 << 20);

    // The honest slow case: chaotic soup, where canonicalisation finds nothing to share.
    for (side, generations) in [(64usize, 64u64), (128, 16), (256, 4)] {
        let cells = soup(side, side, 12_345, 30);
        let mut life =
            HashLife::from_cells(rule, side, side, &cells, CAP).expect("the soup fits the cap");
        measure(
            &format!("soup {side}x{side}, seed 12345, 30%"),
            &mut life,
            generations,
        );
    }
}
