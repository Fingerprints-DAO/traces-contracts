import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
// import { anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs'
import { expect } from 'chai'
import { ethers } from 'hardhat'
import faker from 'faker'

describe('Traces', function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployFixture() {
    // Contracts are deployed using the first signer/account by default
    const [owner, otherAccount] = await ethers.getSigners()
    const FPVaultAddress = faker.finance.ethereumAddress()

    const Traces = await ethers.getContractFactory('Traces')
    const trace = await Traces.deploy(otherAccount.address, FPVaultAddress)

    return { trace, owner, otherAccount, FPVaultAddress }
  }

  describe('Traces Deployment', function () {
    it('deploys the contract extending ERC721', async function () {
      const { trace } = await loadFixture(deployFixture)

      expect(await trace.totalSupply()).to.eq(0)
    })
    it('transfers contract ownership to owner address sent', async function () {
      const { trace, otherAccount } = await loadFixture(deployFixture)

      expect(await trace.owner()).to.eq(otherAccount.address)
    })
    it('saves FP address when deploying', async function () {
      const { trace, FPVaultAddress } = await loadFixture(deployFixture)

      expect(await trace.vaultAddress()).to.match(
        new RegExp(FPVaultAddress, 'i')
      )
    })
  })
})
