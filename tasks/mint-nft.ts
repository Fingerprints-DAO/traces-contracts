import { task, types } from 'hardhat/config'

task('mint-nfts', 'Mints a NFT to be wrapped')
  .addOptionalParam(
    'erc721Mock',
    'The `Mock` contract address',
    '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
    types.string
  )
  .addOptionalParam(
    'mintTo',
    'Mint to address',
    '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
    types.string
  )
  .addOptionalParam('qty', 'Quantity to mint', 10, types.int)
  .setAction(async ({ erc721Mock, mintTo, qty }, { ethers }) => {
    const nftFactory = await ethers.getContractFactory('ERC721Mock')
    const nftContract = nftFactory.attach(erc721Mock)

    await nftContract.testMintMany(mintTo, qty, 10)

    console.log(`NFTs minted from ID: 10 to ${qty.toString()}.`)
  })
