import { task } from 'hardhat/config'
import { Interface, parseUnits } from 'ethers/lib/utils'
import { Contract as EthersContract } from 'ethers'

type LocalContractName = 'ERC20Mock' | 'ERC721Mock' | 'Traces'

interface Contract {
  args?: (string | number | (() => string | undefined))[]
  instance?: EthersContract
  libraries?: () => Record<string, string>
  waitForConfirmation?: boolean
}

task('deploy-local', 'Deploy contracts to hardhat').setAction(
  async (_, { ethers }) => {
    const network = await ethers.provider.getNetwork()
    if (network.chainId !== 31337) {
      console.log(`Invalid chain id. Expected 31337. Got: ${network.chainId}.`)
      return
    }

    const [deployer, DAOVault] = await ethers.getSigners()
    await deployer.getTransactionCount()

    const contracts: Record<LocalContractName, Contract> = {
      ERC20Mock: {
        args: [deployer.address, 'Fingerprint Tokens', '$PRINTS', 1_000_000],
      },
      ERC721Mock: {
        args: [deployer.address, 'Fingerprint NFTs', 'FRP', 1],
      },
      Traces: {
        args: [
          deployer.address,
          DAOVault.address,
          () => contracts.ERC20Mock.instance?.address,
        ],
      },
    }

    for (const [name, contract] of Object.entries(contracts)) {
      const factory = await ethers.getContractFactory(name, {
        libraries: contract?.libraries?.(),
      })

      const deployedContract = await factory.deploy(
        ...(contract.args?.map((a) => (typeof a === 'function' ? a() : a)) ??
          [])
      )

      if (contract.waitForConfirmation) {
        await deployedContract.deployed()
      }

      contracts[name as LocalContractName].instance = deployedContract

      console.log(`${name} contract deployed to ${deployedContract.address}`)
    }

    return contracts
  }
)
