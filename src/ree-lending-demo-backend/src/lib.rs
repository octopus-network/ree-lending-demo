mod exchange;
mod lending;
mod pool;
mod reorg;

use crate::lending::{BorrowOffer, DepositOffer};
use crate::pool::Pool;
use candid::CandidType;
use ic_stable_structures::{
    DefaultMemoryImpl, StableBTreeMap,
    memory_manager::{MemoryId, MemoryManager, VirtualMemory},
};
use lending::{BlockInfo, TxRecordInfo};
use ree_types::{
    CoinBalance, TxRecord, Txid,
    exchange_interfaces::{
        ExecuteTxArgs, ExecuteTxResponse, GetMinimalTxValueArgs, GetMinimalTxValueResponse,
        GetPoolInfoArgs, GetPoolInfoResponse, GetPoolListResponse, NewBlockArgs, NewBlockInfo,
        NewBlockResponse, RollbackTxArgs, RollbackTxResponse,
    },
};
use std::cell::RefCell;
use thiserror::Error;

const SCHNORR_KEY_NAME: &str = "key_1";

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

type Memory = VirtualMemory<DefaultMemoryImpl>;

thread_local! {
  static MEMORY_MANAGER: RefCell<MemoryManager<DefaultMemoryImpl>> =
      RefCell::new(MemoryManager::init(DefaultMemoryImpl::default()));

  // LENDING_POOLS stores all lending pools
  // It's a mapping from pool_address (String) to Pool information
  static LENDING_POOLS: RefCell<StableBTreeMap<String, Pool, Memory>> = RefCell::new(
      StableBTreeMap::init(
          MEMORY_MANAGER.with(|m| m.borrow().get(MemoryId::new(0))),
      )
  );

  // BLOCKS stores the canonical blockchain observed by the exchange
  // It's used for finalizing transactions
  // Key: Block height (u32)
  // Note: This storage will be moved to the SDK in the future
  static BLOCKS: RefCell<StableBTreeMap<u32, NewBlockInfo, Memory>> = RefCell::new(
      StableBTreeMap::init(
          MEMORY_MANAGER.with(|m| m.borrow().get(MemoryId::new(1))),
      )
  );

  // TX_RECORDS tracks which pool states are affected by each transaction
  // Key: (Txid, bool) where bool=true for confirmed transactions, bool=false for unconfirmed transactions
  // Note: This storage will be moved to the SDK in the future
  static TX_RECORDS: RefCell<StableBTreeMap<(Txid, bool), TxRecord, Memory>> = RefCell::new(
      StableBTreeMap::init(
          MEMORY_MANAGER.with(|m| m.borrow().get(MemoryId::new(2))),
      )
  );
}

pub(crate) fn get_pools() -> Vec<Pool> {
    LENDING_POOLS.with_borrow(|p| p.iter().map(|p| p.1.clone()).collect::<Vec<_>>())
}

pub(crate) fn get_pool(addr: &String) -> Option<Pool> {
    LENDING_POOLS.with_borrow(|p| p.get(addr))
}

ic_cdk::export_candid!();
