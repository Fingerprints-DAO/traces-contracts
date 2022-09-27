import { ethers } from 'hardhat'

async function main() {
  const Traces = await ethers.getContractFactory('Traces')
  const trace = await Traces.deploy()

  await trace.deployed()

  console.log(`Traces deployed to ${trace.address}`)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
