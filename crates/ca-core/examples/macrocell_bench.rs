//! The two ways a large pattern reaches a tree, timed against each other.
//!
//! `cargo run --release -p ca-core --example macrocell_bench -- site/public/fixtures/otcametapixel-array.mc`
//!
//! This is a measurement, not a test: the numbers it prints are recorded in `docs/performance.md`
//! with the machine they came from. Both paths build the same tree — the test suite pins that on
//! Golly's glider, and this asserts it on the array — so what is compared is the load, not the
//! result. The grid path is timed from a grid already in memory: the page also paid to flatten the
//! file into that grid, and the macrocell path never does.

use std::path::PathBuf;
use std::time::Instant;

use ca_core::{HashLife, Rule};

/// The node cap the page runs under, so the measurement is the load the exhibit actually does.
const CAP: usize = 1 << 22;
const RUNS: usize = 3;

fn median(mut times: Vec<f64>) -> f64 {
    times.sort_by(|a, b| a.partial_cmp(b).expect("elapsed times are finite"));
    times[times.len() / 2]
}

fn main() {
    let path: PathBuf = std::env::args_os()
        .nth(1)
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("site/public/fixtures/otcametapixel-array.mc"));
    let text = std::fs::read_to_string(&path).unwrap_or_else(|error| {
        panic!(
            "could not read {}: {error}. Run `npm run build:fixtures` in site/ first.",
            path.display()
        )
    });
    let rule = Rule::life();

    // The grid the page used to hand the loader: the live box, one byte a cell.
    let template = HashLife::from_macrocell(&text, rule, CAP).expect("the fixture reads");
    let live = template.live_cells();
    let (min_x, min_y, max_x, max_y) = live.iter().fold(
        (usize::MAX, usize::MAX, 0, 0),
        |(x0, y0, x1, y1), &(x, y)| (x0.min(x), y0.min(y), x1.max(x), y1.max(y)),
    );
    let width = max_x - min_x + 1;
    let height = max_y - min_y + 1;
    let mut grid = vec![0u8; width * height];
    for (x, y) in &live {
        grid[(y - min_y) * width + (x - min_x)] = 1;
    }
    let nodes = template.node_count();
    let memory = template.memory_bytes() as f64 / (1024.0 * 1024.0);
    let grid_bytes = grid.len() as f64 / (1024.0 * 1024.0);

    println!("macrocell {}", path.display());
    println!(
        "{} bytes, {} live cells in {width}x{height}, rule {rule}, node cap {CAP}",
        text.len(),
        live.len()
    );
    println!("{RUNS} runs each, median reported; both paths build {nodes} nodes.\n");

    let mut macrocell_times = Vec::with_capacity(RUNS);
    for _ in 0..RUNS {
        let started = Instant::now();
        let life = HashLife::from_macrocell(&text, rule, CAP).expect("the fixture reads");
        macrocell_times.push(started.elapsed().as_secs_f64() * 1e3);
        assert_eq!(life.node_count(), nodes, "the runs agree with each other");
    }

    let mut grid_times = Vec::with_capacity(RUNS);
    for _ in 0..RUNS {
        let started = Instant::now();
        let life =
            HashLife::from_cells(rule, width, height, &grid, CAP).expect("the grid fits the cap");
        grid_times.push(started.elapsed().as_secs_f64() * 1e3);
        assert_eq!(life.node_count(), nodes, "the two paths agree node for node");
    }

    println!("| path | input handed to the loader | wall time | nodes | arena and index |");
    println!("|---|---|---|---|---|");
    println!(
        "| macrocell | {:.0} KB of M2 text | {:.0} ms | {nodes} | {memory:.0} MB |",
        text.len() as f64 / 1024.0,
        median(macrocell_times),
    );
    println!(
        "| grid | {grid_bytes:.0} MB of cells | {:.0} ms | {nodes} | {memory:.0} MB |",
        median(grid_times),
    );
}
