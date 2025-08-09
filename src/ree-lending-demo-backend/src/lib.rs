mod lending;
mod pool;

use crate::lending::{BorrowOffer, DepositOffer};
use candid::CandidType;
use ree_exchange_sdk::types::CoinBalance;
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
    #[error("invalid pool state: {0}")]
    InvalidState(String),
    #[error("invalid sign_psbt args: {0}")]
    InvalidSignPsbtArgs(String),
    #[error("pool state expired, current = {0}")]
    PoolStateExpired(u64),
}

ic_cdk::export_candid!();
