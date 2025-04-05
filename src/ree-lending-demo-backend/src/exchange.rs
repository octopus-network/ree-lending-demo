use crate::pool;
use ic_cdk::api::management_canister::bitcoin::BitcoinNetwork;
use ic_cdk_macros::{query, update};
use ree_types::orchestrator_interfaces::ensure_testnet4_orchestrator;
use ree_types::{
    CoinBalance, Intention, bitcoin::psbt::Psbt, exchange_interfaces::*, psbt::ree_pool_sign,
};

#[query]
// Returns a list of all lending pools
// Each pool entry contains its name (symbol) and address
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
// Returns detailed information about a specific pool identified by its address
pub fn get_pool_info(args: GetPoolInfoArgs) -> GetPoolInfoResponse {
    let GetPoolInfoArgs { pool_address } = args;
    let p = crate::get_pool(&pool_address)?;

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
// Returns the minimum transaction value required for acceptance by the exchange
// Normally, the difficulty (minimal value) increases as zero_confirmed_tx_queue_length grows
// Longer queues require higher transaction values to prevent spam and congestion
fn get_minimal_tx_value(_args: GetMinimalTxValueArgs) -> GetMinimalTxValueResponse {
    // In this demo implementation, the minimal value is fixed
    // In a production environment, this would scale based on _args.zero_confirmed_tx_queue_length
    pool::MIN_BTC_VALUE
}

#[update(guard = "ensure_testnet4_orchestrator")]
// Accepts notifications from the orchestrator to roll back rejected transactions
// When a transaction is rejected, this function returns the pool to its previous state
// Only the orchestrator can call this function (ensured by the guard)
pub fn rollback_tx(args: RollbackTxArgs) -> RollbackTxResponse {
    crate::TX_RECORDS.with_borrow(|m| {
        // Look up the transaction record (both confirmed and unconfirmed)
        let maybe_unconfirmed_record = m.get(&(args.txid.clone(), false));
        let maybe_confirmed_record = m.get(&(args.txid.clone(), true));
        let record = maybe_confirmed_record.or(maybe_unconfirmed_record).unwrap();
        ic_cdk::println!(
            "rollback txid: {} with pools: {:?}",
            args.txid,
            record.pools
        );

        // Roll back each affected pool to its state before this transaction
        record.pools.iter().for_each(|pool_address| {
            crate::LENDING_POOLS.with_borrow_mut(|m| {
                let mut pool = m.get(pool_address).unwrap();
                pool.rollback(args.txid).unwrap();
            });
        });
    });
    return Ok(());
}

#[update(guard = "ensure_testnet4_orchestrator")]
// Accepts notifications from the orchestrator about newly confirmed blocks
// Used to finalize transactions and handle blockchain reorganizations (reorgs)
// All exchanges implement this interface in the same way - will be moved to SDK in the future
// Only the orchestrator can call this function (ensured by the guard)
pub fn new_block(args: NewBlockArgs) -> NewBlockResponse {
    // Check for blockchain reorganizations
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
        block_hash: _,
        block_timestamp: _,
        confirmed_txids,
    } = args.clone();

    // Store the new block information
    crate::BLOCKS.with_borrow_mut(|m| {
        m.insert(block_height, args);
        ic_cdk::println!("new block {} inserted into blocks", block_height,);
    });

    // Mark transactions as confirmed
    for txid in confirmed_txids {
        crate::TX_RECORDS.with_borrow_mut(|m| {
            if let Some(record) = m.get(&(txid.clone(), false)) {
                m.insert((txid.clone(), true), record.clone());
                ic_cdk::println!("confirm txid: {} with pools: {:?}", txid, record.pools);
            }
        });
    }
    // Calculate the height below which blocks are considered fully confirmed (beyond reorg risk)
    let confirmed_height =
        block_height - crate::reorg::get_max_recoverable_reorg_depth(BitcoinNetwork::Testnet) + 1;

    // Finalize transactions in confirmed blocks
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
                            // Make transaction state permanent in each affected pool
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

    // Clean up old block data that's no longer needed
    crate::BLOCKS.with_borrow_mut(|m| {
        let heights_to_remove: Vec<u32> = m
            .iter()
            .take_while(|(height, _)| *height <= confirmed_height)
            .map(|(height, _)| height)
            .collect();
        for height in heights_to_remove {
            ic_cdk::println!("removing block: {}", height);
            m.remove(&height);
        }
    });
    Ok(())
}

#[update(guard = "ensure_testnet4_orchestrator")]
// Accepts transaction execution requests from the orchestrator
// Verifies the submitted PSBT (Partially Signed Bitcoin Transaction)
// If validation passes, signs the pool's UTXOs and updates the exchange pool state
// Only the orchestrator can call this function (ensured by the guard)
pub async fn execute_tx(args: ExecuteTxArgs) -> ExecuteTxResponse {
    let ExecuteTxArgs {
        psbt_hex,
        txid,
        intention_set,
        intention_index,
        zero_confirmed_tx_queue_length: _zero_confirmed_tx_queue_length,
    } = args;
    // Decode and deserialize the PSBT
    let raw = hex::decode(&psbt_hex).map_err(|_| "invalid psbt".to_string())?;
    let mut psbt = Psbt::deserialize(raw.as_slice()).map_err(|_| "invalid psbt".to_string())?;

    // Extract the intention details
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

    // Get the pool from storage
    let pool = crate::LENDING_POOLS
        .with_borrow(|m| m.get(&pool_address).expect("already checked in pre_*; qed"));

    // Process the transaction based on the action type
    match intention.action.as_ref() {
        "deposit" => {
            // Validate the deposit transaction and get the new pool state
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

            // Sign the UTXO if there's an existing one to spend
            if let Some(ref utxo) = consumed {
                ree_pool_sign(
                    &mut psbt,
                    utxo,
                    crate::SCHNORR_KEY_NAME,
                    pool.derivation_path(),
                )
                .await
                .map_err(|e| e.to_string())?;
            }

            // Update the pool with the new state
            crate::LENDING_POOLS.with_borrow_mut(|m| {
                let mut pool = m
                    .get(&pool_address)
                    .expect("already checked in pre_deposit; qed");
                pool.commit(new_state);
                m.insert(pool_address.clone(), pool);
            });
        }
        "borrow" => {
            // Validate the borrow transaction and get the new pool state
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

            // Sign the UTXO to be spent
            ree_pool_sign(
                &mut psbt,
                &consumed,
                crate::SCHNORR_KEY_NAME,
                pool.derivation_path(),
            )
            .await
            .map_err(|e| e.to_string())?;

            // Update the pool with the new state
            crate::LENDING_POOLS.with_borrow_mut(|m| {
                let mut pool = m
                    .get(&pool_address)
                    .expect("already checked in pre_borrow; qed");
                pool.commit(new_state);
                m.insert(pool_address.clone(), pool);
            });
        }
        _ => {
            return Err("invalid method".to_string());
        }
    }

    // Record the transaction as unconfirmed and track which pools it affects
    crate::TX_RECORDS.with_borrow_mut(|m| {
        ic_cdk::println!("new unconfirmed txid: {} in pool: {} ", txid, pool_address);
        let mut record = m.get(&(txid.clone(), false)).unwrap_or_default();
        if !record.pools.contains(&pool_address) {
            record.pools.push(pool_address.clone());
        }
        m.insert((txid.clone(), false), record);
    });

    // Return the serialized PSBT with the exchange's signatures
    Ok(psbt.serialize_hex())
}
