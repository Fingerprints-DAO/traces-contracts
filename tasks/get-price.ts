import { task, types } from 'hardhat/config'

task('get-price', 'Get wnft price')
  .addOptionalParam(
    'traces',
    'The `Traces` contract address',
    '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
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
