use crate::{ExchangeError, pool::CoinMeta};
use candid::{CandidType, Deserialize};
use ic_cdk_macros::query;
use ree_types::{CoinBalance, Pubkey, Utxo};
use serde::Serialize;

#[derive(Eq, PartialEq, CandidType, Clone, Debug, Deserialize, Serialize)]
pub struct DepositOffer {
    pub input: Option<Utxo>,
    pub output: CoinBalance,
    pub nonce: u64,
}

#[query]
pub fn pre_deposit(pool_key: Pubkey, amount: CoinBalance) -> Result<DepositOffer, ExchangeError> {
    if amount.value < CoinMeta::btc().min_amount {
        return Err(ExchangeError::TooSmallFunds);
    }
    crate::with_pool(&pool_key, |p| {
        let pool = p.as_ref().ok_or(ExchangeError::InvalidPool)?;
        let state = pool.states.last().clone();
        Ok(DepositOffer {
            input: state.map(|s| s.utxo.clone()).flatten(),
            output: CoinBalance {
                id: pool.meta.id,
                value: 0,
            },
            nonce: state.map(|s| s.nonce).unwrap_or_default(),
        })
    })
}

#[derive(Eq, PartialEq, CandidType, Clone, Debug, Deserialize, Serialize)]
pub struct BorrowOffer {
    pub input: Utxo,
    pub output: CoinBalance,
    pub nonce: u64,
}

#[query]
pub fn pre_borrow(id: Pubkey, input: CoinBalance) -> Result<BorrowOffer, ExchangeError> {
    crate::with_pool(&id, |p| {
        let pool = p.as_ref().ok_or(ExchangeError::InvalidPool)?;
        let recent_state = pool.states.last().ok_or(ExchangeError::EmptyPool)?;
        let offer = pool.available_to_borrow(input)?;
        Ok(BorrowOffer {
            input: recent_state.utxo.clone().expect("already checked"),
            output: offer,
            nonce: recent_state.nonce,
        })
    })
}

pub fn ensure_orchestrator() -> Result<(), String> {
    crate::is_orchestrator(&ic_cdk::caller())
        .then(|| ())
        .ok_or("Access denied".to_string())
}

ic_cdk::export_candid!();
