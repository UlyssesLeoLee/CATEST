pub mod events;
pub mod models;
pub mod rag_models;
pub mod utils;

pub fn init_tracing() {
    tracing_subscriber::fmt::init();
}
