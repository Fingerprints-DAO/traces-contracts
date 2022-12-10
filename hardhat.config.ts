import * as dotenv from 'dotenv'
import { HardhatUserConfig, task } from 'hardhat/config'
import '@nomicfoundation/hardhat-toolbox'
import 'hardhat-watcher'
import 'hardhat-contract-sizer'
import 'hardhat-docgen'
import 'hardhat-gas-reporter'
import 'dotenv/config'
import './tasks'

// import 'hardhat-docgen'

dotenv.config()

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task('accounts', 'Prints the list of accounts', async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners()

  for (const account of accounts) {
    console.log(account.address)
  }
})

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more
const accounts = {
  mnemonic:
    process.env.MNEMONIC || 'abc abc abc abc abc abc abc abc abc abc abc abc',
}

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.17',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },

  networks: {
    // hardhat: {
    //   initialBaseFeePerGas: 0,
    // },
    goerli: {
      url: `https://goerli.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : accounts,
      // accounts,
      chainId: 5,
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: 'USD',
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
  watcher: {
    test: {
      tasks: [{ command: 'test', params: { testFiles: ['{path}'] } }],
      files: ['./test/**/*'],
      verbose: false,
      clearOnStart: true,
      runOnLaunch: false,
    },
  },
  contractSizer: {
    disambiguatePaths: false,
    runOnCompile: true,
    strict: process.env.CONTRACT_SIZER_STRICT_DISABLE ? false : true,
  },
  docgen: {
    path: './docs',
    clear: true,
    runOnCompile: true,
  },
}

export default config
