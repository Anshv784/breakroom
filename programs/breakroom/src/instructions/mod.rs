//! Handlers grouped by where they run. `lib.rs` is the list of entry points.
pub mod admin;
pub mod host;

pub use admin::*;
pub use host::*;
