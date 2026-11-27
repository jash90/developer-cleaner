//! Stopping the window's folder scans.
//!
//! Every scan the window starts takes a token from a generation counter, and `cancel_scan`
//! moves the counter on. A scan whose generation is no longer current stops at its next check
//! and returns [`SCAN_STOPPED`] instead of a result, so nothing partial is ever shown as if it
//! were the whole folder. A scan started after a stop takes the new generation, which means a
//! stop that arrives late can never end the next scan. The menu bar's refresh does not take a
//! token and cannot be stopped from here.

use std::sync::atomic::{AtomicU64, Ordering};

static GENERATION: AtomicU64 = AtomicU64::new(0);

/// The error a stopped scan returns; the window recognises it and shows "stopped", not "failed".
pub const SCAN_STOPPED: &str = "Scan stopped";

/// A check the long loops of a scan call between units of work.
pub type StopCheck<'a> = &'a (dyn Fn() -> bool + Sync);

#[derive(Debug, Clone, Copy)]
pub struct ScanToken(u64);

impl ScanToken {
    /// Taken when a scan command starts.
    pub fn current() -> Self {
        Self(GENERATION.load(Ordering::SeqCst))
    }

    pub fn is_cancelled(self) -> bool {
        GENERATION.load(Ordering::SeqCst) != self.0
    }
}

/// Stop every window scan running now. Scans started afterwards are not affected.
#[tauri::command]
pub fn cancel_scan() {
    GENERATION.fetch_add(1, Ordering::SeqCst);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_stop_ends_running_scans_but_not_the_next_one() {
        let running = ScanToken::current();
        assert!(!running.is_cancelled());

        cancel_scan();
        assert!(running.is_cancelled());

        let next = ScanToken::current();
        assert!(!next.is_cancelled());
    }
}
