use crate::{ExchangeError, canister::ensure_orchestrator, pool};
use ic_cdk::api::management_canister::bitcoin::BitcoinNetwork;
use ic_cdk_macros::{query, update};
use ree_types::{CoinBalance, Intention, TxRecord, bitcoin::psbt::Psbt, exchange_interfaces::*};

#[query]
pub fn get_pool_list() -> GetPoolListResponse {
    let pools = crate::get_pools();
    pools
        .iter()
        .map(|p| PoolBasic {
            name: p.meta.symbol.clone(),
            address: p.addr.clone(),
        })
        .collect()
}

#[query]
pub fn get_pool_info(args: GetPoolInfoArgs) -> GetPoolInfoResponse {
    let GetPoolInfoArgs { pool_address } = args;
    let p = crate::with_pool_addr(&pool_address)?;

    Some(PoolInfo {
        key: p.pubkey.clone(),
        name: p.meta.symbol.clone(),
        key_derivation_path: vec![p.meta.id.to_bytes()],
        address: p.addr.clone(),
        nonce: p.states.last().map(|s| s.nonce).unwrap_or_default(),
        btc_reserved: p.states.last().map(|s| s.btc_supply()).unwrap_or_default(),
        coin_reserved: p
            .states
            .last()
            .map(|s| {
                vec![CoinBalance {
                    id: p.meta.id,
                    value: s.rune_supply() as u128,
                }]
            })
            .unwrap_or_default(),
        utxos: p
            .states
            .last()
            .and_then(|s| s.utxo.clone())
            .map(|utxo| vec![utxo])
            .unwrap_or_default(),
        attributes: p.attrs(),
    })
}

#[query]
fn get_minimal_tx_value(_args: GetMinimalTxValueArgs) -> GetMinimalTxValueResponse {
    pool::MIN_BTC_VALUE
}

#[update(guard = "ensure_orchestrator")]
pub fn rollback_tx(args: RollbackTxArgs) -> RollbackTxResponse {
    crate::TX_RECORDS.with_borrow(|m| {
        let maybe_unconfirmed_record = m.get(&(args.txid.clone(), false));
        let maybe_confirmed_record = m.get(&(args.txid.clone(), true));
        let record = maybe_confirmed_record.or(maybe_unconfirmed_record).unwrap();
        ic_cdk::println!(
            "rollback txid: {} with pools: {:?}",
            args.txid,
            record.pools
        );

        record.pools.iter().for_each(|pool_address| {
            crate::LENDING_POOLS.with_borrow_mut(|m| {
                let mut pool = m.get(pool_address).unwrap();
                pool.rollback(args.txid).unwrap();
            });
        });
    });
    return Ok(());
}

#[update(guard = "ensure_orchestrator")]
pub fn new_block(args: NewBlockArgs) -> NewBlockResponse {
    match crate::reorg::detect_reorg(BitcoinNetwork::Testnet, args.clone()) {
        Ok(_) => {}
        Err(crate::reorg::Error::DuplicateBlock { height, hash }) => {
            return Err(format!(
                "Duplicate block detected at height {} with hash {}",
                height, hash
            ));
        }
        Err(crate::reorg::Error::Unrecoverable) => {
            return Err("Unrecoverable reorg detected".to_string());
        }
        Err(crate::reorg::Error::Recoverable { height, depth }) => {
            crate::reorg::handle_reorg(height, depth);
        }
    }
    let NewBlockArgs {
        block_height,
        block_hash,
        block_timestamp: _,
        confirmed_txids,
    } = args.clone();

    crate::BLOCKS.with_borrow_mut(|m| {
        m.insert(block_height, args);
        ic_cdk::println!(
            "new block inserted into blocks, height: {}, hash: {}",
            block_height,
            block_hash
        );
    });

    for txid in confirmed_txids {
        crate::TX_RECORDS.with_borrow_mut(|m| {
            if let Some(record) = m.get(&(txid.clone(), false)) {
                m.insert((txid.clone(), true), record.clone());
                ic_cdk::println!("confirm txid: {} with pools: {:?}", txid, record.pools);
            }
        });
    }
    let confirmed_height =
        block_height - crate::reorg::get_max_recoverable_reorg_depth(BitcoinNetwork::Testnet) + 1;
    crate::BLOCKS.with_borrow(|m| {
        m.iter()
            .take_while(|(height, _)| *height <= confirmed_height)
            .for_each(|(height, block_info)| {
                ic_cdk::println!("finalizing txs in block: {}", height);
                block_info.confirmed_txids.iter().for_each(|txid| {
                    crate::TX_RECORDS.with_borrow_mut(|m| {
                        if let Some(record) = m.get(&(txid.clone(), true)) {
                            ic_cdk::println!(
                                "finalize txid: {} with pools: {:?}",
                                txid,
                                record.pools
                            );
                            record.pools.iter().for_each(|pool_address| {
                                crate::LENDING_POOLS.with_borrow_mut(|p| {
                                    let mut pool = p.get(pool_address).unwrap();
                                    pool.finalize(txid.clone()).unwrap();
                                });
                            });
                        }
                    });
                });
            });
    });

    crate::BLOCKS.with_borrow_mut(|m| {
        let heights_to_remove: Vec<u32> = m
            .iter()
            .take_while(|(height, _)| *height <= confirmed_height)
            .map(|(height, _)| height)
            .collect();
        for height in heights_to_remove {
            ic_cdk::println!("removing block height: {}", height);
            m.remove(&height);
        }
    });
    Ok(())
}

