//! Known patterns, checked on both engines. Failures report coordinates, not whole grids.

use ca_core::{Engine, PackedEngine, ReferenceEngine, Rule};

const W: usize = 64;
const H: usize = 64;

fn grid(points: &[(usize, usize)]) -> Vec<u8> {
    let mut cells = vec![0u8; W * H];
    for &(x, y) in points {
        cells[y * W + x] = 1;
    }
    cells
}

fn live(cells: &[u8]) -> Vec<(usize, usize)> {
    cells
        .iter()
        .enumerate()
        .filter(|(_, &c)| c == 1)
        .map(|(i, _)| (i % W, i / W))
        .collect()
}

fn both(cells: &[u8]) -> (PackedEngine, ReferenceEngine) {
    (
        PackedEngine::from_cells(Rule::life(), W, H, cells).expect("valid packed engine"),
        ReferenceEngine::from_cells(Rule::life(), W, H, cells),
    )
}

#[test]
fn block_is_a_still_life_in_both_engines() {
    let points = [(10, 10), (11, 10), (10, 11), (11, 11)];
    let (mut packed, mut reference) = both(&grid(&points));
    packed.step(25);
    reference.step(25);
    assert_eq!(live(packed.cells()), points, "packed: block must not move");
    assert_eq!(live(reference.cells()), points, "reference: block must not move");
    assert_eq!(packed.digest(), reference.digest());
}

#[test]
fn blinker_oscillates_with_period_two() {
    let vertical = [(10, 9), (10, 10), (10, 11)];
    let horizontal = [(9, 10), (10, 10), (11, 10)];
    let (mut packed, mut reference) = both(&grid(&vertical));

    packed.step(1);
    reference.step(1);
    assert_eq!(live(packed.cells()), horizontal, "packed, generation 1");
    assert_eq!(live(reference.cells()), horizontal, "reference, generation 1");

    packed.step(1);
    reference.step(1);
    assert_eq!(live(packed.cells()), vertical, "packed returns after two steps");
    assert_eq!(live(reference.cells()), vertical, "reference returns after two steps");
}

#[test]
fn glider_translates_one_one_after_four_steps() {
    // The canonical glider, which moves (+1, +1) every four generations.
    let start = [(11, 10), (12, 11), (10, 12), (11, 12), (12, 12)];
    let expected = [(12, 11), (13, 12), (11, 13), (12, 13), (13, 13)];

    let (mut packed, mut reference) = both(&grid(&start));
    packed.step(4);
    reference.step(4);
    assert_eq!(live(packed.cells()), expected, "packed glider position");
    assert_eq!(live(reference.cells()), expected, "reference glider position");
}

#[test]
fn packed_engine_rejects_dimensions_it_cannot_handle() {
    let life = Rule::life();
    assert!(PackedEngine::from_cells(life, 30, 8, &vec![0u8; 30 * 8]).is_err());
    assert!(PackedEngine::from_cells(life, 0, 8, &[]).is_err());
    assert!(PackedEngine::from_cells(life, 64, 8, &vec![0u8; 30 * 8]).is_err());
}
