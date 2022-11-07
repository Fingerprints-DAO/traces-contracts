import { task, types } from 'hardhat/config'

task('mint-nfts', 'Mints a NFT to be wrapped')
  .addOptionalParam(
    'erc721Mock',
    'The `Mock` contract address',
    '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
    types.string
  )
  .addOptionalParam(
    'mintTo',
    'Mint to address',
    '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
    types.string
  )
  .addOptionalParam('qty', 'Quantity to mint', 10, types.int)
  .setAction(async ({ erc721Mock, mintTo, qty }, { ethers }) => {
    const nftFactory = await ethers.getContractFactory('ERC721Mock')
    const nftContract = nftFactory.attach(erc721Mock)

    await nftContract.testMintMany(mintTo, qty, 10)

    console.log(`NFTs minted from ID: 10 to ${qty.toString()}.`)
  })
