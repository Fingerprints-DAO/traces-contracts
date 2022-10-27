import dayjs from 'dayjs'
import { BigNumber } from 'ethers'
import faker from 'faker'

// Must be returned in the same order of addToken args
export function generateTokenData({
  tokenAddress = faker.finance.ethereumAddress(),
  tokenId = faker.datatype.number(10_000),
  minStake = BigNumber.from(faker.datatype.number(10_000)),
  holdPeriod = dayjs.duration({ days: 10 }).asSeconds(),
} = {}): [string, number, BigNumber, number] {
  return [tokenAddress, tokenId, minStake, holdPeriod]
}
