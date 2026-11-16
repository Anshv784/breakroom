//! Handlers grouped by where they run. `lib.rs` is the list of entry points.
pub mod admin;
pub mod host;
pub mod market;
pub mod profile;
pub mod sale;

pub use admin::*;
pub use host::*;
pub use market::*;
pub use profile::*;
pub use sale::*;
