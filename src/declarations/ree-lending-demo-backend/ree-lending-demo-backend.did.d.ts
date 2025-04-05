import type { Principal } from '@dfinity/principal';
import type { ActorMethod } from '@dfinity/agent';
import type { IDL } from '@dfinity/candid';

export interface BorrowOffer {
  'pool_utxo' : Utxo,
  'nonce' : bigint,
  'input_runes' : CoinBalance,
  'output_btc' : CoinBalance,
}
export interface CoinBalance { 'id' : string, 'value' : bigint }
export interface DepositOffer { 'pool_utxo' : [] | [Utxo], 'nonce' : bigint }
export type ExchangeError = { 'InvalidSignPsbtArgs' : string } |
  { 'Overflow' : null } |
  { 'PoolStateExpired' : bigint } |
  { 'TooSmallFunds' : null } |
  { 'InvalidPool' : null } |
  { 'InvalidTxid' : null } |
  { 'EmptyPool' : null } |
  { 'InvalidState' : string };
export interface ExecuteTxArgs {
  'zero_confirmed_tx_queue_length' : number,
  'txid' : string,
  'intention_set' : IntentionSet,
  'intention_index' : number,
  'psbt_hex' : string,
}
export interface GetMinimalTxValueArgs {
  'zero_confirmed_tx_queue_length' : number,
  'pool_address' : string,
}
export interface GetPoolInfoArgs { 'pool_address' : string }
export interface InputCoin { 'coin' : CoinBalance, 'from' : string }
export interface Intention {
  'input_coins' : Array<InputCoin>,
  'output_coins' : Array<OutputCoin>,
  'action' : string,
  'exchange_id' : string,
  'pool_utxo_spend' : Array<string>,
  'action_params' : string,
  'nonce' : bigint,
  'pool_utxo_receive' : Array<string>,
  'pool_address' : string,
}
export interface IntentionSet {
  'tx_fee_in_sats' : bigint,
  'initiator_address' : string,
  'intentions' : Array<Intention>,
}
export interface NewBlockInfo {
  'block_hash' : string,
  'confirmed_txids' : Array<string>,
  'block_timestamp' : bigint,
  'block_height' : number,
}
export interface OutputCoin { 'to' : string, 'coin' : CoinBalance }
export interface PoolBasic { 'name' : string, 'address' : string }
export interface PoolInfo {
  'key' : string,
  'name' : string,
  'btc_reserved' : bigint,
  'key_derivation_path' : Array<Uint8Array | number[]>,
  'coin_reserved' : Array<CoinBalance>,
  'attributes' : string,
  'address' : string,
  'nonce' : bigint,
  'utxos' : Array<Utxo>,
}
export type Result = { 'Ok' : string } |
  { 'Err' : string };
export type Result_1 = { 'Ok' : null } |
  { 'Err' : string };
export type Result_2 = { 'Ok' : BorrowOffer } |
  { 'Err' : ExchangeError };
export type Result_3 = { 'Ok' : DepositOffer } |
  { 'Err' : ExchangeError };
export interface RollbackTxArgs { 'txid' : string }
export interface Utxo {
  'maybe_rune' : [] | [CoinBalance],
  'sats' : bigint,
  'txid' : string,
  'vout' : number,
}
export interface _SERVICE {
  'execute_tx' : ActorMethod<[ExecuteTxArgs], Result>,
  'get_minimal_tx_value' : ActorMethod<[GetMinimalTxValueArgs], bigint>,
  'get_pool_info' : ActorMethod<[GetPoolInfoArgs], [] | [PoolInfo]>,
  'get_pool_list' : ActorMethod<[], Array<PoolBasic>>,
  'init_pool' : ActorMethod<[], Result_1>,
  'new_block' : ActorMethod<[NewBlockInfo], Result_1>,
  'pre_borrow' : ActorMethod<[string, CoinBalance], Result_2>,
  'pre_deposit' : ActorMethod<[string, CoinBalance], Result_3>,
  'rollback_tx' : ActorMethod<[RollbackTxArgs], Result_1>,
}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];
