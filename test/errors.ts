export enum ERROR {
  ONLY_ADMIN = 'Ownable: caller is not the owner',
  DUPLICATED_TOKEN = 'DuplicatedToken',
  NOT_OWNER_OF_TOKEN = 'NotOwnerOfToken',
  INVALID_721_CONTRACT = 'Invalid721Contract',
  TRANSFER_NOT_ALLOWED = 'TransferNotAllowed',
  INVALID_AMOUNT = 'InvalidAmount',
  INVALID_TOKEN_ID = 'InvalidTokenId',
  HOLD_PERIOD = 'HoldPeriod',
  STAKE_LOCKED = 'StakeLocked',
  NO_PERMISSION = 'NoPermission',
  INVALID_ERC20_ARGS = 'Invalid address or decimals',
}
