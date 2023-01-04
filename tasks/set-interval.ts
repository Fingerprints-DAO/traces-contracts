import { task, types } from 'hardhat/config'

task('set-interval', 'Change mining interval')
  .addOptionalParam(
    'interval',
    'The interval in milliseconds',
    100000,
    types.int
  )
  .setAction(async ({ interval }, { ethers, network }) => {
    await network.provider.send('evm_setAutomine', [false])
    await ethers.provider.send('evm_setIntervalMining', [interval])
  })
