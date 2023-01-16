import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers'
import { expect } from 'chai'
import { ethers } from 'hardhat'
import faker from 'faker'
import dayjs from 'dayjs'
import duration from 'dayjs/plugin/duration'

dayjs.extend(duration)

import { ERROR } from './errors'
import { generateTokenData } from './token'
import { formatUnits, parseUnits } from 'ethers/lib/utils'
import { BigNumber } from 'ethers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'

const getAccessControlError = (address: string, role: string) =>
  `AccessControl: account ${address.toLowerCase()} is missing role ${role}`

describe('Traces basic', function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployFixture() {
    // Contracts are deployed using the first signer/account by default
    const [deployer, owner, staker1] = await ethers.getSigners()
    const FPVaultAddress = faker.finance.ethereumAddress()
    const baseURI = `${faker.internet.url()}/`

    const ERC20Mock = await ethers.getContractFactory('ERC20Mock')
    const erc20mock = await ERC20Mock.deploy(
      deployer.address,
      'prints',
      '$prints',
      0
    )

    const Traces = await ethers.getContractFactory('Traces')

    const traces = await Traces.deploy()
    await traces.initialize(
      owner.address,
      FPVaultAddress,
      erc20mock.address,
      baseURI
    )

    return { traces, deployer, owner, FPVaultAddress, staker1 }
  }

  describe('Deployment', function () {
    it('deploys the contract extending ERC721', async function () {
      const { traces } = await loadFixture(deployFixture)

      expect(await traces.totalSupply()).to.eq(0)
    })
    it('checks DEFAULT_ADMIN_ROLE to the deployer', async function () {
      const { traces, owner } = await loadFixture(deployFixture)

      expect(await traces.hasRole(traces.DEFAULT_ADMIN_ROLE(), owner.address))
        .to.be.true
    })
    it('checks EDITOR_ROLE to the deployer', async function () {
      const { traces, owner } = await loadFixture(deployFixture)

      expect(await traces.hasRole(traces.EDITOR_ROLE(), owner.address)).to.be
        .true
    })
    it('saves FP address when deploying', async function () {
      const { traces, FPVaultAddress } = await loadFixture(deployFixture)

      expect(await traces.vaultAddress()).to.match(
        new RegExp(FPVaultAddress, 'i')
      )
    })
  })

  describe('Settings', function () {
    it('returns error when calling setVaultAddress without right permission', async function () {
      const { traces } = await loadFixture(deployFixture)

      await expect(traces.setVaultAddress(faker.finance.ethereumAddress())).to
        .reverted
    })
    it('returns properly the new vaultAddress after executed setVaultAddress', async function () {
      const { traces, owner } = await loadFixture(deployFixture)
      const newVaultAddress = faker.finance.ethereumAddress()

      await traces.connect(owner).setVaultAddress(newVaultAddress)

      expect(await traces.vaultAddress()).to.match(
        new RegExp(newVaultAddress, 'i')
      )
    })
    it('allows admin to pause the contract', async () => {
      const { traces, owner } = await loadFixture(deployFixture)

      await traces.connect(owner).pause()
      expect(await traces.paused()).to.be.equal(true)
    })
    it('allows admin to unpause the contract', async () => {
      const { traces, owner } = await loadFixture(deployFixture)

      await traces.connect(owner).pause()
      await traces.connect(owner).unpause()
      expect(await traces.paused()).to.be.equal(false)
    })
    it('doesnt allow editor to pause the contract', async () => {
      const { traces, owner, staker1 } = await loadFixture(deployFixture)

      const EDITOR_ROLE = await traces.connect(owner).EDITOR_ROLE()
      await traces.connect(owner).grantRole(EDITOR_ROLE, staker1.address)
      await expect(traces.connect(staker1).pause()).to.be.reverted
    })
    it('doesnt allow editor to change erc20 settings', async () => {
      const { traces, owner, staker1 } = await loadFixture(deployFixture)

      const EDITOR_ROLE = await traces.connect(owner).EDITOR_ROLE()
      await traces.connect(owner).grantRole(EDITOR_ROLE, staker1.address)
      await expect(
        traces
          .connect(staker1)
          .setERC20Token(faker.finance.ethereumAddress(), 10)
      ).to.be.reverted
    })
    it('throws error if send an invalid address or 0 on setERC20Token()', async () => {
      const { traces, owner } = await loadFixture(deployFixture)

      await expect(
        traces
          .connect(owner)
          .setERC20Token('0x0000000000000000000000000000000000000000', 10)
      ).to.be.revertedWith(ERROR.INVALID_ERC20_ARGS)
      await expect(
        traces.connect(owner).setERC20Token(faker.finance.ethereumAddress(), 1)
      ).to.be.revertedWith(ERROR.INVALID_ERC20_ARGS)
    })
    it('changes correctly the erc20 settings when calling setERC20Token() by owner', async () => {
      const { traces, owner } = await loadFixture(deployFixture)
      const address = faker.finance.ethereumAddress()
      const decimals = BigNumber.from(10).pow(18)

      await traces.connect(owner).setERC20Token(address, decimals)

      expect((await traces.customTokenAddress()).toLowerCase()).to.be.eq(
        address
      )
      expect(await traces.customTokenDecimals()).to.be.eq(decimals)
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
    const baseURI = `${faker.internet.url()}/`

    const ERC20Mock = await ethers.getContractFactory('ERC20Mock')
    const erc20mock = await ERC20Mock.deploy(
      deployer.address,
      'prints',
      '$prints',
      0
    )

    const Traces = await ethers.getContractFactory('Traces')
    const traces = await Traces.deploy()
    await traces.initialize(
      owner.address,
      FPVaultAddress,
      erc20mock.address,
      baseURI
    )

    const ERC721Mock = await ethers.getContractFactory('ERC721Mock')
    const erc721mock = await ERC721Mock.deploy(
      deployer.address,
      'nft',
      'nft',
      minter1.address
    )

    const tokenData = generateTokenData({ tokenAddress: erc721mock.address })

    await erc721mock.connect(minter1).mint(FPVaultAddress, tokenData[1])

    return {
      traces,
      deployer,
      owner,
      FPVaultAddress,
      erc721mock,
      minter1,
      tokenData,
      baseURI,
    }
  }

  it('returns error when calling addToken without right permission', async function () {
    const { deployer, traces } = await loadFixture(deployFixtureWith721)
    const args = generateTokenData()
    const EDITOR_ROLE = await traces.EDITOR_ROLE()

    await expect(traces.connect(deployer).addToken(...args)).to.revertedWith(
      getAccessControlError(deployer.address, EDITOR_ROLE)
    )
  })

  it('doesnt give error when calling addToken with admin permission', async function () {
    const { owner, traces, tokenData } = await loadFixture(deployFixtureWith721)
    const conn = traces.connect(owner)

    await expect(conn.addToken(...tokenData)).to.not.reverted
  })
  it('returns token struct with right data after calling addToken', async function () {
    const { owner, traces, tokenData } = await loadFixture(deployFixtureWith721)
    const conn = traces.connect(owner)
    const [tokenAddress, tokenId, minStake] = tokenData

    await conn.addToken(...tokenData)
    const { totalMinted, id } = await traces.collection(tokenAddress)
    const WNFT = await conn.wnftList(tokenAddress, tokenId)

    expect(WNFT.ogTokenId).to.eq(tokenId)
    expect(WNFT.tokenId).to.eq(id.add(totalMinted).sub(1))
    expect(WNFT.ogTokenAddress).to.match(new RegExp(tokenAddress, 'i'))
    expect(WNFT.firstStakePrice).to.eq(minStake)
  })
  it('returns TokenAdded event after calling addToken', async function () {
    const { owner, traces, FPVaultAddress, minter1, tokenData, erc721mock } =
      await loadFixture(deployFixtureWith721)
    const conn = traces.connect(owner)
    const [tokenAddress, _, minStake, holdPeriod, multiplier, duration] =
      tokenData
    const tokenId = 2

    await erc721mock.connect(minter1).mint(FPVaultAddress, tokenId)
    const tx = await conn.addToken(
      tokenAddress,
      tokenId,
      minStake,
      holdPeriod,
      multiplier,
      duration
    )
    const { events } = await tx.wait()
    //@ts-ignore
    const [_x, , event] = events
    const { totalMinted, id } = await traces.collection(tokenAddress)

    expect(event?.args?.ogTokenAddress).to.match(RegExp(tokenAddress, 'i'))
    expect(event?.args?.ogTokenId).to.eq(tokenId)
    expect(event?.args?.tokenId).to.eq(id.add(totalMinted).sub(1))
    expect(tx)
      .to.emit(traces, 'TokenAdded')
      .withArgs(
        tokenAddress,
        tokenId,
        id.add(totalMinted).sub(1),
        minStake,
        holdPeriod
      )
  })
  it('returns error when trying to get an uri from a token that doesnt exists', async function () {
    const { traces } = await loadFixture(deployFixtureWith721)

    await expect(traces.tokenURI(1000)).to.be.reverted
  })
  it('returns right uri when token exists', async function () {
    const { traces, owner, tokenData, baseURI } = await loadFixture(
      deployFixtureWith721
    )
    const conn = traces.connect(owner)
    const [contractAddress, nftId] = tokenData

    await conn.addToken(...tokenData)
    const WNFT = await traces.wnftList(contractAddress, nftId)

    const tokenURI = await traces.tokenURI(WNFT.tokenId)
    expect(tokenURI).to.eql(`${baseURI}${WNFT.tokenId.toString()}`)
  })
  it('returns error when trying to set an uri without admin role', async function () {
    const { traces } = await loadFixture(deployFixtureWith721)
    const newURI = `${faker.internet.url()}/`

    await expect(traces.setBaseURI(newURI)).to.be.reverted
  })
  it('returns right uri after calling setBaseURI', async function () {
    const { traces, owner, tokenData, baseURI } = await loadFixture(
      deployFixtureWith721
    )
    const conn = traces.connect(owner)
    const [contractAddress, nftId] = tokenData
    const newURI = `${faker.internet.url()}/`

    await conn.addToken(...tokenData)
    await conn.setBaseURI(newURI)

    const WNFT = await traces.wnftList(contractAddress, nftId)

    expect(await traces.tokenURI(WNFT.tokenId)).to.eql(
      `${newURI}${WNFT.tokenId.toString()}`
    )
  })
  it('mints the wnft to the contract after adding the data', async function () {
    const { owner, traces, FPVaultAddress, minter1, tokenData, erc721mock } =
      await loadFixture(deployFixtureWith721)
    const conn = traces.connect(owner)
    const [tokenAddress, _, minStake, holdPeriod, multiplier, duration] =
      tokenData
    const tokenId = 2

    await erc721mock.connect(minter1).mint(FPVaultAddress, tokenId)

    expect(await traces.balanceOf(traces.address)).to.eq(0)
    await conn.addToken(
      tokenAddress,
      tokenId,
      minStake,
      holdPeriod,
      multiplier,
      duration
    )
    const { totalMinted, id } = await traces.collection(tokenAddress)

    expect(await traces.balanceOf(traces.address)).to.eq(1)
    expect(await traces.ownerOf(id.add(totalMinted).sub(1))).to.eq(
      traces.address
    )
  })
  it('adds another collection when adding nft from other collection', async function () {
    const { owner, traces, FPVaultAddress, minter1, tokenData, erc721mock } =
      await loadFixture(deployFixtureWith721)
    const conn = traces.connect(owner)

    const ERC721Mock2 = await ethers.getContractFactory('ERC721Mock')
    const erc721mock2 = await ERC721Mock2.deploy(
      owner.address,
      'nft2',
      'nft2',
      minter1.address
    )

    const tokenId = 2
    const tokenData2 = generateTokenData({
      tokenAddress: erc721mock2.address,
      tokenId,
    })

    await erc721mock.connect(minter1).mint(FPVaultAddress, tokenId)
    await erc721mock2.connect(minter1).mint(FPVaultAddress, tokenId)

    await conn.addToken(...tokenData)
    await conn.addToken(...tokenData2)

    const collection = await traces.collection(tokenData[0])
    const collection2 = await traces.collection(tokenData2[0])

    expect(await traces.balanceOf(traces.address)).to.eq(2)
    expect(
      await traces.ownerOf(collection.id.add(collection.totalMinted).sub(1))
    ).to.eq(traces.address)
    expect(
      await traces.ownerOf(collection2.id.add(collection2.totalMinted).sub(1))
    ).to.eq(traces.address)
    expect(collection.id).to.eq(1_000_000)
    expect(collection2.id).to.eq(2_000_000)
  })
  it('adds 2 of the same collection and get correct ids', async function () {
    const { owner, traces, FPVaultAddress, minter1, tokenData, erc721mock } =
      await loadFixture(deployFixtureWith721)
    const conn = traces.connect(owner)

    const tokenId = 2
    const tokenId2 = 3
    const [tokenAddress, _, minStake, holdPeriod, multiplier, duration] =
      tokenData

    await erc721mock.connect(minter1).mint(FPVaultAddress, tokenId)
    await erc721mock.connect(minter1).mint(FPVaultAddress, tokenId2)

    await conn.addToken(
      tokenAddress,
      tokenId,
      minStake,
      holdPeriod,
      multiplier,
      duration
    )
    await conn.addToken(
      tokenAddress,
      tokenId2,
      minStake,
      holdPeriod,
      multiplier,
      duration
    )

    const collection = await traces.collection(tokenData[0])

    expect(await traces.balanceOf(traces.address)).to.eq(2)
    expect(await traces.ownerOf(1_000_000)).to.eq(traces.address)
    expect(await traces.ownerOf(1_000_001)).to.eq(traces.address)
    expect(collection.id).to.eq(1_000_000)
  })
  it('returns error if token is already added', async function () {
    const { owner, traces, FPVaultAddress, minter1, tokenData, erc721mock } =
      await loadFixture(deployFixtureWith721)
    const conn = traces.connect(owner)
    const [tokenAddress, _, minStake, holdPeriod, multiplier, duration] =
      tokenData
    const tokenId = 2

    await erc721mock.connect(minter1).mint(FPVaultAddress, tokenId)
    await conn.addToken(
      tokenAddress,
      tokenId,
      minStake,
      holdPeriod,
      multiplier,
      duration
    )

    await expect(
      conn.addToken(
        tokenAddress,
        tokenId,
        minStake,
        holdPeriod,
        multiplier,
        duration
      )
    ).to.revertedWithCustomError(traces, ERROR.DUPLICATED_TOKEN)
  })
  it('returns success if delete older wnft and add a new one', async function () {
    const { owner, traces, FPVaultAddress, minter1, tokenData, erc721mock } =
      await loadFixture(deployFixtureWith721)
    const conn = traces.connect(owner)
    const [tokenAddress, tokenId, minStake, holdPeriod, multiplier, duration] =
      tokenData
    const tokenData1 = generateTokenData({
      tokenAddress,
      tokenId: tokenId + 1,
    })
    const tokenData2 = generateTokenData({
      tokenAddress,
      tokenId: tokenId + 2,
    })

    await Promise.all([
      erc721mock.connect(minter1).mint(FPVaultAddress, tokenData1[1]),
      erc721mock.connect(minter1).mint(FPVaultAddress, tokenData2[1]),
    ])
    await Promise.all([
      conn.addToken(...tokenData),
      conn.addToken(...tokenData1),
      conn.addToken(...tokenData2),
    ])

    const { tokenId: wnftTokenId } = await traces.wnftList(
      tokenAddress,
      tokenData1[1]
    )
    await conn.deleteToken(wnftTokenId)

    await expect(conn.addToken(...tokenData1)).to.not.reverted

    const { ogTokenId } = await traces.wnftList(tokenAddress, tokenData1[1])

    expect(ogTokenId).to.eq(tokenData1[1])
  })
  it('returns error if FP vault is not owner of the sent token', async function () {
    const { erc721mock, minter1, owner, traces } = await loadFixture(
      deployFixtureWith721
    )
    const [tokenId, _, minStake, holdPeriod, multiplier, duration] =
      generateTokenData()
    const conn = traces.connect(owner)

    await erc721mock.connect(minter1).mint(minter1.address, tokenId)

    expect(await erc721mock.ownerOf(tokenId)).to.eq(minter1.address)

    await expect(
      conn.addToken(
        erc721mock.address,
        tokenId,
        minStake,
        holdPeriod,
        multiplier,
        duration
      )
    ).to.revertedWithCustomError(traces, ERROR.NOT_OWNER_OF_TOKEN)
  })
  it('returns error when calling addToken without an erc721 contract address', async function () {
    const { erc721mock, minter1, owner, traces } = await loadFixture(
      deployFixtureWith721
    )
    const data = generateTokenData()

    await erc721mock.connect(minter1).mint(minter1.address, data[1])

    await expect(
      traces.connect(owner).addToken(...data)
    ).to.revertedWithCustomError(traces, ERROR.INVALID_721_CONTRACT)
  })
})

describe('Traces functionality', function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployFixture() {
    // Contracts are deployed using the first signer/account by default
    const [deployer, owner, minter1, staker1, staker2, staker3] =
      await ethers.getSigners()
    const FPVaultAddress = faker.finance.ethereumAddress()
    const amount = 1_000_000
    const baseURI = `${faker.internet.url()}/`

    const ERC721Mock = await ethers.getContractFactory('ERC721Mock')
    const erc721mock = await ERC721Mock.deploy(
      deployer.address,
      'nft',
      'nft',
      minter1.address
    )

    const ERC20Mock = await ethers.getContractFactory('ERC20Mock')
    const erc20mock = await ERC20Mock.deploy(
      deployer.address,
      'prints',
      '$prints',
      ethers.utils.parseUnits(amount.toString(), 18)
    )

    const Traces = await ethers.getContractFactory('Traces')
    const traces = await Traces.deploy()
    await traces.initialize(
      owner.address,
      FPVaultAddress,
      erc20mock.address,
      baseURI
    )

    const tokenData = generateTokenData({
      tokenAddress: erc721mock.address,
      minStake: parseUnits(faker.datatype.number(10_000).toString(), 18),
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
      staker3,
    }
  }
  async function mintAndStake(
    fixture: Awaited<ReturnType<typeof deployFixture>>,
    staker?: SignerWithAddress
  ) {
    const { traces, owner, tokenData, staker1, erc20mock } = fixture
    const [contractAddress, nftId, amount] = tokenData

    await Promise.all([
      traces.connect(owner).addToken(...tokenData),
      erc20mock.connect(staker ?? staker1).approve(traces.address, amount),
    ])
    await traces
      .connect(staker ?? staker1)
      .outbid(contractAddress, nftId, amount)
    return await traces.wnftList(contractAddress, nftId)
  }

  describe('mint()', async function () {
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
      it('user executed allowance lower than needed to stake', async function () {
        const { traces, owner, tokenData, staker1, erc20mock } =
          await loadFixture(deployFixture)
        const [contractAddress, nftId, amount] = tokenData

        await traces.connect(owner).addToken(...tokenData)
        await erc20mock.connect(staker1).approve(traces.address, amount.sub(1))

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
        const [
          contractAddress,
          nftId,
          amount,
          holdPeriod,
          multiplier,
          duration,
        ] = tokenData
        const tracesBalance = await erc20mock.balanceOf(traces.address)

        await Promise.all([
          traces
            .connect(owner)
            .addToken(contractAddress, nftId, amount, 0, multiplier, duration),
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
        const [
          contractAddress,
          nftId,
          amount,
          holdPeriod,
          multiplier,
          duration,
        ] = tokenData
        const userBalance = await erc20mock.balanceOf(staker1.address)

        await Promise.all([
          traces
            .connect(owner)
            .addToken(contractAddress, nftId, amount, 0, multiplier, duration),
          erc20mock.connect(staker1).approve(traces.address, amount),
        ])
        await traces.connect(staker1).outbid(contractAddress, nftId, amount)

        expect(await erc20mock.balanceOf(staker1.address)).to.eq(
          userBalance.sub(amount)
        )
      })
      it('allows user to outbid after hold period', async function () {
        const { traces, owner, tokenData, staker1, erc20mock } =
          await loadFixture(deployFixture)
        const [contractAddress, nftId, amount, _, multiplier, duration] =
          tokenData
        const latestBlockTimestamp = (await time.latest()) * 1000
        // const latestBlockTimestamp = new Date()
        const holdPeriod = dayjs(latestBlockTimestamp).add(2, 'hour')

        await Promise.all([
          traces
            .connect(owner)
            .addToken(
              contractAddress,
              nftId,
              amount,
              holdPeriod.unix(),
              multiplier,
              duration
            ),
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
        const [
          contractAddress,
          nftId,
          amount,
          holdPeriod,
          multiplier,
          duration,
        ] = tokenData
        const latestBlockTimestamp = await time.latest()

        const tx = await traces
          .connect(owner)
          .addToken(
            contractAddress,
            nftId,
            amount,
            latestBlockTimestamp,
            multiplier,
            duration
          )
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

        await traces.connect(owner).addToken(...tokenData)

        await erc20mock.connect(staker1).approve(traces.address, amount)
        await traces.connect(staker1).outbid(contractAddress, nftId, amount)

        latestBlockTimestamp = await time.latest()
        await time.increaseTo(
          dayjs((latestBlockTimestamp + holdPeriod) * 1000).unix()
        )

        const wNFT = await traces.wnftList(contractAddress, nftId)
        const currentPrice = await traces.getWNFTPrice(wNFT.tokenId)
        await erc20mock.connect(staker2).approve(traces.address, currentPrice)
        await traces
          .connect(staker2)
          .outbid(contractAddress, nftId, currentPrice)

        expect(await traces.balanceOf(staker1.address)).to.eq(0)
        expect(await traces.balanceOf(staker2.address)).to.eq(1)
        expect(await traces.ownerOf(wNFT.tokenId)).to.eq(staker2.address)
      })
      it('transfers the wnft from owner when the user is outbidded', async function () {
        const { traces, owner, tokenData, staker1, staker2, erc20mock } =
          await loadFixture(deployFixture)
        const [contractAddress, nftId, amount, holdPeriod] = tokenData
        let latestBlockTimestamp = await time.latest()
        await traces.connect(owner).addToken(...tokenData)

        await erc20mock.connect(staker1).approve(traces.address, amount)
        await traces.connect(staker1).outbid(contractAddress, nftId, amount)

        latestBlockTimestamp = await time.latest()
        await time.increaseTo(
          dayjs((latestBlockTimestamp + holdPeriod) * 1000).unix()
        )
        const wNFT = await traces.wnftList(contractAddress, nftId)
        const currentPrice = await traces.getWNFTPrice(wNFT.tokenId)

        await erc20mock.connect(staker2).approve(traces.address, currentPrice)
        await traces
          .connect(staker2)
          .outbid(contractAddress, nftId, currentPrice)

        expect(await traces.balanceOf(staker1.address)).to.eq(0)
        expect(await traces.balanceOf(staker2.address)).to.eq(1)
        expect(await traces.ownerOf(wNFT.tokenId)).to.eq(staker2.address)
      })
      // test outbid event is emitted
      it('emits an outbid event', async function () {
        const { traces, owner, tokenData, staker1, staker2, erc20mock } =
          await loadFixture(deployFixture)
        const [contractAddress, nftId, amount, holdPeriod] = tokenData
        let latestBlockTimestamp = await time.latest()
        await traces.connect(owner).addToken(...tokenData)

        await erc20mock.connect(staker1).approve(traces.address, amount)
        await traces.connect(staker1).outbid(contractAddress, nftId, amount)

        latestBlockTimestamp = await time.latest()
        await time.increaseTo(
          dayjs((latestBlockTimestamp + holdPeriod) * 1000).unix()
        )
        const wNFT = await traces.wnftList(contractAddress, nftId)
        const currentPrice = await traces.getWNFTPrice(wNFT.tokenId)

        await erc20mock.connect(staker2).approve(traces.address, currentPrice)
        await expect(
          traces.connect(staker2).outbid(contractAddress, nftId, currentPrice)
        )
          .to.emit(traces, 'Outbid')
          .withArgs(
            contractAddress,
            nftId,
            wNFT.tokenId,
            amount,
            currentPrice,
            staker2.address
          )
      })
      it('transfers the erc20 custom token back to the user when the same is outbidded', async function () {
        const { traces, owner, tokenData, staker1, staker2, erc20mock } =
          await loadFixture(deployFixture)
        const [contractAddress, nftId, amount, holdPeriod] = tokenData
        const balanceStaker1 = await erc20mock.balanceOf(staker1.address)
        let latestBlockTimestamp = await time.latest()

        await traces.connect(owner).addToken(...tokenData)

        await erc20mock.connect(staker1).approve(traces.address, amount)
        await traces.connect(staker1).outbid(contractAddress, nftId, amount)

        latestBlockTimestamp = await time.latest()
        await time.increaseTo(
          dayjs((latestBlockTimestamp + holdPeriod) * 1000).unix()
        )
        const wNFT = await traces.wnftList(contractAddress, nftId)
        const currentPrice = await traces.getWNFTPrice(wNFT.tokenId)

        await erc20mock.connect(staker2).approve(traces.address, currentPrice)
        await traces
          .connect(staker2)
          .outbid(contractAddress, nftId, currentPrice)

        expect(await erc20mock.balanceOf(staker1.address)).to.eq(balanceStaker1)
      })
    })
  })
  describe('unstake()', async function () {
    it('returns error if user is not the wnft owner', async function () {
      const fixture = await loadFixture(deployFixture)
      const { traces, staker2, staker3 } = fixture
      const wNFT = await mintAndStake(fixture, staker2)

      await expect(
        traces.connect(staker3).unstake(wNFT.tokenId)
      ).to.revertedWithCustomError(traces, ERROR.NO_PERMISSION)
    })
    it('returns error if user tries to unstake and wnft is on hold period', async function () {
      const fixture = await loadFixture(deployFixture)
      const { traces, staker2 } = fixture
      const wNFT = await mintAndStake(fixture, staker2)

      await expect(
        traces.getWNFTPrice(wNFT.tokenId)
      ).to.revertedWithCustomError(traces, ERROR.HOLD_PERIOD)
      await expect(
        traces.connect(staker2).unstake(wNFT.tokenId)
      ).to.revertedWithCustomError(traces, ERROR.STAKE_LOCKED)
    })
    it('returns error if user tries to unstake and wnft is on dutch auction period', async function () {
      const fixture = await loadFixture(deployFixture)
      const { traces, staker2 } = fixture
      const wNFT = await mintAndStake(fixture, staker2)
      const latestBlockTimestamp = (await time.latest()) * 1000

      await time.increaseTo(
        dayjs(latestBlockTimestamp)
          .add(wNFT.minHoldPeriod.toNumber(), 'second')
          .unix()
      )

      await expect(
        traces.connect(staker2).unstake(wNFT.tokenId)
      ).to.revertedWithCustomError(traces, ERROR.STAKE_LOCKED)
    })
    it('unstakes user $prints and return the wnft', async function () {
      const fixture = await loadFixture(deployFixture)
      const { traces, staker2, erc20mock } = fixture
      const wNFT = await mintAndStake(fixture, staker2)
      const stakedAmount = wNFT.firstStakePrice
      const stakerBalance = await erc20mock.balanceOf(staker2.address)

      const latestBlockTimestamp = (await time.latest()) * 1000

      await time.increaseTo(
        dayjs(latestBlockTimestamp)
          .add(wNFT.minHoldPeriod.toNumber(), 'second')
          .add(wNFT.lastOutbidTimestamp.toNumber(), 'second')
          .unix()
      )
      await traces.connect(staker2).unstake(wNFT.tokenId)

      expect(await traces.balanceOf(staker2.address)).to.eq(0)
      expect(await erc20mock.balanceOf(staker2.address)).to.eq(
        stakerBalance.add(stakedAmount)
      )
    })
    it('unstake user $prints when editor force it and return the wnft[Hold period]', async function () {
      const fixture = await loadFixture(deployFixture)
      const { traces, erc20mock, staker2, staker3, owner } = fixture
      const wNFT = await mintAndStake(fixture, staker2)
      const stakedAmount = wNFT.firstStakePrice
      const stakerBalance = await erc20mock.balanceOf(staker2.address)
      const EDITOR_ROLE = await traces.EDITOR_ROLE()

      await expect(
        traces.getWNFTPrice(wNFT.tokenId)
      ).to.revertedWithCustomError(traces, ERROR.HOLD_PERIOD)

      await traces.connect(owner).grantRole(EDITOR_ROLE, staker3.address)

      await expect(traces.connect(staker3).unstake(wNFT.tokenId)).to.not
        .reverted
      expect(await traces.balanceOf(staker2.address)).to.eq(0)
      expect(await erc20mock.balanceOf(staker2.address)).to.eq(
        stakerBalance.add(stakedAmount)
      )
    })
    it('unstake user $prints when editor force it and return the wnft[Dutch Auction]', async function () {
      const fixture = await loadFixture(deployFixture)
      const { traces, erc20mock, staker2, staker3, owner } = fixture
      const wNFT = await mintAndStake(fixture, staker2)
      const stakedAmount = wNFT.firstStakePrice
      const stakerBalance = await erc20mock.balanceOf(staker2.address)
      const EDITOR_ROLE = await traces.EDITOR_ROLE()

      await expect(
        traces.getWNFTPrice(wNFT.tokenId)
      ).to.revertedWithCustomError(traces, ERROR.HOLD_PERIOD)

      const latestBlockTimestamp = (await time.latest()) * 1000

      await time.increaseTo(
        dayjs(latestBlockTimestamp)
          .add(wNFT.minHoldPeriod.add(100).toNumber(), 'second')
          .unix()
      )

      await traces.connect(owner).grantRole(EDITOR_ROLE, staker3.address)

      await expect(traces.connect(staker3).unstake(wNFT.tokenId)).to.not
        .reverted
      expect(await traces.balanceOf(staker2.address)).to.eq(0)
      expect(await erc20mock.balanceOf(staker2.address)).to.eq(
        stakerBalance.add(stakedAmount)
      )
    })
  })
  describe('dutch auction', async function () {
    // describe('getCurrentPrice()', async function () {
    //   it('gets price after half of dutch auction duration', async function () {
    //     const fixture = await loadFixture(deployFixture)
    //     const { traces } = fixture
    //     const latestBlockTimestamp = (await time.latest()) * 1000
    //     const tokenDecimal = await traces.customTokenDecimals()
    //     const minPrice = tokenDecimal.mul(1)
    //     const dutchMultiplier = 9 // 9 - 1
    //     const lastOutbidTimestamp = dayjs(latestBlockTimestamp)
    //       .subtract(2, 'hour')
    //       .unix()
    //     const duration =
    //       dayjs(latestBlockTimestamp).add(4, 'hour').unix() -
    //       dayjs(latestBlockTimestamp).unix()

    //     const price = (
    //       await traces.getCurrentPrice(
    //         minPrice,
    //         lastOutbidTimestamp,
    //         dutchMultiplier,
    //         duration
    //       )
    //     ).toString()

    //     expect(Number(formatUnits(price))).to.eq(5)
    //   })
    //   it('gets price after 1/3 of dutch auction duration', async function () {
    //     const fixture = await loadFixture(deployFixture)
    //     const { traces } = fixture
    //     const latestBlockTimestamp = (await time.latest()) * 1000
    //     const tokenDecimal = await traces.customTokenDecimals()
    //     const minPrice = tokenDecimal.mul(1)
    //     const dutchMultiplier = 9
    //     const lastOutbidTimestamp = dayjs(latestBlockTimestamp)
    //       .subtract(1, 'hour')
    //       .unix()
    //     const duration =
    //       dayjs(latestBlockTimestamp).add(3, 'hour').unix() -
    //       dayjs(latestBlockTimestamp).unix()

    //     const price = (
    //       await traces.getCurrentPrice(
    //         minPrice,
    //         lastOutbidTimestamp,
    //         dutchMultiplier,
    //         duration
    //       )
    //     ).toString()
    //     expect(Number(formatUnits(price))).to.closeTo(6.33, 0.01)
    //   })
    //   it('gets price limit after 1/2 of dutch auction duration when multiplier is 1', async function () {
    //     const fixture = await loadFixture(deployFixture)
    //     const { traces } = fixture
    //     const latestBlockTimestamp = (await time.latest()) * 1000
    //     const tokenDecimal = await traces.customTokenDecimals()
    //     const minPrice = tokenDecimal.mul(100)
    //     const dutchMultiplier = 1
    //     const lastOutbidTimestamp = dayjs(latestBlockTimestamp)
    //       .subtract(5, 'hour')
    //       .unix()
    //     const duration =
    //       dayjs(latestBlockTimestamp).add(10, 'hour').unix() -
    //       dayjs(latestBlockTimestamp).unix()

    //     // console.log(
    //     //   minPrice.toString(),
    //     //   dutchMultiplier,
    //     //   latestBlockTimestamp / 1000,
    //     //   lastOutbidTimestamp,
    //     //   duration
    //     // )
    //     const price = (
    //       await traces.getCurrentPrice(
    //         minPrice,
    //         lastOutbidTimestamp,
    //         dutchMultiplier,
    //         duration
    //       )
    //     ).toString()
    //     expect(Number(formatUnits(price))).to.equal(100)
    //   })
    // })
    describe('getWNFTPrice()', async function () {
      it('returns error when wnft is on hold period', async function () {
        const fixture = await loadFixture(deployFixture)
        const { traces } = fixture
        const wNFT = await mintAndStake(fixture)

        await expect(
          traces.getWNFTPrice(wNFT.tokenId)
        ).to.revertedWithCustomError(traces, ERROR.HOLD_PERIOD)
      })
      it('returns max price when auction starts', async function () {
        const fixture = await loadFixture(deployFixture)
        const { traces, tokenData } = fixture
        const wNFT = await mintAndStake(fixture)
        const [, , amount, , multiplier] = tokenData
        const latestBlockTimestamp = (await time.latest()) * 1000

        await time.increaseTo(
          dayjs(latestBlockTimestamp)
            .add(wNFT.minHoldPeriod.toNumber(), 'second')
            .unix()
        )
        const price = await traces.getWNFTPrice(wNFT.tokenId)

        expect(price).to.eql(amount.mul(multiplier))
      })
      it('returns lower price when auction ends', async function () {
        const fixture = await loadFixture(deployFixture)
        const { traces, tokenData } = fixture
        const wNFT = await mintAndStake(fixture)
        const [, , amount, , , dutchAuctionDuration] = tokenData
        const latestBlockTimestamp = (await time.latest()) * 1000

        await time.increaseTo(
          dayjs(latestBlockTimestamp)
            .add(wNFT.minHoldPeriod.toNumber(), 'second')
            .add(dutchAuctionDuration, 'second')
            .unix()
        )
        const price = await traces.getWNFTPrice(wNFT.tokenId)

        expect(price).to.eql(amount)
      })
      it('returns half price when auction is in the middle of duration', async function () {
        const fixture = await loadFixture(deployFixture)
        const { traces, tokenData } = fixture
        const wNFT = await mintAndStake(fixture)
        const [, , amount, , multiplier, dutchAuctionDuration] = tokenData
        const latestBlockTimestamp = (await time.latest()) * 1000

        await time.increaseTo(
          dayjs(latestBlockTimestamp)
            .add(wNFT.minHoldPeriod.toNumber(), 'second')
            .add(dutchAuctionDuration / 2, 'second')
            .unix()
        )
        const price = await traces.getWNFTPrice(wNFT.tokenId)

        const newWNFT = await traces.wnftList(
          wNFT.ogTokenAddress,
          wNFT.ogTokenId
        )

        expect(formatUnits(price)).to.eql(
          formatUnits(
            newWNFT.stakedAmount.add(
              newWNFT.stakedAmount
                .mul(multiplier)
                .sub(newWNFT.stakedAmount)
                .div(2)
            )
          )
        )
        // expect(Number(formatUnits(price))).to.eql(
        //   Number(formatUnits(amount.mul(multiplier))) / 2
        // )
      })
      it('returns initial price when wnft is unstaked', async function () {
        const fixture = await loadFixture(deployFixture)
        const { traces, owner, tokenData } = fixture
        const [contractAddress, nftId, amount] = tokenData

        await traces.connect(owner).addToken(...tokenData)

        const wNFT = await traces.wnftList(contractAddress, nftId)
        const price = await traces.getWNFTPrice(wNFT.tokenId)

        expect(Number(formatUnits(price))).to.eql(Number(formatUnits(amount)))
      })
    })
  })
  describe('removeToken(wnftId)', async function () {
    it('returns error when trying to delete a wnft without editor role', async function () {
      const fixture = await loadFixture(deployFixture)
      const { traces, staker2, tokenData, owner } = fixture
      const [contractAddress, nftId] = tokenData

      await traces.connect(owner).addToken(...tokenData)
      const wNFT = await traces.wnftList(contractAddress, nftId)
      const EDITOR_ROLE = await traces.EDITOR_ROLE()

      await expect(
        traces.connect(staker2).deleteToken(wNFT.tokenId)
      ).to.revertedWith(getAccessControlError(staker2.address, EDITOR_ROLE))
    })
    it('returns error when trying to delete staked wnft', async function () {
      const fixture = await loadFixture(deployFixture)
      const { traces, owner } = fixture
      const wNFT = await mintAndStake(fixture)

      await expect(
        traces.connect(owner).deleteToken(wNFT.tokenId)
      ).to.revertedWithCustomError(traces, ERROR.NO_PERMISSION)
    })
    it('removes wnft from wnftList', async function () {
      const fixture = await loadFixture(deployFixture)
      const { traces, owner, tokenData } = fixture
      const [contractAddress, nftId] = tokenData

      await traces.connect(owner).addToken(...tokenData)
      const wNFT = await traces.wnftList(contractAddress, nftId)

      await traces.connect(owner).deleteToken(wNFT.tokenId)

      expect((await traces.wnftList(contractAddress, nftId)).ogTokenId).to.eq(0)
    })
    it('removes wnft from wrappedIdToOgToken', async function () {
      const fixture = await loadFixture(deployFixture)
      const { traces, owner, tokenData } = fixture
      const [contractAddress, nftId] = tokenData

      await traces.connect(owner).addToken(...tokenData)
      const wNFT = await traces.wnftList(contractAddress, nftId)
      await traces.connect(owner).deleteToken(wNFT.tokenId)

      expect((await traces.wrappedIdToOgToken(wNFT.tokenId)).id).to.eq(0)
    })
    it('does not decreases collection.totalMinted', async function () {
      const fixture = await loadFixture(deployFixture)
      const { traces, owner, tokenData } = fixture
      const [contractAddress, nftId] = tokenData

      await traces.connect(owner).addToken(...tokenData)
      const wNFT = await traces.wnftList(contractAddress, nftId)
      const { totalMinted } = await traces.collection(wNFT.ogTokenAddress)
      await traces.connect(owner).deleteToken(wNFT.tokenId)

      expect((await traces.collection(wNFT.ogTokenAddress)).totalMinted).to.eq(
        totalMinted
      )
    })
    it('burns the wnft successfully when it is deleted', async function () {
      const fixture = await loadFixture(deployFixture)
      const { traces, owner, tokenData } = fixture
      const [contractAddress, nftId] = tokenData

      await traces.connect(owner).addToken(...tokenData)
      const oldContractBalance = await traces.balanceOf(traces.address)

      const wNFT = await traces.wnftList(contractAddress, nftId)
      await traces.connect(owner).deleteToken(wNFT.tokenId)

      expect(await traces.balanceOf(traces.address)).to.eq(
        oldContractBalance.sub(1)
      )
    })
    it('deletes a wnft and add another with another id successfuly', async function () {
      const fixture = await loadFixture(deployFixture)
      const { traces, owner, tokenData, erc721mock, FPVaultAddress } = fixture
      const [contractAddress, nftId] = tokenData

      await traces.connect(owner).addToken(...tokenData)
      const { tokenId } = await traces.wnftList(contractAddress, nftId)
      await traces.connect(owner).deleteToken(tokenId)

      const tokenData2 = generateTokenData({
        tokenAddress: erc721mock.address,
      })
      await erc721mock.connect(owner).mint(FPVaultAddress, tokenData2[1]),
        await traces.connect(owner).addToken(...tokenData)
      const { tokenId: tokenId2 } = await traces.wnftList(
        contractAddress,
        nftId
      )

      expect(tokenId2).not.eql(tokenId)
      expect((await traces.balanceOf(traces.address)).toNumber()).to.eq(1)
      expect((await traces.getToken(tokenId2)).ogTokenId.toNumber()).to.eq(
        nftId
      )
    })
  })
  // getUri with proxy string
})
