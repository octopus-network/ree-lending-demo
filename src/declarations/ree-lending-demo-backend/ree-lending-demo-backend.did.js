export const idlFactory = ({ IDL }) => {
  const CoinBalance = IDL.Record({ 'id' : IDL.Text, 'value' : IDL.Nat });
  const InputCoin = IDL.Record({ 'coin' : CoinBalance, 'from' : IDL.Text });
  const OutputCoin = IDL.Record({ 'to' : IDL.Text, 'coin' : CoinBalance });
  const Utxo = IDL.Record({
    'coins' : IDL.Vec(CoinBalance),
    'sats' : IDL.Nat64,
    'txid' : IDL.Text,
    'vout' : IDL.Nat32,
  });
  const Intention = IDL.Record({
    'input_coins' : IDL.Vec(InputCoin),
    'output_coins' : IDL.Vec(OutputCoin),
    'action' : IDL.Text,
    'exchange_id' : IDL.Text,
    'pool_utxo_spent' : IDL.Vec(IDL.Text),
    'action_params' : IDL.Text,
    'nonce' : IDL.Nat64,
    'pool_address' : IDL.Text,
    'pool_utxo_received' : IDL.Vec(Utxo),
  });
  const IntentionSet = IDL.Record({
    'tx_fee_in_sats' : IDL.Nat64,
    'initiator_address' : IDL.Text,
    'intentions' : IDL.Vec(Intention),
  });
  const ExecuteTxArgs = IDL.Record({
    'zero_confirmed_tx_queue_length' : IDL.Nat32,
    'txid' : IDL.Text,
    'intention_set' : IntentionSet,
    'intention_index' : IDL.Nat32,
    'psbt_hex' : IDL.Text,
  });
  const Result = IDL.Variant({ 'Ok' : IDL.Text, 'Err' : IDL.Text });
  const GetPoolInfoArgs = IDL.Record({ 'pool_address' : IDL.Text });
  const PoolInfo = IDL.Record({
    'key' : IDL.Text,
    'name' : IDL.Text,
    'btc_reserved' : IDL.Nat64,
    'key_derivation_path' : IDL.Vec(IDL.Vec(IDL.Nat8)),
    'coin_reserved' : IDL.Vec(CoinBalance),
    'attributes' : IDL.Text,
    'address' : IDL.Text,
    'nonce' : IDL.Nat64,
    'utxos' : IDL.Vec(Utxo),
  });
  const PoolBasic = IDL.Record({ 'name' : IDL.Text, 'address' : IDL.Text });
  const Result_1 = IDL.Variant({ 'Ok' : IDL.Null, 'Err' : IDL.Text });
  const NewBlockInfo = IDL.Record({
    'block_hash' : IDL.Text,
    'confirmed_txids' : IDL.Vec(IDL.Text),
    'block_timestamp' : IDL.Nat64,
    'block_height' : IDL.Nat32,
  });
  const BorrowOffer = IDL.Record({
    'pool_utxo' : Utxo,
    'nonce' : IDL.Nat64,
    'input_runes' : CoinBalance,
    'output_btc' : CoinBalance,
  });
  const ExchangeError = IDL.Variant({
    'InvalidSignPsbtArgs' : IDL.Text,
    'Overflow' : IDL.Null,
    'PoolStateExpired' : IDL.Nat64,
    'TooSmallFunds' : IDL.Null,
    'InvalidPool' : IDL.Null,
    'InvalidTxid' : IDL.Null,
    'EmptyPool' : IDL.Null,
    'InvalidState' : IDL.Text,
  });
  const Result_2 = IDL.Variant({ 'Ok' : BorrowOffer, 'Err' : ExchangeError });
  const DepositOffer = IDL.Record({
    'pool_utxo' : IDL.Opt(Utxo),
    'nonce' : IDL.Nat64,
  });
  const Result_3 = IDL.Variant({ 'Ok' : DepositOffer, 'Err' : ExchangeError });
  const RollbackTxArgs = IDL.Record({
    'txid' : IDL.Text,
    'reason_code' : IDL.Text,
  });
  return IDL.Service({
    'execute_tx' : IDL.Func([ExecuteTxArgs], [Result], []),
    'get_pool_info' : IDL.Func(
        [GetPoolInfoArgs],
        [IDL.Opt(PoolInfo)],
        ['query'],
      ),
    'get_pool_list' : IDL.Func([], [IDL.Vec(PoolBasic)], ['query']),
    'init_pool' : IDL.Func([], [Result_1], []),
    'new_block' : IDL.Func([NewBlockInfo], [Result_1], []),
    'pre_borrow' : IDL.Func([IDL.Text, CoinBalance], [Result_2], ['query']),
    'pre_deposit' : IDL.Func([IDL.Text, CoinBalance], [Result_3], ['query']),
    'rollback_tx' : IDL.Func([RollbackTxArgs], [Result_1], []),
  });
};
export const init = ({ IDL }) => { return []; };
