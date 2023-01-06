import { task, types } from 'hardhat/config'
import { contractAddresses } from '../logs/deploy.json'

task('get-price', 'Get wnft price')
  .addOptionalParam(
    'traces',
    'The `Traces` contract address',
    contractAddresses.Traces,
    types.string
  )
  .addParam('wnftId', 'wnft it', undefined, types.string)
  .setAction(async ({ traces, wnftId }, { ethers }) => {
    // get contract interface
    const nftFactory = await ethers.getContractFactory('Traces')
    // set contract address
    const nftContract = nftFactory.attach(traces)

    const price = await nftContract.getWNFTPrice(wnftId)
    console.log('PRICE::', price.toString())
  })
