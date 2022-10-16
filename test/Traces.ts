import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
// import { anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs'
import { expect } from 'chai'
import { ethers } from 'hardhat'
import faker from 'faker'
import { BigNumber } from 'ethers'
import dayjs from 'dayjs'

enum ERROR {
  ONLY_ADMIN = 'Ownable: caller is not the owner',
  DUPLICATED_TOKEN = 'DuplicatedToken',
  NOT_OWNER_OF_TOKEN = 'NotOwnerOfToken',
  INVALID_721_CONTRACT = 'Invalid721Contract',
  TRANSFER_NOT_ALLOWED = 'TransferNotAllowed',
  INVALID_AMOUNT = 'InvalidAmount',
  INVALID_TOKEN_ID = 'InvalidTokenId',
  HOLD_PERIOD = 'HoldPeriod',
}

// Must be returned in the same order of addToken args
function generateTokenData({
  tokenAddress = faker.finance.ethereumAddress(),
  tokenId = faker.datatype.number(10_000),
  minStake = BigNumber.from(faker.datatype.number(10_000)),
  holdPeriod = dayjs().add(10, 'day').unix(),
} = {}): [string, number, BigNumber, number] {
  return [tokenAddress, tokenId, minStake, holdPeriod]
}

describe('Traces basic', function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployFixture() {
    // Contracts are deployed using the first signer/account by default
    const [deployer, owner] = await ethers.getSigners()
    const FPVaultAddress = faker.finance.ethereumAddress()

    const ERC20Mock = await ethers.getContractFactory('ERC20Mock')
    const erc20mock = await ERC20Mock.deploy('prints', '$prints', 0)

    const Traces = await ethers.getContractFactory('Traces')
    const trace = await Traces.deploy(
      owner.address,
      FPVaultAddress,
      erc20mock.address
    )

    return { trace, deployer, owner, FPVaultAddress }
  }

  describe('Deployment', function () {
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

  describe('Settings', function () {
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
})

describe('Traces admin', function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployFixtureWith721() {
    // Contracts are deployed using the first signer/account by default
    const [deployer, owner, minter1] = await ethers.getSigners()
    const FPVaultAddress = faker.finance.ethereumAddress()

    const ERC20Mock = await ethers.getContractFactory('ERC20Mock')
    const erc20mock = await ERC20Mock.deploy('prints', '$prints', 0)

    const Traces = await ethers.getContractFactory('Traces')
    const trace = await Traces.deploy(
      owner.address,
      FPVaultAddress,
      erc20mock.address
    )

    const ERC721Mock = await ethers.getContractFactory('ERC721Mock')
    const erc721mock = await ERC721Mock.deploy('nft', 'nft', minter1.address)

    const tokenData = generateTokenData({ tokenAddress: erc721mock.address })

    await erc721mock.connect(minter1).mint(FPVaultAddress, tokenData[1])

    return {
      trace,
      deployer,
      owner,
      FPVaultAddress,
      erc721mock,
      minter1,
      tokenData,
    }
  }

  it('returns error when calling addToken without right permission', async function () {
    const { deployer, trace } = await loadFixture(deployFixtureWith721)
    const args = generateTokenData()

    await expect(trace.connect(deployer).addToken(...args)).to.revertedWith(
      ERROR.ONLY_ADMIN
    )
  })

  it('doesnt give error when calling addToken with admin permission', async function () {
    const { owner, trace, tokenData } = await loadFixture(deployFixtureWith721)
    const conn = trace.connect(owner)

    await expect(conn.addToken(...tokenData)).to.not.reverted
  })
  it('returns token struct with right data after calling addToken', async function () {
    const { owner, trace, tokenData } = await loadFixture(deployFixtureWith721)
    const conn = trace.connect(owner)
    const [tokenAddress, tokenId, minStake] = tokenData

    await conn.addToken(...tokenData)

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
  it('returns TokenAdded event after calling addToken', async function () {
    const { owner, trace, FPVaultAddress, minter1, tokenData, erc721mock } =
      await loadFixture(deployFixtureWith721)
    const conn = trace.connect(owner)
    const [tokenAddress, _, minStake, holdPeriod] = tokenData
    const tokenId = 2

    await erc721mock.connect(minter1).mint(FPVaultAddress, tokenId)
    const tx = await conn.addToken(tokenAddress, tokenId, minStake, holdPeriod)
    const { events } = await tx.wait()
    //@ts-ignore
    const [event] = events

    expect(event?.args).to.deep.eq([
      tokenAddress,
      tokenId,
      minStake,
      holdPeriod,
    ])
    expect(event?.args?.tokenAddress).to.match(RegExp(tokenAddress, 'i'))
    expect(event?.args?.tokenId).to.eq(tokenId)
    expect(event?.event).to.eq('TokenAdded')
  })
  it('returns error if token is already added', async function () {
    const { owner, trace, FPVaultAddress, minter1, tokenData, erc721mock } =
      await loadFixture(deployFixtureWith721)
    const conn = trace.connect(owner)
    const [tokenAddress, _, minStake, holdPeriod] = tokenData
    const tokenId = 2

    await erc721mock.connect(minter1).mint(FPVaultAddress, tokenId)
    await conn.addToken(tokenAddress, tokenId, minStake, holdPeriod)

    await expect(
      conn.addToken(tokenAddress, tokenId, minStake, holdPeriod)
    ).to.revertedWithCustomError(trace, ERROR.DUPLICATED_TOKEN)
  })
  it('returns error if FP vault is not owner of the sent token', async function () {
    const { erc721mock, minter1, owner, trace } = await loadFixture(
      deployFixtureWith721
    )
    const [tokenId, _, minStake, holdPeriod] = generateTokenData()
    const conn = trace.connect(owner)

    await erc721mock.connect(minter1).mint(minter1.address, tokenId)

    expect(await erc721mock.ownerOf(tokenId)).to.eq(minter1.address)

    await expect(
      conn.addToken(erc721mock.address, tokenId, minStake, holdPeriod)
    ).to.revertedWithCustomError(trace, ERROR.NOT_OWNER_OF_TOKEN)
  })
  // unstaked wtoken
  // delete unstaked wtoken
})

describe('Traces functionality', function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployFixture() {
    // Contracts are deployed using the first signer/account by default
    const [deployer, owner, minter1, staker1] = await ethers.getSigners()
    const FPVaultAddress = faker.finance.ethereumAddress()
    const amount = 1_000_000

    const ERC721Mock = await ethers.getContractFactory('ERC721Mock')
    const erc721mock = await ERC721Mock.deploy('nft', 'nft', minter1.address)

    const ERC20Mock = await ethers.getContractFactory('ERC20Mock')
    const erc20mock = await ERC20Mock.deploy(
      'prints',
      '$prints',
      ethers.utils.parseUnits(amount.toString(), 18)
    )

    const Traces = await ethers.getContractFactory('Traces')
    const traces = await Traces.deploy(
      owner.address,
      FPVaultAddress,
      erc20mock.address
    )

    const tokenData = generateTokenData({
      tokenAddress: erc721mock.address,
      minStake: ethers.utils.parseUnits('100000', 18),
    })

    await Promise.all([
      erc721mock.connect(minter1).mint(FPVaultAddress, tokenData[1]),
      erc20mock
        .connect(staker1)
        .mint(staker1.address, ethers.utils.parseUnits(amount.toString())),
    ])

    return {
      traces,
      deployer,
      owner,
      FPVaultAddress,
      erc721mock,
      minter1,
      tokenData,
      erc20mock,
      amount,
      staker1,
    }
  }

  describe('Mint an WNFT', async function () {
    describe('returns error when: ', async function () {
      it('user doesnt executed allowance to transfer $ERC20token to stake', async function () {
        const { traces, owner, tokenData, staker1 } = await loadFixture(
          deployFixture
        )
        const [contractAddress, nftId] = tokenData

        await traces.connect(owner).addToken(...tokenData)

        await expect(
          traces
            .connect(staker1)
            .outbid(contractAddress, nftId, ethers.utils.parseUnits('100', 18))
        ).to.revertedWithCustomError(traces, ERROR.TRANSFER_NOT_ALLOWED)
      })
      it('user doesnt have enough $ERC20 token to stake', async function () {
        const { traces, owner, tokenData, staker1, erc20mock } =
          await loadFixture(deployFixture)
        const [contractAddress, nftId, amount] = tokenData

        await traces.connect(owner).addToken(...tokenData)
        await erc20mock.connect(staker1).approve(traces.address, amount)

        await expect(
          traces
            .connect(staker1)
            .outbid(contractAddress, nftId, ethers.utils.parseUnits('100', 18))
        ).to.revertedWithCustomError(traces, ERROR.INVALID_AMOUNT)
      })
      it('NFT is not listed', async function () {
        const { traces, tokenData, staker1, erc20mock } = await loadFixture(
          deployFixture
        )
        const [contractAddress, nftId, amount] = tokenData

        await erc20mock.connect(staker1).approve(traces.address, amount)
        await expect(
          traces
            .connect(staker1)
            .outbid(contractAddress, nftId, ethers.utils.parseUnits('100', 18))
        ).to.revertedWithCustomError(traces, ERROR.INVALID_TOKEN_ID)
      })
      // it('NFT is on guarantee hold time', async function () {
      //   const { traces, owner, tokenData, staker1, erc20mock } =
      //     await loadFixture(deployFixture)
      //   const [contractAddress, nftId, amount] = tokenData

      //   await Promise.all([
      //     traces.connect(owner).addToken(...tokenData),
      //     erc20mock.connect(staker1).approve(traces.address, amount),
      //   ])
      //   await expect(
      //     traces.connect(staker1).outbid(contractAddress, nftId, amount)
      //   ).to.revertedWithCustomError(traces, ERROR.HOLD_PERIOD)
      // })
    })
    it('stakes the user token and increase contract balance', async function () {
      const { traces, owner, tokenData, staker1, erc20mock } =
        await loadFixture(deployFixture)
      const [contractAddress, nftId, amount] = tokenData
      const tracesBalance = await erc20mock.balanceOf(traces.address)

      await Promise.all([
        traces.connect(owner).addToken(...tokenData),
        erc20mock.connect(staker1).approve(traces.address, amount),
      ])
      await traces.connect(staker1).outbid(contractAddress, nftId, amount)

      expect(await erc20mock.balanceOf(traces.address)).to.eq(
        tracesBalance.add(amount)
      )
    })
    it('stakes the user token and user balance is decreased', async function () {
      const { traces, owner, tokenData, staker1, erc20mock } =
        await loadFixture(deployFixture)
      const [contractAddress, nftId, amount] = tokenData
      const userBalance = await erc20mock.balanceOf(staker1.address)

      await Promise.all([
        traces.connect(owner).addToken(...tokenData),
        erc20mock.connect(staker1).approve(traces.address, amount),
      ])
      await traces.connect(staker1).outbid(contractAddress, nftId, amount)

      expect(await erc20mock.balanceOf(staker1.address)).to.eq(
        userBalance.sub(amount)
      )
    })
    // it('mints a wrapped nft to the user', async function () {})
    // mint wnft
  })
  // unstaked wtoken
  // delete unstaked wtoken
  // getUri with proxy string
})
