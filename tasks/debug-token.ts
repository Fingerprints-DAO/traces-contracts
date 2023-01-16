import { task, types } from 'hardhat/config'
import { contractAddresses } from '../logs/deploy.json'

task('debug-tokens', 'Debug tokens')
  .addOptionalParam(
    'traces',
    'The `Traces` contract address',
    contractAddresses.Traces,
    types.string
  )
  .setAction(async ({ traces, wnftId }, { ethers }) => {
    // get contract interface
    const nftFactory = await ethers.getContractFactory('Traces')
    // set contract address
    const nftContract = nftFactory.attach(traces)

    // const wnft = await nftContract.wnftList(
    //   '0x800d6d8fa51e2c998a17149532b60703a9e6a2d7',
    //   '32'
    // )

    const wnft = await nftContract.addToken(
      '0x800d6d8fa51e2c998a17149532b60703a9e6a2d7',
      '32',
      100,
      100,
      100,
      100
    )
    // 100005
    console.log('PRICE::', wnft)
  })
