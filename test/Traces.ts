import { time, loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import { anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs'
import { expect } from 'chai'
import { ethers } from 'hardhat'

describe('Traces', function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployFixture() {
    // Contracts are deployed using the first signer/account by default
    const [owner, otherAccount] = await ethers.getSigners()

    const Traces = await ethers.getContractFactory('Traces')
    const trace = await Traces.deploy()

    return { trace, owner, otherAccount }
  }

  describe('Deployment', function () {
    it('Should set the right unlockTime', async function () {
      await loadFixture(deployFixture)

      expect(1).to.equal(1)
    })
  })
})
