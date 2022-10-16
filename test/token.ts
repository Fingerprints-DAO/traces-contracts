import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import dayjs from 'dayjs'
import { BigNumber } from 'ethers'
import faker from 'faker'
import { Traces, ERC721Mock } from '../typechain-types'

// Must be returned in the same order of addToken args
export function generateTokenData({
  tokenAddress = faker.finance.ethereumAddress(),
  tokenId = faker.datatype.number(10_000),
  minStake = BigNumber.from(faker.datatype.number(10_000)),
  holdPeriod = dayjs().add(10, 'day').unix(),
} = {}): [string, number, BigNumber, number] {
  return [tokenAddress, tokenId, minStake, holdPeriod]
}
