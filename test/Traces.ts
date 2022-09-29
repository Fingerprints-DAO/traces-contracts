import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
// import { anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs'
import { expect } from 'chai'
import { ethers } from 'hardhat'
import faker from 'faker'

enum ERROR {
  ONLY_ADMIN = 'Ownable: caller is not the owner',
}

describe('Traces', function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployFixture() {
    // Contracts are deployed using the first signer/account by default
    const [deployer, owner] = await ethers.getSigners()
    const FPVaultAddress = faker.finance.ethereumAddress()

    const Traces = await ethers.getContractFactory('Traces')
    const trace = await Traces.deploy(owner.address, FPVaultAddress)

    return { trace, deployer, owner, FPVaultAddress }
  }

  // Must be returned in the same order of addToken args
  function generateTokenData({
    tokenAddress = faker.finance.ethereumAddress(),
    tokenId = faker.datatype.number(10_000),
    minStake = faker.datatype.number(10_000),
  } = {}): [string, number, number] {
    return [tokenAddress, tokenId, minStake]
  }

  describe('Traces Deployment', function () {
    it('deploys the contract extending ERC721', async function () {
      const { trace } = await loadFixture(deployFixture)

      expect(await trace.totalSupply()).to.eq(0)
    })
    it('transfers contract ownership to owner address sent', async function () {
      const { trace, owner } = await loadFixture(deployFixture)

      expect(await trace.owner()).to.eq(owner.address)
    })
    it('saves FP address when deploying', async function () {
      const { trace, FPVaultAddress } = await loadFixture(deployFixture)

      expect(await trace.vaultAddress()).to.match(
        new RegExp(FPVaultAddress, 'i')
      )
    })
  })

  describe('Traces', function () {
    it('returns error when calling setVaultAddress without right permission', async function () {
      const { trace } = await loadFixture(deployFixture)

      await expect(trace.setVaultAddress(faker.finance.ethereumAddress())).to
        .reverted
    })
    it('returns properly the new vaultAddress after executed setVaultAddress', async function () {
      const { trace, owner } = await loadFixture(deployFixture)
      const newVaultAddress = faker.finance.ethereumAddress()

      await trace.connect(owner).setVaultAddress(newVaultAddress)

      expect(await trace.vaultAddress()).to.match(
        new RegExp(newVaultAddress, 'i')
      )
    })
  })

  describe('Traces admin', function () {
    it('returns error when calling addToken without right permission', async function () {
      const { deployer, trace } = await loadFixture(deployFixture)
      const args = generateTokenData()

      await expect(trace.connect(deployer).addToken(...args)).to.revertedWith(
        ERROR.ONLY_ADMIN
      )
    })
    it('doesnt give error when calling addToken with admin permission', async function () {
      const { owner, trace } = await loadFixture(deployFixture)
      const conn = trace.connect(owner)
      const args = generateTokenData()

      await expect(conn.addToken(...args)).to.not.reverted
    })
    it('returns token struct with right data after calling addToken', async function () {
      const { owner, trace } = await loadFixture(deployFixture)
      const conn = trace.connect(owner)
      const [tokenAddress, tokenId, minStake] = generateTokenData()

      await conn.addToken(tokenAddress, tokenId, minStake)

      expect((await conn.enabledTokens(tokenAddress, tokenId)).tokenId).to.eq(
        tokenId
      )
      expect(
        (await conn.enabledTokens(tokenAddress, tokenId)).tokenAddress
      ).to.match(new RegExp(tokenAddress, 'i'))
      expect(
        (await conn.enabledTokens(tokenAddress, tokenId)).minStakeValue
      ).to.eq(minStake)
    })
    it('returns token struct with right data after calling addToken', async function () {
      const { owner, trace } = await loadFixture(deployFixture)
      const conn = trace.connect(owner)
      const [tokenAddress, tokenId, minStake] = generateTokenData()

      const tx = await conn.addToken(tokenAddress, tokenId, minStake)
      const { events } = await tx.wait()
      //@ts-ignore
      const [event] = events

      expect(event?.args).to.deep.eq([tokenAddress, tokenId, minStake])
      expect(event?.args?.tokenAddress).to.match(RegExp(tokenAddress, 'i'))
      expect(event?.args?.tokenId).to.eq(tokenId)
      expect(event?.event).to.eq('TokenAdded')
    })
    // mint token
    // check if wrapped token exists
    // unstaked wtoken
    // delete unstaked wtoken
    // getUri with proxy string
  })
})
