import dayjs from 'dayjs'
import { BigNumber } from 'ethers'
import { parseUnits } from 'ethers/lib/utils'
import faker from 'faker'

// Must be returned in the same order of addToken args
export function generateTokenData({
  tokenAddress = faker.finance.ethereumAddress(),
  tokenId = faker.datatype.number(10_000),
  minStake = parseUnits(faker.datatype.number(10_000).toString()),
  holdPeriod = dayjs.duration({ days: 10 }).asSeconds(),
  dutchMultiplier = faker.datatype.number(10),
  dutchAuctionDuration = dayjs.duration({ days: 10 }).asSeconds(),
} = {}): [string, number, BigNumber, number, number, number] {
  return [
    tokenAddress,
    tokenId,
    minStake,
    holdPeriod,
    dutchMultiplier,
    dutchAuctionDuration,
  ]
}
