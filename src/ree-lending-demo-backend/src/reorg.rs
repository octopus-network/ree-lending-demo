// This file will be moved to the SDK in the future
use ic_cdk::api::management_canister::bitcoin::BitcoinNetwork;
use ree_types::exchange_interfaces::NewBlockInfo;
use thiserror::Error;

#[derive(Debug, Error)]
pub(crate) enum Error {
    #[error("{depth} block deep reorg detected at height {height}")]
    Recoverable { height: u32, depth: u32 },

    #[error("duplicate block detected at height {height} with hash {hash}")]
    DuplicateBlock { height: u32, hash: String },

    #[error("unrecoverable reorg detected")]
    Unrecoverable,
}

pub fn get_max_recoverable_reorg_depth(network: BitcoinNetwork) -> u32 {
    match network {
        BitcoinNetwork::Regtest => 6,
        BitcoinNetwork::Testnet => 64,
        BitcoinNetwork::Mainnet => 6,
    }
}

pub(crate) fn detect_reorg(network: BitcoinNetwork, new_block: NewBlockInfo) -> Result<(), Error> {
    ic_cdk::println!(
        "Processing new block - height: {}, hash: {}, timestamp: {}, confirmed_txs: {:?}",
        new_block.block_height,
        new_block.block_hash,
        new_block.block_timestamp,
        new_block.confirmed_txids
    );
    let current_block =
        crate::BLOCKS.with_borrow(|m| m.iter().rev().next().map(|(_height, block)| block));
    match current_block {
        None => {
            ic_cdk::println!("No blocks found in exchange - this is expected for new exchanges");
            return Ok(());
        }
        Some(current_block) => {
            ic_cdk::println!(
                "Current block - height: {:?}, hash: {:?}, timestamp: {:?}",
                current_block.block_height,
                current_block.block_hash,
                current_block.block_timestamp
            );
            if new_block.block_height == current_block.block_height + 1 {
                ic_cdk::println!("New block is the next block in the chain");
                return Ok(());
            } else if new_block.block_height > current_block.block_height + 1 {
                ic_cdk::println!("New block is more than one block ahead of the current block");
                return Err(Error::Unrecoverable);
            } else {
                let reorg_depth = current_block.block_height - new_block.block_height + 1;
                ic_cdk::println!("Detected reorg - depth: {}", reorg_depth,);
                if reorg_depth > get_max_recoverable_reorg_depth(network) {
                    ic_cdk::println!("Reorg depth is greater than the max recoverable reorg depth");
                    return Err(Error::Unrecoverable);
                }
                let target_block = match crate::BLOCKS
                    .with_borrow(|m| m.get(&new_block.block_height))
                {
                    Some(block) => block,
                    None => {
                        ic_cdk::println!(
                            "Unable to determine the previous block height; assuming it is a duplicate block: {}",
                            new_block.block_height
                        );
                        return Err(Error::DuplicateBlock {
                            height: new_block.block_height,
                            hash: new_block.block_hash,
                        });
                    }
                };
                if target_block.block_hash == new_block.block_hash {
                    ic_cdk::println!("New block is a duplicate block");
                    return Err(Error::DuplicateBlock {
                        height: new_block.block_height,
                        hash: new_block.block_hash,
                    });
                }
                return Err(Error::Recoverable {
                    height: current_block.block_height,
                    depth: reorg_depth,
                });
            }
        }
    }
}

pub fn handle_reorg(height: u32, depth: u32) {
    ic_cdk::println!("Rolling back state after reorg of depth {depth} at height {height}");

    for h in (height - depth + 1..=height).rev() {
        ic_cdk::println!("Rolling back change record at height {h}");
        let block = match crate::BLOCKS.with_borrow(|m| m.get(&h)) {
            Some(block) => block,
            None => {
                ic_cdk::println!("Block not found at height: {}, skipping", h);
                continue;
            }
        };
        for txid in block.confirmed_txids.iter() {
            crate::TX_RECORDS.with_borrow_mut(|m| {
                if let Some(record) = m.remove(&(txid.clone(), true)) {
                    m.insert((txid.clone(), false), record);
                    ic_cdk::println!("Unconfirm txid: {}", txid);
                }
            });
        }
        crate::BLOCKS.with_borrow_mut(|m| m.remove(&h));
    }

    ic_cdk::println!(
        "Successfully rolled back state to height {}",
        height - depth,
    );
}
