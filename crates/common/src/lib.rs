pub mod models;
pub mod events;
pub mod utils;
pub mod rag_models;

pub fn init_tracing() {
    tracing_subscriber::fmt::init();
}
