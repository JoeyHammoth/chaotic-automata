//! Differential and property tests for the HashLife engine.
//!
//! The oracle is [`ReferenceEngine`], the naive `u8` stepper, on a torus padded wide enough that
//! the wrap cannot reach the compared region within the generations being compared (ADR 0002).

use ca_core::{Engine, HashLife, HashLifeError, ReferenceEngine, Rule};

fn cells_from_rows(rows: &[&str]) -> (usize, usize, Vec<u8>) {
    let height = rows.len();
    let width = rows[0].len();
    let mut cells = vec![0u8; width * height];
    for (y, row) in rows.iter().enumerate() {
        assert_eq!(row.len(), width, "every row is the same width");
        for (x, ch) in row.chars().enumerate() {
            cells[y * width + x] = match ch {
                '#' | 'O' => 1,
                '.' | ' ' => 0,
                other => panic!("unexpected pattern character {other:?}"),
            };
        }
    }
    (width, height, cells)
}

fn pattern(rows: &[&str]) -> HashLife {
    let (width, height, cells) = cells_from_rows(rows);
    HashLife::from_cells(Rule::life(), width, height, &cells, 500_000).expect("pattern fits")
}

fn soup(side: usize, seed: u32, percent: u32) -> Vec<u8> {
    let mut state = seed | 1;
    let mut cells = vec![0u8; side * side];
    for cell in cells.iter_mut() {
        state ^= state << 13;
        state ^= state >> 17;
        state ^= state << 5;
        *cell = u8::from(state % 100 < percent);
    }
    cells
}

/// The reference engine on a torus, with `cells` centred and `padding` dead cells on every side.
fn reference(
    width: usize,
    height: usize,
    padding: usize,
    cells: &[u8],
    rule: Rule,
) -> ReferenceEngine {
    let side = width + 2 * padding;
    let mut torus = vec![0u8; side * side];
    for y in 0..height {
        for x in 0..width {
            torus[(y + padding) * side + x + padding] = cells[y * width + x];
        }
    }
    ReferenceEngine::from_cells(rule, side, side, &torus)
}

#[test]
fn still_lifes_keep_their_population_exactly() {
    for rows in [
        vec![".##.", ".##."],
        vec![".##.", "#..#", ".##."],
        vec![".##.", "#..#", ".#.#", "..#."],
    ] {
        let mut life = pattern(&rows);
        let before = life.population();
        assert!(before > 0, "{rows:?} should be alive");
        life.step(32).expect("32 generations");
        assert_eq!(life.population(), before, "{rows:?} is a still life");
        assert_eq!(
            life.pattern(),
            pattern(&rows).pattern(),
            "{rows:?} is unchanged"
        );
    }
}

#[test]
fn a_glider_has_period_four_and_moves() {
    let rows = vec![".#.", "..#", "###"];
    let mut life = pattern(&rows);
    let start = life.pattern();
    let population = life.population();

    life.step(2).expect("two generations");
    assert_ne!(
        life.pattern(),
        start,
        "a glider is not a period-2 oscillator"
    );

    life.step(2).expect("two more generations");
    assert_eq!(
        life.population(),
        population,
        "a glider keeps its five cells"
    );
    assert_eq!(
        life.pattern(),
        start,
        "a glider returns to its shape after four generations"
    );
}

#[test]
fn bit_exact_against_the_reference_stepper_on_a_soup() {
    let rule = Rule::life();
    let (side, generations, padding) = (24usize, 16usize, 32usize);
    let cells = soup(side, 12_345, 30);

    let mut life = HashLife::from_cells(rule, side, side, &cells, 500_000).expect("soup fits");
    life.step(generations as u64).expect("soup steps");

    let mut torus = reference(side, side, padding, &cells, rule);
    torus.step(generations as u32);

    let expected: Vec<(usize, usize)> = torus
        .cells()
        .iter()
        .enumerate()
        .filter(|(_, &cell)| cell == 1)
        .map(|(index, _)| (index % torus.width(), index / torus.width()))
        .collect();
    let expected = normalise(&expected);

    assert_eq!(
        life.pattern(),
        expected,
        "HashLife disagrees with the reference"
    );
    assert_eq!(
        life.population(),
        expected.len() as u64,
        "population disagrees"
    );
}

