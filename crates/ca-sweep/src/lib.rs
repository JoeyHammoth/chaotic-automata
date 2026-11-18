//! Per-rule metrics over the protocol in design §5.2.
//!
//! The pipeline asks for a rule and gets a `RuleMetrics`; the budgets are fields rather than
//! constants, so "undecided" always means *hit this cap at these values* (ADR 0003).
//!
//! The metrics here are deliberately few and cheap. Anything that needs particle machinery or a GPU
//! is deferred in `docs/methods.md` with a reason, not faked.

use ca_core::{Engine, PackedEngine, Rule};
use std::collections::HashMap;
use std::io::Write;

use flate2::write::DeflateEncoder;
use flate2::Compression;

/// The caps that every "undecided" verdict refers to.
#[derive(Debug, Clone, Copy)]
pub struct Budgets {
    pub lattice: usize,
    pub warm: u32,
    pub max_steps: u32,
    pub period_cap: u32,
    pub density: u32,
    /// Steps between sampled frames used for entropy.
    pub cadence: u32,
    /// How many sampled frames to keep.
    pub frames: usize,
}

impl Default for Budgets {
    fn default() -> Self {
        Self {
            lattice: 64,
            warm: 24,
            max_steps: 300,
            period_cap: 600,
            density: 30,
            cadence: 8,
            frames: 8,
        }
    }
}

/// What the sweep records for one (rule, seed) pair.
#[derive(Debug, Clone, PartialEq)]
pub struct RuleMetrics {
    pub activity: f64,
    pub spatial_entropy: f64,
    pub temporal_entropy: f64,
    pub compression: f64,
    pub damage_rate: f64,
    pub damage_died: bool,
    pub population: f64,
    pub transient: u64,
    pub period: Option<u64>,
    pub lambda: f64,
}

