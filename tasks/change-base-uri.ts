import { task, types } from 'hardhat/config'
import { contractAddresses } from '../logs/deploy.json'

task('change-base-uri', 'Set base URI')
  .addOptionalParam(
    'tracesAddress',
    'The `Traces` contract address',
    contractAddresses.Traces,
    types.string
  )
  .addParam('url', 'New base url', undefined, types.string)
  .setAction(async ({ tracesAddress, url }, { ethers }) => {
    const tracesFactory = await ethers.getContractFactory('Traces')
    const tracesContract = tracesFactory.attach(tracesAddress)

    await tracesContract.setBaseURI(url)

    console.log(`Base URI set to ${url}`)
  })
