import { task } from 'hardhat/config'

task('set-interval', 'Change mining interval').setAction(
  async (_, { ethers, network }) => {
    await network.provider.send('evm_setAutomine', [false])
    await ethers.provider.send('evm_setIntervalMining', [100000])
  }
)