/// Derive the per-seed generator from the rule, a sweep salt and a seed base — never from time.
///
/// FNV-1a over the canonical identity, then mixed so that neighbouring rules do not share soups.
pub fn derive_seed(birth_index: u32, survival_index: u32, salt: u64, base: u32) -> u32 {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in birth_index
        .to_le_bytes()
        .iter()
        .chain(survival_index.to_le_bytes().iter())
        .chain(salt.to_le_bytes().iter())
        .chain(base.to_le_bytes().iter())
    {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    // Fold to 32 bits, then avoid 0 so the xorshift generator never starts dead.
    let mixed = (hash >> 32) as u32 ^ hash as u32;
    if mixed == 0 { 1 } else { mixed }
}

fn state_hash(cells: &[u8]) -> u64 {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for chunk in cells.chunks(8) {
        let mut word: u64 = 0;
        for (index, byte) in chunk.iter().enumerate() {
            word |= u64::from(*byte) << (index * 8);
        }
        hash ^= word;
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
        hash ^= hash >> 29;
    }
    hash
}

fn changed_cells(a: &[u8], b: &[u8]) -> usize {
    a.iter().zip(b.iter()).filter(|(x, y)| x != y).count()
}

fn hamming(a: &[u8], b: &[u8]) -> usize {
    changed_cells(a, b)
}

fn entropy(counts: &[u32], samples: usize, bins: f64) -> f64 {
    if samples == 0 {
        return 0.0;
    }
    let total = samples as f64;
    let mut h = 0.0;
    for &count in counts {
        if count > 0 {
            let p = f64::from(count) / total;
            h -= p * p.log2();
        }
    }
    h / bins.log2()
}

/// Normalised Shannon entropy of 3x3 spatial blocks across the sampled frames (9 bits of alphabet).
fn spatial_entropy(frames: &[Vec<u8>], lattice: usize) -> f64 {
    let mut counts = vec![0u32; 512];
    let mut samples = 0usize;
    for frame in frames {
        for y in 0..lattice {
            let up = (y + lattice - 1) % lattice;
            let down = (y + 1) % lattice;
            for x in 0..lattice {
                let left = (x + lattice - 1) % lattice;
                let right = (x + 1) % lattice;
                let mut key = 0usize;
                for (dy, row) in [up, y, down].iter().enumerate() {
                    for (dx, column) in [left, x, right].iter().enumerate() {
                        key |= usize::from(frame[row * lattice + column]) << (dy * 3 + dx);
                    }
                }
                counts[key] += 1;
                samples += 1;
            }
        }
    }
    entropy(&counts, samples, 512.0)
}

/// Normalised Shannon entropy of a cell's state over four consecutive sampled frames (4 bits).
fn temporal_entropy(frames: &[Vec<u8>], lattice: usize) -> f64 {
    let cells = lattice * lattice;
    let mut counts = vec![0u32; 16];
    let mut samples = 0usize;
    if frames.len() < 4 {
        return 0.0;
    }
    for window in frames.windows(4) {
        for index in 0..cells {
            let mut key = 0usize;
            for (depth, frame) in window.iter().enumerate() {
                key |= usize::from(frame[index]) << depth;
            }
            counts[key] += 1;
            samples += 1;
        }
    }
    entropy(&counts, samples, 16.0)
}

/// Deflated size over raw size of the bit-packed spacetime diagram.
fn compression_ratio(spacetime: &[u8]) -> f64 {
    if spacetime.is_empty() {
        return 0.0;
    }
    let mut encoder = DeflateEncoder::new(Vec::new(), Compression::fast());
    if encoder.write_all(spacetime).is_err() {
        return 0.0;
    }
    match encoder.finish() {
        Ok(compressed) => compressed.len() as f64 / spacetime.len() as f64,
        Err(_) => 0.0,
    }
}

fn pack_frame(cells: &[u8], out: &mut Vec<u8>) {
    for chunk in cells.chunks(8) {
        let mut byte = 0u8;
        for (index, cell) in chunk.iter().enumerate() {
            byte |= (cell & 1) << index;
        }
        out.push(byte);
    }
}

/// Run the protocol for one rule and one seed.
pub fn measure(
    rule: Rule,
    birth_index: u32,
    survival_index: u32,
    budgets: &Budgets,
    salt: u64,
    base_seed: u32,
) -> RuleMetrics {
    let lattice = budgets.lattice;
    let cells = lattice * lattice;
    let seed = derive_seed(birth_index, survival_index, salt, base_seed);
    let mut engine = PackedEngine::new(rule, lattice, lattice, seed, budgets.density)
        .expect("budgets give a valid lattice");
    engine.step(budgets.warm);

    let start = engine.cells().to_vec();
    let mut twin_cells = start.clone();
    twin_cells[0] ^= 1;
    let mut twin = PackedEngine::from_cells(rule, lattice, lattice, &twin_cells)
        .expect("twin shares the engine dimensions");

    let mut seen: HashMap<u64, u64> = HashMap::new();
    seen.insert(state_hash(engine.cells()), 0);

    let mut previous = start.clone();
    let mut spacetime: Vec<u8> = Vec::with_capacity(cells / 8 * budgets.max_steps as usize);
    let mut frames: Vec<Vec<u8>> = Vec::with_capacity(budgets.frames);

    let mut activity_sum = 0.0;
    let mut population_sum = 0.0;
    let mut observed = 0u32;
    let mut damage_at_one = None;
    let mut damage_at_watch = 0usize;
    let mut damage_died = false;
    let mut generation = 0u64;
    let mut period = None;
    let mut transient = 0u64;

    while generation < u64::from(budgets.max_steps) {
        engine.step(1);
        twin.step(1);
        generation += 1;
        observed += 1;

        let current = engine.cells();
        activity_sum += changed_cells(&previous, current) as f64 / cells as f64;
        population_sum += current.iter().filter(|cell| **cell == 1).count() as f64 / cells as f64;
        pack_frame(current, &mut spacetime);

        if generation % u64::from(budgets.cadence) == 0 && frames.len() < budgets.frames {
            frames.push(current.to_vec());
        }

        let damage = hamming(current, twin.cells());
        if damage == 0 {
            damage_died = true;
        }
        if generation == 1 {
            damage_at_one = Some(damage);
        }
        if generation == 16 {
            damage_at_watch = damage;
        }

        let hash = state_hash(current);
        if let Some(&first) = seen.get(&hash) {
            transient = first;
            period = Some(generation - first);
            break;
        }
        seen.insert(hash, generation);
        previous.copy_from_slice(current);
    }

    // Growth over the first 16 observed steps; anything shorter is not a fit, it is a shrug.
    let damage_rate = match damage_at_one {
        Some(first) if generation >= 16 => (damage_at_watch as f64 - first as f64) / 15.0,
        _ => 0.0,
    };

    // Only rules that have not cycled by max_steps are worth extending: the cap is the verdict.
    if period.is_none() {
        let cap = u64::from(budgets.max_steps) + u64::from(budgets.period_cap);
        while generation < cap {
            engine.step(1);
            generation += 1;
            let hash = state_hash(engine.cells());
            if let Some(&first) = seen.get(&hash) {
                transient = first;
                period = Some(generation - first);
                break;
            }
            seen.insert(hash, generation);
        }
    }

    let birth_mask = rule.birth_mask();
    let survival_mask = rule.survival_mask();
    let lambda = (birth_mask.count_ones() + survival_mask.count_ones()) as f64 / 18.0;

    RuleMetrics {
        activity: activity_sum / f64::from(observed.max(1)),
        spatial_entropy: spatial_entropy(&frames, lattice),
        temporal_entropy: temporal_entropy(&frames, lattice),
        compression: compression_ratio(&spacetime),
        damage_rate,
        damage_died,
        population: population_sum / f64::from(observed.max(1)),
        transient,
        period,
        lambda,
    }
}

