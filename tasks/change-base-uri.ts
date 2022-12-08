import { task, types } from 'hardhat/config'

task('change-base-uri', 'Set base URI')
  .addOptionalParam(
    'tracesAddress',
    'The `Traces` contract address',
    '0x6DFFa2526803100Cc5fa8e8baBB6a9956496a360',
    types.string
  )
  .addParam('url', 'New base url', undefined, types.string)
  .setAction(async ({ tracesAddress, url }, { ethers }) => {
    const tracesFactory = await ethers.getContractFactory('Traces')
    const tracesContract = tracesFactory.attach(tracesAddress)

    await tracesContract.setBaseURI(url)

    console.log(`Base URI set to ${url}`)
  })
