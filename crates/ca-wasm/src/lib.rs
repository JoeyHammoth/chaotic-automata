//! Raw `wasm32` exports for the engine (ADR 0004: no wasm-bindgen for a numeric kernel).
//!
//! The ABI is deliberately small and pointer-based: the page allocates nothing, reads the grid in
//! place, and asks for a digest when it wants to compare a run.

#![allow(static_mut_refs)]

use ca_core::{Engine, PackedEngine, Rule};

static mut ENGINE: Option<PackedEngine> = None;
static mut DIGEST: [u8; 32] = [0; 32];

/// Build a grid. Returns 1 on success, 0 if the dimensions or rule are invalid.
#[no_mangle]
pub extern "C" fn engine_init(mask: u32, width: u32, height: u32, seed: u32, density: u32) -> u32 {
    let cells = ca_core::seed::soup(width as usize, height as usize, seed, density);
    match PackedEngine::from_cells(
        Rule::from_mask(mask),
        width as usize,
        height as usize,
        &cells,
    ) {
        Ok(engine) => {
            unsafe {
                ENGINE = Some(engine);
            }
            1
        }
        Err(_) => 0,
    }
}

#[no_mangle]
pub extern "C" fn engine_step(steps: u32) {
    unsafe {
        if let Some(engine) = ENGINE.as_mut() {
            engine.step(steps);
        }
    }
}

#[no_mangle]
pub extern "C" fn engine_cells_ptr() -> *const u8 {
    unsafe {
        ENGINE
            .as_ref()
            .map(|engine| engine.cells().as_ptr())
            .unwrap_or(std::ptr::null())
    }
}

#[no_mangle]
pub extern "C" fn engine_width() -> u32 {
    unsafe { ENGINE.as_ref().map(|e| e.width() as u32).unwrap_or(0) }
}

#[no_mangle]
pub extern "C" fn engine_height() -> u32 {
    unsafe { ENGINE.as_ref().map(|e| e.height() as u32).unwrap_or(0) }
}

#[no_mangle]
pub extern "C" fn engine_rule_mask() -> u32 {
    unsafe {
        ENGINE
            .as_ref()
            .map(|engine| engine.rule().mask())
            .unwrap_or(0)
    }
}

#[no_mangle]
pub extern "C" fn engine_digest_ptr() -> *const u8 {
    unsafe {
        if let Some(engine) = ENGINE.as_ref() {
            DIGEST = engine.digest();
        }
        DIGEST.as_ptr()
    }
}
