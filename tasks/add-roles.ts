import { task, types } from 'hardhat/config'
import { contractAddresses } from '../logs/deploy-goerli.json'

task('add-roles', 'Add admin and editor roles')
  .addOptionalParam(
    'traces',
    'The `Traces` contract address',
    contractAddresses.Traces,
    types.string
  )
  .setAction(async ({ traces }, { ethers }) => {
    const admin = [
      '0xDd3e9d0eE979E5c1689A18992647312b42d6d8F3', // Shira
      '0x0dAb8FDeFfc501bf080615952Dcd7bf116D5B506', // Igor
      '0x586bc43937c2ec42348cc83acf44ced42fe3d5f7', // Lucas
      '0xfD7c1b12eD5727DAa36600f701c7B418EccF8816', // Lobão
    ]
    const editor = [
      '0x2cCEA256ed55c5E17a75269cE5687A711371b5dD', // Studio
      '0x2aCB6c756A7CCEED16B3742fD60Abad0A644e641', // Lobão
    ]

    // get contract interface
    const nftFactory = await ethers.getContractFactory('Traces')
    // set contract address
    const nftContract = nftFactory.attach(traces)
    const DEFAULT_ADMIN_ROLE = await nftContract.DEFAULT_ADMIN_ROLE()
    const EDITOR_ROLE = await nftContract.EDITOR_ROLE()

    let gasPrice = await ethers.provider.getGasPrice()

    // const promises = []
    for (const address of admin) {
      console.log('Granting admin role to', address)
      await nftContract.grantRole(DEFAULT_ADMIN_ROLE, address, {
        gasPrice,
      })
      console.log('Granted admin role to', address)
    }

    for (const address of [...editor, ...admin]) {
      console.log('Granting editor role to', address)
      await nftContract.grantRole(EDITOR_ROLE, address, {
        gasPrice,
      })
      console.log('Granted editor role to', address)
    }

    console.log('Done')
  })