#[update(guard = "ensure_orchestrator")]
pub async fn execute_tx(args: ExecuteTxArgs) -> ExecuteTxResponse {
    let ExecuteTxArgs {
        psbt_hex,
        txid,
        intention_set,
        intention_index,
        zero_confirmed_tx_queue_length: _zero_confirmed_tx_queue_length,
    } = args;
    let raw = hex::decode(&psbt_hex).map_err(|_| "invalid psbt".to_string())?;
    let mut psbt = Psbt::deserialize(raw.as_slice()).map_err(|_| "invalid psbt".to_string())?;
    let intention = intention_set.intentions[intention_index as usize].clone();
    let Intention {
        exchange_id: _,
        action: _,
        action_params: _,
        pool_address,
        nonce,
        pool_utxo_spend,
        pool_utxo_receive,
        input_coins,
        output_coins,
    } = intention;
    let pool = crate::with_pool_addr(&pool_address)
        .ok_or(ExchangeError::PoolAddressNotFound.to_string())?;
    match intention.action.as_ref() {
        "deposit" => {
            let (new_state, consumed) = pool
                .validate_deposit(
                    txid,
                    nonce,
                    pool_utxo_spend,
                    pool_utxo_receive,
                    input_coins,
                    output_coins,
                )
                .map_err(|e| e.to_string())?;
            if let Some(ref utxo) = consumed {
                ree_types::psbt::sign(
                    &mut psbt,
                    utxo,
                    pool.base_id().to_string().as_bytes().to_vec(),
                )
                .await
                .map_err(|e| e.to_string())?;
            }
            crate::with_pool_mut(&pool.pubkey, |p| {
                let mut pool = p.expect("already checked in pre_deposit; qed");
                pool.commit(new_state);
                Ok(Some(pool))
            })
            .map_err(|e| e.to_string())?;
        }
        "borrow" => {
            let (new_state, consumed) = pool
                .validate_borrow(
                    txid,
                    nonce,
                    pool_utxo_spend,
                    pool_utxo_receive,
                    input_coins,
                    output_coins,
                )
                .map_err(|e| e.to_string())?;
            ree_types::psbt::sign(
                &mut psbt,
                &consumed,
                pool.base_id().to_string().as_bytes().to_vec(),
            )
            .await
            .map_err(|e| e.to_string())?;
            crate::with_pool_mut(&pool.pubkey, |p| {
                let mut pool = p.expect("already checked in pre_borrow; qed");
                pool.commit(new_state);
                Ok(Some(pool))
            })
            .map_err(|e| e.to_string())?;
        }
        _ => {
            return Err("invalid method".to_string());
        }
    }
    crate::TX_RECORDS.with_borrow_mut(|m| {
        ic_cdk::println!("new unconfirmed txid: {} in pool: {} ", txid, pool_address);
        let mut record = m
            .get(&(txid.clone(), false))
            .unwrap_or(TxRecord { pools: vec![] });
        if !record.pools.contains(&pool_address) {
            record.pools.push(pool_address.clone());
        }
        m.insert((txid.clone(), false), record);
    });
    Ok(psbt.serialize_hex())
}
