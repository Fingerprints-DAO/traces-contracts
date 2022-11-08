import { task } from 'hardhat/config'

async function delay(seconds: number) {
  return new Promise((resolve) => setTimeout(resolve, 1000 * seconds))
}

task('deploy-test-token', 'Deploy ERC-20 Custom tokens').setAction(
  async (_, { ethers }) => {
    const [deployer] = await ethers.getSigners()
    console.log(`Deploying from address ${deployer.address}`)

    const token = await (
      await ethers.getContractFactory('ERC20Mock', deployer)
    ).deploy(deployer.address, 'Fingerprint Tokens', '$PRINTS', 1_000_000)
    console.log(`$Prints deployed to: ${token.address}`)

    console.log('Done')
  }
)