fn normalise(cells: &[(usize, usize)]) -> Vec<(usize, usize)> {
    let min_x = cells.iter().map(|&(x, _)| x).min().unwrap_or(0);
    let min_y = cells.iter().map(|&(_, y)| y).min().unwrap_or(0);
    let mut out: Vec<(usize, usize)> = cells.iter().map(|&(x, y)| (x - min_x, y - min_y)).collect();
    out.sort_unstable();
    out
}

#[test]
fn structurally_equal_subtrees_share_one_id() {
    // Two identical 8x8 blocks, far apart in the same universe.
    let mut cells = vec![0u8; 32 * 8];
    for (x, y) in [(0, 0), (1, 0), (0, 1), (1, 1)] {
        cells[y * 32 + x] = 1;
        cells[y * 32 + x + 24] = 1;
    }
    let life = HashLife::from_cells(Rule::life(), 32, 8, &cells, 500_000).expect("fits");
    let left = life.subtree_at(3, 0, 0).expect("root is deep enough");
    let right = life.subtree_at(3, 24, 0).expect("root is deep enough");
    assert_eq!(left, right, "equal subtrees must canonicalise to one node");
}

#[test]
fn a_variable_step_matches_repeated_single_steps() {
    let cells = soup(20, 99, 30);
    let mut compressed = HashLife::from_cells(Rule::life(), 20, 20, &cells, 500_000).expect("fits");
    let mut repeated = HashLife::from_cells(Rule::life(), 20, 20, &cells, 500_000).expect("fits");

    compressed.step(8).expect("one compressed step");
    for _ in 0..8 {
        repeated.step(1).expect("one generation");
    }

    assert_eq!(compressed.generation(), 8);
    assert_eq!(compressed.pattern(), repeated.pattern());
    assert_eq!(compressed.population(), repeated.population());
}

#[test]
fn the_node_cap_is_reported_rather_than_exceeded() {
    let cells = soup(24, 7, 40);
    let result = HashLife::from_cells(Rule::life(), 24, 24, &cells, 64);
    match result {
        Err(HashLifeError::NodeCap { cap, hits }) => {
            assert_eq!(cap, 64);
            assert!(hits >= 1, "a hit is counted");
        }
        Ok(mut life) => {
            let outcome = life.step(16);
            assert!(
                matches!(outcome, Err(HashLifeError::NodeCap { .. })),
                "a 64-node budget cannot hold a stepped soup"
            );
        }
        Err(other) => panic!("unexpected error {other}"),
    }
}

#[test]
fn stepping_an_empty_universe_does_nothing() {
    let mut life = HashLife::new(Rule::life(), 1024);
    life.step(64).expect("an empty universe steps");
    assert_eq!(life.population(), 0);
    assert!(life.pattern().is_empty());
    assert_eq!(life.generation(), 64);
}

#[test]
fn other_life_like_rules_run_through_the_same_path() {
    // Seeds (B2/S) grow without bound; the reference is the oracle for one generation.
    let rule = Rule::parse("B2/S").expect("B2/S parses");
    let rows = vec!["...", ".#.", "..."];
    let (width, height, cells) = cells_from_rows(&rows);
    let mut life = HashLife::from_cells(rule, width, height, &cells, 500_000).expect("fits");
    life.step(1).expect("one generation");

    let mut torus = reference(width, height, 4, &cells, rule);
    torus.step(1);
    let expected: Vec<(usize, usize)> = torus
        .cells()
        .iter()
        .enumerate()
        .filter(|(_, &cell)| cell == 1)
        .map(|(index, _)| (index % torus.width(), index / torus.width()))
        .collect();
    assert_eq!(life.pattern(), normalise(&expected));
}
