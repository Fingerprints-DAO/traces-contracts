import { task, types } from 'hardhat/config'

task('traces-add-nft', 'Add NFTs to traces')
  .addOptionalParam(
    'traces',
    'The `Traces` contract address',
    '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
    types.string
  )
  .addOptionalParam(
    'ogTokenAddress',
    'ERC721 NFT address',
    '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
    types.string
  )
  .addParam('ogTokenId', 'ERC721 NFT id', 12, types.int)
  .addOptionalParam(
    'minStake',
    'Amount needed to stake of $prints',
    10,
    types.int
  )
  .addOptionalParam('minHoldPeriod', 'Min hold period in ms', 0, types.int)
  .setAction(
    async (
      { traces, ogTokenAddress, ogTokenId, minStake, minHoldPeriod },
      { ethers }
    ) => {
      // get users wallets
      const [deployer] = await ethers.getSigners()
      // get contract interface
      const nftFactory = await ethers.getContractFactory('Traces')
      // set contract address
      const nftContract = nftFactory.attach(traces)
      // connect deployer account and call addToken
      await nftContract
        .connect(deployer)
        .addToken(ogTokenAddress, ogTokenId, minStake, minHoldPeriod)

      const { tokenId, collectionId, minStakeValue, lastOutbidTimestamp } =
        await nftContract.wnftList(ogTokenAddress, ogTokenId) // access the list to get wrapped nft

      console.log(`Token added:`)
      console.table({
        ogTokenAddress,
        ogTokenId,
        tokenId: tokenId.toNumber(),
        collectionId: collectionId.toNumber(),
        minStakeValue: minStakeValue.toNumber(),
        minHoldPeriod,
        lastOutbidTimestamp: lastOutbidTimestamp.toNumber(),
      })
    }
  )