mod lending;
mod pool;

use crate::lending::{BorrowOffer, DepositOffer};
use candid::CandidType;
use candid::Deserialize;
use ree_exchange_sdk::types::CoinBalance;
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error, CandidType)]
pub enum ExchangeError {
    #[error("overflow")]
    Overflow,
    #[error("invalid pool")]
    InvalidPool,
    #[error("too small funds")]
    TooSmallFunds,
    #[error("invalid txid")]
    InvalidTxid,
    #[error("the pool has not been initialized or has been removed")]
    EmptyPool,
    #[error("invalid sign_psbt args: {0}")]
    InvalidSignPsbtArgs(String),
    #[error("pool state expired, current = {0}")]
    PoolStateExpired(u64),
}

// Demonstration BlockState type definition.
// This state only stores a block_number and serves no practical purpose in this demo.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct BlockState {
    pub block_number: u32,
}

ic_cdk::export_candid!();
