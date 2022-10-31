import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers'
import { expect } from 'chai'
import { ethers, network } from 'hardhat'
import faker from 'faker'
import dayjs from 'dayjs'
import duration from 'dayjs/plugin/duration'

dayjs.extend(duration)

import { ERROR } from './errors'
import { generateTokenData } from './token'

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
    const { tokenCount } = await trace.collection(tokenAddress)

    expect((await conn.wnftList(tokenAddress, tokenId)).ogTokenId).to.eq(
      tokenId
    )
    expect((await conn.wnftList(tokenAddress, tokenId)).tokenId).to.eq(
      tokenCount.sub(1)
    )
    expect(
      (await conn.wnftList(tokenAddress, tokenId)).ogTokenAddress
    ).to.match(new RegExp(tokenAddress, 'i'))
    expect((await conn.wnftList(tokenAddress, tokenId)).minStakeValue).to.eq(
      minStake
    )
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
    const [_x, event] = events
    const { tokenCount } = await trace.collection(tokenAddress)

    expect(event?.args).to.deep.eq([
      tokenAddress,
      tokenId,
      tokenCount.sub(1),
      minStake,
      holdPeriod,
    ])
    expect(event?.args?.ogTokenAddress).to.match(RegExp(tokenAddress, 'i'))
    expect(event?.args?.ogTokenId).to.eq(tokenId)
    expect(event?.args?.tokenId).to.eq(tokenCount.sub(1))
    expect(event?.event).to.eq('TokenAdded')
  })
  it('mints the wnft to the contract after adding the data', async function () {
    const { owner, trace, FPVaultAddress, minter1, tokenData, erc721mock } =
      await loadFixture(deployFixtureWith721)
    const conn = trace.connect(owner)
    const [tokenAddress, _, minStake, holdPeriod] = tokenData
    const tokenId = 2

    await erc721mock.connect(minter1).mint(FPVaultAddress, tokenId)

    expect(await trace.balanceOf(trace.address)).to.eq(0)
    await conn.addToken(tokenAddress, tokenId, minStake, holdPeriod)
    const { tokenCount } = await trace.collection(tokenAddress)

    expect(await trace.balanceOf(trace.address)).to.eq(1)
    expect(await trace.ownerOf(tokenCount.sub(1))).to.eq(trace.address)
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
    const [deployer, owner, minter1, staker1, staker2] =
      await ethers.getSigners()
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
      erc20mock
        .connect(staker2)
        .mint(staker2.address, ethers.utils.parseUnits(amount.toString())),
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
      staker2,
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
      it('NFT is on guarantee hold time', async function () {
        const { traces, owner, tokenData, staker1, staker2, erc20mock } =
          await loadFixture(deployFixture)
        const [contractAddress, nftId, amount] = tokenData

        await Promise.all([
          traces.connect(owner).addToken(...tokenData),
          erc20mock.connect(staker1).approve(traces.address, amount),
          erc20mock.connect(staker2).approve(traces.address, amount),
        ])
        await traces.connect(staker1).outbid(contractAddress, nftId, amount)

        await expect(
          traces.connect(staker2).outbid(contractAddress, nftId, amount)
        ).to.revertedWithCustomError(traces, ERROR.HOLD_PERIOD)
      })
    })
    describe('outbid()', async function () {
      it('increase contract balance when user stakes', async function () {
        const { traces, owner, tokenData, staker1, erc20mock } =
          await loadFixture(deployFixture)
        const [contractAddress, nftId, amount] = tokenData
        const tracesBalance = await erc20mock.balanceOf(traces.address)

        await Promise.all([
          traces.connect(owner).addToken(contractAddress, nftId, amount, 0),
          erc20mock.connect(staker1).approve(traces.address, amount),
        ])
        await traces.connect(staker1).outbid(contractAddress, nftId, amount)

        expect(await erc20mock.balanceOf(traces.address)).to.eq(
          tracesBalance.add(amount)
        )
      })
      it('decreases user balance when user stakes token', async function () {
        const { traces, owner, tokenData, staker1, erc20mock } =
          await loadFixture(deployFixture)
        const [contractAddress, nftId, amount] = tokenData
        const userBalance = await erc20mock.balanceOf(staker1.address)

        await Promise.all([
          traces.connect(owner).addToken(contractAddress, nftId, amount, 0),
          erc20mock.connect(staker1).approve(traces.address, amount),
        ])
        await traces.connect(staker1).outbid(contractAddress, nftId, amount)

        expect(await erc20mock.balanceOf(staker1.address)).to.eq(
          userBalance.sub(amount)
        )
      })
      it('allows user to mint after hold period', async function () {
        const { traces, owner, tokenData, staker1, erc20mock } =
          await loadFixture(deployFixture)
        const [contractAddress, nftId, amount] = tokenData
        const latestBlockTimestamp = (await time.latest()) * 1000
        // const latestBlockTimestamp = new Date()
        const holdPeriod = dayjs(latestBlockTimestamp).add(2, 'hour')

        await Promise.all([
          traces
            .connect(owner)
            .addToken(contractAddress, nftId, amount, holdPeriod.unix()),
          erc20mock.connect(staker1).approve(traces.address, amount),
        ])

        await time.increaseTo(dayjs(latestBlockTimestamp).add(2, 'hour').unix())

        expect(
          await traces.connect(staker1).outbid(contractAddress, nftId, amount)
        ).to.not.reverted
        // await network.provider.send('hardhat_reset')
        // await snapshot.restore()
      })
      it('transfers the wnft to the user when outbidding', async function () {
        const { traces, owner, tokenData, staker1, erc20mock } =
          await loadFixture(deployFixture)
        const [contractAddress, nftId, amount] = tokenData
        const latestBlockTimestamp = await time.latest()

        const tx = await traces
          .connect(owner)
          .addToken(contractAddress, nftId, amount, latestBlockTimestamp)
        const { events = [] } = await tx.wait()
        const [_, event] = events
        await erc20mock.connect(staker1).approve(traces.address, amount)

        await traces.connect(staker1).outbid(contractAddress, nftId, amount)

        expect(await traces.balanceOf(staker1.address)).to.eq(1)
        expect(await traces.ownerOf(event?.args?.tokenId)).to.eq(
          staker1.address
        )
      })
      it('transfers the wnft to the user when outbidding from another user', async function () {
        const { traces, owner, tokenData, staker1, staker2, erc20mock } =
          await loadFixture(deployFixture)
        const [contractAddress, nftId, amount, holdPeriod] = tokenData
        let latestBlockTimestamp = await time.latest()

        const tx = await traces
          .connect(owner)
          .addToken(contractAddress, nftId, amount, holdPeriod)
        const { events = [] } = await tx.wait()
        const [_, event] = events
        await erc20mock.connect(staker1).approve(traces.address, amount)
        await erc20mock.connect(staker2).approve(traces.address, amount)

        await traces.connect(staker1).outbid(contractAddress, nftId, amount)

        latestBlockTimestamp = await time.latest()
        await time.increaseTo(
          dayjs((latestBlockTimestamp + holdPeriod) * 1000).unix()
        )
        await traces.connect(staker2).outbid(contractAddress, nftId, amount)

        expect(await traces.balanceOf(staker1.address)).to.eq(0)
        expect(await traces.balanceOf(staker2.address)).to.eq(1)
        expect(await traces.ownerOf(event?.args?.tokenId)).to.eq(
          staker2.address
        )
      })
      it('transfers the wnft from owner and give back custom erc20 tokens when the user is outbidded', async function () {
        const { traces, owner, tokenData, staker1, staker2, erc20mock } =
          await loadFixture(deployFixture)
        const [contractAddress, nftId, amount, holdPeriod] = tokenData
        let latestBlockTimestamp = await time.latest()

        const tx = await traces
          .connect(owner)
          .addToken(contractAddress, nftId, amount, holdPeriod)
        const { events = [] } = await tx.wait()
        const [_, event] = events
        await erc20mock.connect(staker1).approve(traces.address, amount)
        await erc20mock.connect(staker2).approve(traces.address, amount)

        await traces.connect(staker1).outbid(contractAddress, nftId, amount)

        latestBlockTimestamp = await time.latest()
        await time.increaseTo(
          dayjs((latestBlockTimestamp + holdPeriod) * 1000).unix()
        )
        await traces.connect(staker2).outbid(contractAddress, nftId, amount)

        expect(await traces.balanceOf(staker1.address)).to.eq(0)
        expect(await traces.balanceOf(staker2.address)).to.eq(1)
        expect(await traces.ownerOf(event?.args?.tokenId)).to.eq(
          staker2.address
        )
      })
    })
  })
  describe('unstake()', async function () {
    async function mintAndStake(
      fixture: Awaited<ReturnType<typeof deployFixture>>
    ) {
      const { traces, owner, tokenData, staker1, erc20mock } = fixture
      const [contractAddress, nftId, amount] = tokenData

      await Promise.all([
        traces.connect(owner).addToken(...tokenData),
        erc20mock.connect(staker1).approve(traces.address, amount),
      ])
      await traces.connect(staker1).outbid(contractAddress, nftId, amount)
      return await traces.wnftList(contractAddress, nftId)
    }
    it('returns error if user is not the wnft owner', async function () {
      const fixture = await loadFixture(deployFixture)
      const { traces, staker2 } = fixture
      const wNFT = await mintAndStake(fixture)

      await expect(
        traces.connect(staker2).unstake(wNFT.tokenId)
      ).to.revertedWithCustomError(traces, ERROR.NO_PREMISSION)
    })
    it('returns error if user is not the wnft owner', async function () {
      const fixture = await loadFixture(deployFixture)
      const { traces, staker2 } = fixture
      const wNFT = await mintAndStake(fixture)

      await expect(
        traces.connect(staker2).unstake(wNFT.tokenId)
      ).to.revertedWithCustomError(traces, ERROR.NO_PREMISSION)
    })
    it('unstakes user $prints and return the wnft', async function () {
      const fixture = await loadFixture(deployFixture)
      const { traces, staker1, erc20mock } = fixture
      const wNFT = await mintAndStake(fixture)
      const stakedAmount = wNFT.minStakeValue
      const stakerBalance = await erc20mock.balanceOf(staker1.address)

      await expect(traces.connect(staker1).unstake(wNFT.tokenId)).to.not
        .reverted
      expect(await traces.balanceOf(staker1.address)).to.eq(0)
      expect(await erc20mock.balanceOf(staker1.address)).to.eq(
        stakerBalance.add(stakedAmount)
      )
    })
  })
  // unstaked wtoken
  // delete unstaked wtoken
  // getUri with proxy string
})
