//! Deterministic initial conditions.
//!
//! The same seed must produce the same soup on every engine and every platform, so the generator is
//! written out rather than taken from a library whose implementation might change.

/// xorshift32, the generator from the M0 engine spike, kept because its digests are recorded.
pub fn xorshift32(state: &mut u32) -> u32 {
    let mut x = *state;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    *state = x;
    x
}

/// A random soup: `density_percent` of cells alive, row-major, one byte per cell.
pub fn soup(width: usize, height: usize, seed: u32, density_percent: u32) -> Vec<u8> {
    let mut cells = vec![0u8; width * height];
    let mut state = seed;
    for cell in cells.iter_mut() {
        *cell = if xorshift32(&mut state) % 100 < density_percent {
            1
        } else {
            0
        };
    }
    cells
}
