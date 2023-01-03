import fs from 'fs'
import { task, types } from 'hardhat/config'
import { Contract as EthersContract } from 'ethers'
import promptjs from 'prompt'

promptjs.colors = false
promptjs.message = '> '
promptjs.delimiter = ''

type ContractName = 'ERC20Mock' | 'Traces'

interface Contract {
  args?: (string | number | (() => string | undefined))[]
  instance?: EthersContract
  libraries?: () => Record<string, string>
  waitForConfirmation?: boolean
}

task('deploy', 'Deploy contracts Traces and ERC20Token($prints)')
  .addFlag('autoDeploy', 'Deploy all contracts without user interaction')
  .addOptionalParam(
    'printsAddress',
    'The $prints contract address',
    undefined,
    types.string
  )
  .addOptionalParam(
    'vaultAddress',
    'The dao vault address',
    '0xC9a00DBe060700B881d77BB04983F3961eADcB9e',
    types.string
  )
  .addOptionalParam(
    'adminAddress',
    'The traces admin address',
    '0x13d735A4D5E966b8F7B19Fc2f476BfC25c0fc7Dc',
    types.string
  ) // current to thearod.eth
  .setAction(
    async (
      { vaultAddress, adminAddress, printsAddress, autoDeploy },
      { ethers }
    ) => {
      const network = await ethers.provider.getNetwork()

      if (network.chainId === 31337) {
        console.log(`Invalid chain id. Hardhat chainId was not expected.`)
        return
      }

      const [deployer] = await ethers.getSigners()
      console.log(deployer.address)
      await deployer.getTransactionCount()

      const contracts: Record<ContractName, Contract> = {
        ERC20Mock: !printsAddress
          ? {
              args: [vaultAddress, 'Fingerprint Tokens', '$PRINTS', 1_000_000],
            }
          : {},
        Traces: {
          args: [
            adminAddress,
            vaultAddress,
            () =>
              printsAddress
                ? printsAddress
                : contracts.ERC20Mock?.instance?.address,
            process.env.METADATA_URL ?? '',
          ],
        },
      }

      for (const [name, contract] of Object.entries(contracts)) {
        if (!name || !contract || (contract?.args?.length ?? 0) < 1) continue

        let gasPrice = await ethers.provider.getGasPrice()
        if (!autoDeploy) {
          const gasInGwei = Math.round(
            Number(ethers.utils.formatUnits(gasPrice, 'gwei'))
          )

          console.log(gasInGwei)
          promptjs.start()

          const result = await promptjs.get([
            {
              properties: {
                gasPrice: {
                  type: 'integer',
                  required: true,
                  description: 'Enter a gas price (gwei)',
                  default: gasInGwei,
                },
              },
            },
          ])
          gasPrice = ethers.utils.parseUnits(result.gasPrice.toString(), 'gwei')
        }

        const factory = await ethers.getContractFactory(name, {
          libraries: contract?.libraries?.(),
        })

        const deploymentGas = await factory.signer.estimateGas(
          factory.getDeployTransaction(
            ...(contract.args?.map((a) =>
              typeof a === 'function' ? a() : a
            ) ?? []),
            {
              gasPrice,
            }
          )
        )
        console.log(`Estimated gas to deploy ${name}: ${deploymentGas}`)
        const deploymentCost = deploymentGas.mul(gasPrice)

        console.log(
          `Estimated cost to deploy ${name}: ${ethers.utils.formatUnits(
            deploymentCost,
            'ether'
          )} ETH`
        )

        if (!autoDeploy) {
          const result = await promptjs.get([
            {
              properties: {
                confirm: {
                  pattern: /^(DEPLOY|SKIP|EXIT)$/,
                  description:
                    'Type "DEPLOY" to confirm, "SKIP" to skip this contract, or "EXIT" to exit.',
                },
              },
            },
          ])
          if (result.operation === 'SKIP') {
            console.log(`Skipping ${name} deployment...`)
            continue
          }
          if (result.operation === 'EXIT') {
            console.log('Exiting...')
            return
          }
        }
        console.log(`Deploying ${name}...`)

        const deployedContract = await factory.deploy(
          ...(contract.args?.map((a) => (typeof a === 'function' ? a() : a)) ??
            []),
          {
            gasPrice,
          }
        )

        if (contract.waitForConfirmation) {
          await deployedContract.deployed()
        }

        contracts[name as ContractName].instance = deployedContract

        console.log(`${name} contract deployed to ${deployedContract.address}`)
      }

      if (!fs.existsSync('logs')) {
        fs.mkdirSync('logs')
      }
      fs.writeFileSync(
        'logs/deploy.json',
        JSON.stringify({
          contractAddresses: {
            ERC20Mock: contracts.ERC20Mock.instance?.address ?? printsAddress,
            Traces: contracts.Traces.instance?.address,
          },
        }),
        { flag: 'w' }
      )

      return contracts
    }
  )
